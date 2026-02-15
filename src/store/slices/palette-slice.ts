import type { StateCreator } from 'zustand';
import type { GameStore } from '../index.ts';
import type { BakeMetadata } from '../../engine/baking/index.ts';
import type { GameboardState } from '../../shared/types/index.ts';
import { generateId } from '../../shared/generate-id.ts';
import { hotReplaceNodes } from '../hot-replace.ts';

/** A completed puzzle node available in the palette */
export interface PuzzleNodeEntry {
  puzzleId: string;
  title: string;
  description: string;
  inputCount: number;
  outputCount: number;
  bakeMetadata: BakeMetadata;
  versionHash: string;
}

/** A user-created utility node available in the palette */
export interface UtilityNodeEntry {
  utilityId: string;
  title: string;
  inputCount: number;
  outputCount: number;
  bakeMetadata: BakeMetadata;
  board: GameboardState;
  versionHash: string;
  /** Per-CP direction layout. CPs 0-2 = left, 3-5 = right. */
  cpLayout?: ('input' | 'output' | 'off')[];
}

export interface PaletteSlice {
  /** Completed puzzle nodes available for placement */
  puzzleNodes: Map<string, PuzzleNodeEntry>;
  /** User-created utility nodes */
  utilityNodes: Map<string, UtilityNodeEntry>;

  /** Add a completed puzzle node to the palette */
  addPuzzleNode: (entry: PuzzleNodeEntry) => void;
  /** Update bake metadata for an existing puzzle node (re-solve) */
  updatePuzzleNode: (puzzleId: string, metadata: BakeMetadata) => void;

  /** Add a utility node to the palette */
  addUtilityNode: (entry: UtilityNodeEntry) => void;
  /** Update metadata and board for an existing utility node */
  updateUtilityNode: (utilityId: string, metadata: BakeMetadata, board: GameboardState) => void;
  /** Delete a utility node from the palette */
  deleteUtilityNode: (utilityId: string) => void;
}

export const createPaletteSlice: StateCreator<GameStore, [], [], PaletteSlice> = (set, get) => ({
  puzzleNodes: new Map(),
  utilityNodes: new Map(),

  addPuzzleNode: (entry) =>
    set((state) => {
      const next = new Map(state.puzzleNodes);
      next.set(entry.puzzleId, { ...entry, versionHash: generateId() });
      return { puzzleNodes: next };
    }),

  updatePuzzleNode: (puzzleId, metadata) =>
    set(() => {
      const state = get();
      const existing = state.puzzleNodes.get(puzzleId);
      if (!existing) return {};
      const newHash = generateId();
      const next = new Map(state.puzzleNodes);
      next.set(puzzleId, { ...existing, bakeMetadata: metadata, versionHash: newHash });

      const replacements = hotReplaceNodes(
        'puzzle:' + puzzleId,
        { inputCount: existing.inputCount, outputCount: existing.outputCount, libraryVersionHash: newHash },
        state.activeBoard,
        state.boardStack,
        state.utilityNodes,
      );

      return { puzzleNodes: next, ...replacements };
    }),

  addUtilityNode: (entry) =>
    set((state) => {
      const next = new Map(state.utilityNodes);
      next.set(entry.utilityId, { ...entry, versionHash: generateId() });
      return { utilityNodes: next };
    }),

  updateUtilityNode: (utilityId, metadata, board) =>
    set(() => {
      const state = get();
      const existing = state.utilityNodes.get(utilityId);
      if (!existing) return {};
      const newHash = generateId();
      const next = new Map(state.utilityNodes);
      next.set(utilityId, {
        ...existing,
        bakeMetadata: metadata,
        board,
        versionHash: newHash,
        inputCount: metadata.inputCount,
        outputCount: metadata.outputCount,
        cpLayout: metadata.cpLayout,
      });

      const replacements = hotReplaceNodes(
        'utility:' + utilityId,
        {
          inputCount: metadata.inputCount,
          outputCount: metadata.outputCount,
          libraryVersionHash: newHash,
          cpLayout: metadata.cpLayout,
        },
        state.activeBoard,
        state.boardStack,
        // Pass the updated utilityNodes map so hot-replace sees the updated board
        next,
      );

      return {
        utilityNodes: replacements.utilityNodes ?? next,
        ...(replacements.activeBoard ? { activeBoard: replacements.activeBoard } : {}),
        ...(replacements.boardStack ? { boardStack: replacements.boardStack } : {}),
      };
    }),

  deleteUtilityNode: (utilityId) =>
    set(() => {
      const state = get();
      if (!state.utilityNodes.has(utilityId)) return {};
      const nodeType = 'utility:' + utilityId;
      const next = new Map(state.utilityNodes);
      next.delete(utilityId);

      const result: Record<string, unknown> = { utilityNodes: next };

      // Cascade: remove instances from activeBoard
      if (state.activeBoard) {
        const patched = removeNodesFromBoard(state.activeBoard, nodeType);
        if (patched) result.activeBoard = patched;
      }

      // Cascade: remove instances from boardStack
      let stackChanged = false;
      const newStack = state.boardStack.map((entry) => {
        const patched = removeNodesFromBoard(entry.board, nodeType);
        if (patched) {
          stackChanged = true;
          return { ...entry, board: patched };
        }
        return entry;
      });
      if (stackChanged) result.boardStack = newStack;

      // Cascade: remove instances from other utility nodes' internal boards
      let utilityChanged = false;
      const newUtility = new Map(next);
      for (const [id, entry] of newUtility) {
        const patched = removeNodesFromBoard(entry.board, nodeType);
        if (patched) {
          newUtility.set(id, { ...entry, board: patched });
          utilityChanged = true;
        }
      }
      if (utilityChanged) result.utilityNodes = newUtility;

      return result;
    }),
});

/** Remove all nodes of the given type from a board, plus any wires connected to them. */
function removeNodesFromBoard(board: GameboardState, nodeType: string): GameboardState | null {
  const removedIds = new Set<string>();
  for (const [id, node] of board.chips) {
    if (node.type === nodeType) removedIds.add(id);
  }
  if (removedIds.size === 0) return null;

  const nodes = new Map(board.chips);
  for (const id of removedIds) nodes.delete(id);

  const paths = board.paths.filter(
    (w) => !removedIds.has(w.source.chipId) && !removedIds.has(w.target.chipId),
  );

  return { ...board, chips: nodes, paths };
}

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
    set((state) => {
      if (!state.utilityNodes.has(utilityId)) return {};
      const next = new Map(state.utilityNodes);
      next.delete(utilityId);
      return { utilityNodes: next };
    }),
});

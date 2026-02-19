import type { StateCreator } from 'zustand';
import type { GameStore } from '../index.ts';
import type { BakeMetadata } from '../../engine/baking/index.ts';
import type { GameboardState } from '../../shared/types/index.ts';
import { generateId } from '../../shared/generate-id.ts';
import { hotReplaceChips } from '../hot-replace.ts';

/** A completed puzzle chip available in the palette */
export interface CraftedPuzzleEntry {
  puzzleId: string;
  title: string;
  description: string;
  socketCount: number;
  plugCount: number;
  bakeMetadata: BakeMetadata;
  versionHash: string;
  /** Saved gameboard state from the player's solution (restored on re-entry) */
  savedBoard?: GameboardState;
}

/** A user-created utility chip available in the palette */
export interface CraftedUtilityEntry {
  utilityId: string;
  title: string;
  socketCount: number;
  plugCount: number;
  bakeMetadata: BakeMetadata;
  board: GameboardState;
  versionHash: string;
  /** Per-CP direction layout. CPs 0-2 = left, 3-5 = right. */
  cpLayout?: ('input' | 'output' | 'off')[];
}

export interface PaletteSlice {
  /** Completed puzzle chips available for placement */
  craftedPuzzles: Map<string, CraftedPuzzleEntry>;
  /** User-created utility chips */
  craftedUtilities: Map<string, CraftedUtilityEntry>;

  /** Add a completed puzzle chip to the palette */
  addCraftedPuzzle: (entry: CraftedPuzzleEntry) => void;
  /** Update bake metadata for an existing puzzle chip (re-solve) */
  updateCraftedPuzzle: (puzzleId: string, metadata: BakeMetadata, savedBoard?: GameboardState) => void;

  /** Add a utility chip to the palette */
  addCraftedUtility: (entry: CraftedUtilityEntry) => void;
  /** Update metadata and board for an existing utility chip */
  updateCraftedUtility: (utilityId: string, metadata: BakeMetadata, board: GameboardState) => void;
  /** Delete a utility chip from the palette */
  deleteCraftedUtility: (utilityId: string) => void;
}

export const createPaletteSlice: StateCreator<GameStore, [], [], PaletteSlice> = (set, get) => ({
  craftedPuzzles: new Map(),
  craftedUtilities: new Map(),

  addCraftedPuzzle: (entry) =>
    set((state) => {
      const next = new Map(state.craftedPuzzles);
      next.set(entry.puzzleId, { ...entry, versionHash: generateId() });
      return { craftedPuzzles: next };
    }),

  updateCraftedPuzzle: (puzzleId, metadata, savedBoard) =>
    set(() => {
      const state = get();
      const existing = state.craftedPuzzles.get(puzzleId);
      if (!existing) return {};
      const newHash = generateId();
      const next = new Map(state.craftedPuzzles);
      next.set(puzzleId, {
        ...existing,
        bakeMetadata: metadata,
        versionHash: newHash,
        ...(savedBoard !== undefined ? { savedBoard } : {}),
      });

      const replacements = hotReplaceChips(
        'puzzle:' + puzzleId,
        { socketCount: existing.socketCount, plugCount: existing.plugCount, libraryVersionHash: newHash },
        state.activeBoard,
        state.boardStack,
        state.craftedUtilities,
      );

      return { craftedPuzzles: next, ...replacements };
    }),

  addCraftedUtility: (entry) =>
    set((state) => {
      const next = new Map(state.craftedUtilities);
      next.set(entry.utilityId, { ...entry, versionHash: generateId() });
      return { craftedUtilities: next };
    }),

  updateCraftedUtility: (utilityId, metadata, board) =>
    set(() => {
      const state = get();
      const existing = state.craftedUtilities.get(utilityId);
      if (!existing) return {};
      const newHash = generateId();
      const next = new Map(state.craftedUtilities);
      next.set(utilityId, {
        ...existing,
        bakeMetadata: metadata,
        board,
        versionHash: newHash,
        socketCount: metadata.socketCount,
        plugCount: metadata.plugCount,
        cpLayout: metadata.cpLayout,
      });

      const replacements = hotReplaceChips(
        'utility:' + utilityId,
        {
          socketCount: metadata.socketCount,
          plugCount: metadata.plugCount,
          libraryVersionHash: newHash,
          cpLayout: metadata.cpLayout,
        },
        state.activeBoard,
        state.boardStack,
        // Pass the updated craftedUtilities map so hot-replace sees the updated board
        next,
      );

      return {
        craftedUtilities: replacements.craftedUtilities ?? next,
        ...(replacements.activeBoard ? { activeBoard: replacements.activeBoard } : {}),
        ...(replacements.boardStack ? { boardStack: replacements.boardStack } : {}),
      };
    }),

  deleteCraftedUtility: (utilityId) =>
    set(() => {
      const state = get();
      if (!state.craftedUtilities.has(utilityId)) return {};
      const chipType = 'utility:' + utilityId;
      const next = new Map(state.craftedUtilities);
      next.delete(utilityId);

      const result: Record<string, unknown> = { craftedUtilities: next };

      // Cascade: remove instances from activeBoard
      if (state.activeBoard) {
        const patched = removeChipsFromBoard(state.activeBoard, chipType);
        if (patched) result.activeBoard = patched;
      }

      // Cascade: remove instances from boardStack
      let stackChanged = false;
      const newStack = state.boardStack.map((entry) => {
        const patched = removeChipsFromBoard(entry.board, chipType);
        if (patched) {
          stackChanged = true;
          return { ...entry, board: patched };
        }
        return entry;
      });
      if (stackChanged) result.boardStack = newStack;

      // Cascade: remove instances from other utility chips' internal boards
      let utilityChanged = false;
      const newUtility = new Map(next);
      for (const [id, entry] of newUtility) {
        const patched = removeChipsFromBoard(entry.board, chipType);
        if (patched) {
          newUtility.set(id, { ...entry, board: patched });
          utilityChanged = true;
        }
      }
      if (utilityChanged) result.craftedUtilities = newUtility;

      return result;
    }),
});

/** Remove all chips of the given type from a board, plus any paths connected to them. */
function removeChipsFromBoard(board: GameboardState, chipType: string): GameboardState | null {
  const removedIds = new Set<string>();
  for (const [id, chip] of board.chips) {
    if (chip.type === chipType) removedIds.add(id);
  }
  if (removedIds.size === 0) return null;

  const chips = new Map(board.chips);
  for (const id of removedIds) chips.delete(id);

  const paths = board.paths.filter(
    (w) => !removedIds.has(w.source.chipId) && !removedIds.has(w.target.chipId),
  );

  return { ...board, chips, paths };
}

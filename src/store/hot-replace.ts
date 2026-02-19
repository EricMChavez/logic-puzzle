import type { GameboardState, ChipState } from '../shared/types/index.ts';
import type { BoardStackEntry } from './slices/navigation-slice.ts';
import type { CraftedUtilityEntry } from './slices/palette-slice.ts';

export interface HotReplacePatch {
  socketCount: number;
  plugCount: number;
  libraryVersionHash: string;
  cpLayout?: ('input' | 'output' | 'off')[];
}

export interface HotReplaceResult {
  activeBoard?: GameboardState;
  boardStack?: BoardStackEntry[];
  craftedUtilities?: Map<string, CraftedUtilityEntry>;
}

function patchChip(chip: ChipState, patch: HotReplacePatch): ChipState {
  return {
    ...chip,
    socketCount: patch.socketCount,
    plugCount: patch.plugCount,
    libraryVersionHash: patch.libraryVersionHash,
    params: {
      ...chip.params,
      ...(patch.cpLayout ? { cpLayout: patch.cpLayout } : {}),
    },
  };
}

function patchBoard(board: GameboardState, chipType: string, patch: HotReplacePatch): GameboardState | null {
  let changed = false;
  const chips = new Map<string, ChipState>();
  for (const [id, chip] of board.chips) {
    if (chip.type === chipType) {
      chips.set(id, patchChip(chip, patch));
      changed = true;
    } else {
      chips.set(id, chip);
    }
  }
  if (!changed) return null;
  return { ...board, chips };
}

/**
 * Traverse all board locations and update chips matching `chipType` with the given patch.
 * Returns only the fields that changed (empty object if no matches found).
 */
export function hotReplaceChips(
  chipType: string,
  patch: HotReplacePatch,
  activeBoard: GameboardState | null,
  boardStack: BoardStackEntry[],
  craftedUtilities: Map<string, CraftedUtilityEntry>,
): HotReplaceResult {
  const result: HotReplaceResult = {};

  // 1. Scan activeBoard
  if (activeBoard) {
    const patched = patchBoard(activeBoard, chipType, patch);
    if (patched) {
      result.activeBoard = patched;
    }
  }

  // 2. Scan boardStack
  let stackChanged = false;
  const newStack: BoardStackEntry[] = [];
  for (const entry of boardStack) {
    const patched = patchBoard(entry.board, chipType, patch);
    if (patched) {
      newStack.push({ ...entry, board: patched });
      stackChanged = true;
    } else {
      newStack.push(entry);
    }
  }
  if (stackChanged) {
    result.boardStack = newStack;
  }

  // 3. Scan utility chip internal boards
  let utilityChanged = false;
  const newUtility = new Map<string, CraftedUtilityEntry>();
  for (const [id, entry] of craftedUtilities) {
    const patched = patchBoard(entry.board, chipType, patch);
    if (patched) {
      newUtility.set(id, { ...entry, board: patched });
      utilityChanged = true;
    } else {
      newUtility.set(id, entry);
    }
  }
  if (utilityChanged) {
    result.craftedUtilities = newUtility;
  }

  return result;
}

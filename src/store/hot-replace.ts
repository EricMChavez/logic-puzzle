import type { GameboardState, NodeState } from '../shared/types/index.ts';
import type { BoardStackEntry } from './slices/navigation-slice.ts';
import type { UtilityNodeEntry } from './slices/palette-slice.ts';

export interface HotReplacePatch {
  inputCount: number;
  outputCount: number;
  libraryVersionHash: string;
  cpLayout?: ('input' | 'output' | 'off')[];
}

export interface HotReplaceResult {
  activeBoard?: GameboardState;
  boardStack?: BoardStackEntry[];
  utilityNodes?: Map<string, UtilityNodeEntry>;
}

function patchNode(node: NodeState, patch: HotReplacePatch): NodeState {
  return {
    ...node,
    inputCount: patch.inputCount,
    outputCount: patch.outputCount,
    libraryVersionHash: patch.libraryVersionHash,
    params: {
      ...node.params,
      ...(patch.cpLayout ? { cpLayout: patch.cpLayout } : {}),
    },
  };
}

function patchBoard(board: GameboardState, nodeType: string, patch: HotReplacePatch): GameboardState | null {
  let changed = false;
  const nodes = new Map<string, NodeState>();
  for (const [id, node] of board.nodes) {
    if (node.type === nodeType) {
      nodes.set(id, patchNode(node, patch));
      changed = true;
    } else {
      nodes.set(id, node);
    }
  }
  if (!changed) return null;
  return { ...board, nodes };
}

/**
 * Traverse all board locations and update nodes matching `nodeType` with the given patch.
 * Returns only the fields that changed (empty object if no matches found).
 */
export function hotReplaceNodes(
  nodeType: string,
  patch: HotReplacePatch,
  activeBoard: GameboardState | null,
  boardStack: BoardStackEntry[],
  utilityNodes: Map<string, UtilityNodeEntry>,
): HotReplaceResult {
  const result: HotReplaceResult = {};

  // 1. Scan activeBoard
  if (activeBoard) {
    const patched = patchBoard(activeBoard, nodeType, patch);
    if (patched) {
      result.activeBoard = patched;
    }
  }

  // 2. Scan boardStack
  let stackChanged = false;
  const newStack: BoardStackEntry[] = [];
  for (const entry of boardStack) {
    const patched = patchBoard(entry.board, nodeType, patch);
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

  // 3. Scan utility node internal boards
  let utilityChanged = false;
  const newUtility = new Map<string, UtilityNodeEntry>();
  for (const [id, entry] of utilityNodes) {
    const patched = patchBoard(entry.board, nodeType, patch);
    if (patched) {
      newUtility.set(id, { ...entry, board: patched });
      utilityChanged = true;
    } else {
      newUtility.set(id, entry);
    }
  }
  if (utilityChanged) {
    result.utilityNodes = newUtility;
  }

  return result;
}

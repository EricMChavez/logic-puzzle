import type { StateCreator } from 'zustand';
import type { GameStore } from '../index.ts';
import type { GameboardState, NodeId } from '../../shared/types/index.ts';
import { gameboardFromBakeMetadata } from '../../puzzle/gameboard-from-metadata.ts';

export interface BoardStackEntry {
  board: GameboardState;
  portConstants: Map<string, number>;
  nodeIdInParent: NodeId;
  readOnly: boolean;
}

export interface ZoomTransition {
  direction: 'in' | 'out';
  snapshot: string;
}

export interface NodeSwap {
  nodeId: NodeId;
  newType: string;
  inputCount: number;
  outputCount: number;
  cpLayout?: ('input' | 'output' | 'off')[];
}

export interface NavigationSlice {
  boardStack: BoardStackEntry[];
  activeBoardReadOnly: boolean;
  navigationDepth: number;
  zoomTransition: ZoomTransition | null;
  editingUtilityId: string | null;
  editingNodeIdInParent: NodeId | null;

  zoomIntoNode: (nodeId: NodeId) => void;
  zoomOut: () => void;
  startZoomTransition: (direction: 'in' | 'out', snapshot: string) => void;
  endZoomTransition: () => void;
  startEditingUtility: (utilityId: string, board: GameboardState, nodeIdInParent?: NodeId) => void;
  finishEditingUtility: (nodeSwap?: NodeSwap) => void;
}

export const createNavigationSlice: StateCreator<GameStore, [], [], NavigationSlice> = (
  set,
  get,
) => ({
  boardStack: [],
  activeBoardReadOnly: false,
  navigationDepth: 0,
  zoomTransition: null,
  editingUtilityId: null,
  editingNodeIdInParent: null,

  startZoomTransition: (direction, snapshot) => {
    set({ zoomTransition: { direction, snapshot } });
  },

  endZoomTransition: () => {
    set({ zoomTransition: null });
  },

  zoomIntoNode: (nodeId) => {
    const state = get();
    if (!state.activeBoard) return;

    const node = state.activeBoard.nodes.get(nodeId);
    if (!node) return;

    let childBoard: GameboardState | null = null;

    if (node.type.startsWith('puzzle:')) {
      const puzzleId = node.type.slice('puzzle:'.length);
      const entry = state.puzzleNodes.get(puzzleId);
      if (!entry) return;
      childBoard = gameboardFromBakeMetadata(puzzleId, entry.bakeMetadata);
    } else if (node.type.startsWith('utility:')) {
      const utilityId = node.type.slice('utility:'.length);
      const entry = state.utilityNodes.get(utilityId);
      if (!entry) return;
      childBoard = gameboardFromBakeMetadata(utilityId, entry.bakeMetadata);
    } else {
      return;
    }

    const stackEntry: BoardStackEntry = {
      board: state.activeBoard,
      portConstants: state.portConstants,
      nodeIdInParent: nodeId,
      readOnly: state.activeBoardReadOnly,
    };

    const newStack = [...state.boardStack, stackEntry];

    set({
      boardStack: newStack,
      activeBoard: childBoard,
      activeBoardId: childBoard.id,
      portConstants: new Map(),
      activeBoardReadOnly: true,
      navigationDepth: newStack.length,
      selectedNodeId: null,
    });
  },

  zoomOut: () => {
    const state = get();
    if (state.boardStack.length === 0) return;

    const newStack = state.boardStack.slice(0, -1);
    const entry = state.boardStack[state.boardStack.length - 1];

    set({
      boardStack: newStack,
      activeBoard: entry.board,
      activeBoardId: entry.board.id,
      portConstants: entry.portConstants,
      activeBoardReadOnly: entry.readOnly,
      navigationDepth: newStack.length,
      selectedNodeId: null,
    });
  },

  startEditingUtility: (utilityId, board, nodeIdInParent?) => {
    const state = get();
    if (!state.activeBoard) return;

    const stackEntry: BoardStackEntry = {
      board: state.activeBoard,
      portConstants: state.portConstants,
      nodeIdInParent: (nodeIdInParent ?? '') as NodeId,
      readOnly: state.activeBoardReadOnly,
    };

    const newStack = [...state.boardStack, stackEntry];

    set({
      boardStack: newStack,
      activeBoard: board,
      activeBoardId: board.id,
      portConstants: new Map(),
      activeBoardReadOnly: false,
      navigationDepth: newStack.length,
      selectedNodeId: null,
      editingUtilityId: utilityId,
      editingNodeIdInParent: (nodeIdInParent ?? null) as NodeId | null,
    });
  },

  finishEditingUtility: (nodeSwap?) => {
    const state = get();
    if (state.boardStack.length === 0) return;

    const newStack = state.boardStack.slice(0, -1);
    const entry = state.boardStack[state.boardStack.length - 1];

    let parentBoard = entry.board;

    // Apply node swap if provided (e.g., custom-blank → utility:id)
    if (nodeSwap) {
      const nodes = new Map(parentBoard.nodes);
      const existing = nodes.get(nodeSwap.nodeId);
      if (existing) {
        nodes.set(nodeSwap.nodeId, {
          ...existing,
          type: nodeSwap.newType,
          inputCount: nodeSwap.inputCount,
          outputCount: nodeSwap.outputCount,
          params: { ...existing.params, ...(nodeSwap.cpLayout ? { cpLayout: nodeSwap.cpLayout } : {}) },
        });
        parentBoard = { ...parentBoard, nodes };
      }
    }

    set({
      boardStack: newStack,
      activeBoard: parentBoard,
      activeBoardId: parentBoard.id,
      portConstants: entry.portConstants,
      activeBoardReadOnly: entry.readOnly,
      navigationDepth: newStack.length,
      selectedNodeId: null,
      editingUtilityId: null,
      editingNodeIdInParent: null,
    });
  },
});

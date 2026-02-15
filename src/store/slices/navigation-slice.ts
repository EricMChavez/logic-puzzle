import type { StateCreator } from 'zustand';
import type { GameStore } from '../index.ts';
import type { GameboardState, NodeId, NodeState } from '../../shared/types/index.ts';
import { gameboardFromBakeMetadata } from '../../puzzle/gameboard-from-metadata.ts';
import { recomputeOccupancy } from '../../shared/grid/index.ts';
import { createDefaultMeterSlots } from './meter-slice.ts';
import { createMotherboard } from '../motherboard.ts';
import type { MeterKey, MeterMode, MeterSlotState } from '../../gameboard/meters/meter-types.ts';
import { meterKey } from '../../gameboard/meters/meter-types.ts';
import { TOTAL_SLOTS } from '../../shared/grid/slot-helpers.ts';
import {
  isUtilitySlotNode,
  getUtilitySlotIndex,
  isBidirectionalCpNode,
  getBidirectionalCpIndex,
  utilitySlotId,
  createUtilitySlotNode,
} from '../../puzzle/connection-point-nodes.ts';
import type { PuzzleNodeEntry, UtilityNodeEntry } from './palette-slice.ts';
import type { PuzzleDefinition } from '../../puzzle/types.ts';

export function computeBreadcrumbs(
  boardStack: BoardStackEntry[],
  puzzleNodes: Map<string, PuzzleNodeEntry>,
  activePuzzle: PuzzleDefinition | null,
  utilityNodes?: Map<string, UtilityNodeEntry>,
): string[] {
  const root = activePuzzle?.title ?? 'Sandbox';
  const segments = [root];

  for (const entry of boardStack) {
    const node = entry.board.chips.get(entry.chipIdInParent);
    if (node && node.type === 'custom-blank') {
      segments.push('New Custom Node');
    } else if (node && node.type.startsWith('puzzle:')) {
      const puzzleId = node.type.slice('puzzle:'.length);
      const title = puzzleNodes.get(puzzleId)?.title ?? puzzleId;
      segments.push(title);
    } else if (node && node.type.startsWith('utility:') && utilityNodes) {
      const utilityId = node.type.slice('utility:'.length);
      const title = utilityNodes.get(utilityId)?.title ?? utilityId;
      segments.push(title);
    } else if (node && node.type.startsWith('menu:')) {
      const menuLabel = (node.params.label as string) ?? node.type.slice('menu:'.length);
      segments.push(menuLabel);
    } else if (entry.chipIdInParent) {
      segments.push(entry.chipIdInParent);
    }
  }

  return segments;
}

export interface BoardStackEntry {
  board: GameboardState;
  portConstants: Map<string, number>;
  chipIdInParent: NodeId;
  readOnly: boolean;
  meterSlots: Map<MeterKey, MeterSlotState>;
  zoomedCrop?: OffscreenCanvas;
}

export interface NodeSwap {
  chipId: NodeId;
  newType: string;
  inputCount: number;
  outputCount: number;
  cpLayout?: ('input' | 'output' | 'off')[];
}

export interface NavigationSlice {
  boardStack: BoardStackEntry[];
  activeBoardReadOnly: boolean;
  navigationDepth: number;
  editingUtilityId: string | null;
  editingNodeIdInParent: NodeId | null;

  zoomIntoNode: (chipId: NodeId) => void;
  zoomIntoMenuNode: (chipId: NodeId) => void;
  zoomOut: () => void;
  startEditingUtility: (utilityId: string, board: GameboardState, chipIdInParent?: NodeId) => void;
  finishEditingUtility: (nodeSwap?: NodeSwap) => void;
}

/**
 * Derive meter slots for utility editing from the board's utility slot nodes.
 * Each slot gets mode = 'input' | 'output' | 'off' based on the board nodes.
 */
function deriveUtilityMeterSlots(board: GameboardState): Map<MeterKey, MeterSlotState> {
  const slots = new Map<MeterKey, MeterSlotState>();

  for (let i = 0; i < TOTAL_SLOTS; i++) {
    const chipId = utilitySlotId(i);
    let mode: MeterMode = 'off';
    if (board.chips.has(chipId)) {
      const node = board.chips.get(chipId)!;
      mode = node.type === 'connection-input' ? 'input' : 'output';
    }
    slots.set(meterKey(i), { mode });
  }

  return slots;
}

/**
 * Migrate a board from old bidir CPs (__cp_bidir_N__) to new utility slots (__cp_utility_N__).
 * If no bidir CPs exist, returns the board unchanged.
 */
function migrateOldBidirCps(board: GameboardState): GameboardState {
  // Check if any old bidir CPs exist
  let hasBidir = false;
  for (const chipId of board.chips.keys()) {
    if (isBidirectionalCpNode(chipId)) {
      hasBidir = true;
      break;
    }
  }
  if (!hasBidir) return board;

  const nodes = new Map<string, NodeState>();

  // Build ID mapping for wire remapping
  const idMap = new Map<string, string>();

  for (const [id, node] of board.chips) {
    if (isBidirectionalCpNode(id)) {
      const cpIndex = getBidirectionalCpIndex(id);
      // Bidir CPs: infer direction from wiring.
      // Output port used (wires source from it) → 'input' (feeds signal into board)
      // Input port used (wires target it) → 'output' (receives signal from board)
      const hasOutgoing = board.paths.some(w => w.source.chipId === id);
      const hasIncoming = board.paths.some(w => w.target.chipId === id);

      let dir: 'input' | 'output';
      if (hasOutgoing) {
        dir = 'input';
      } else if (hasIncoming) {
        dir = 'output';
      } else {
        // Default: left=input, right=output
        dir = cpIndex < 3 ? 'input' : 'output';
      }

      const newNode = createUtilitySlotNode(cpIndex, dir);
      const newNodeId = utilitySlotId(cpIndex);
      idMap.set(id, newNodeId);
      nodes.set(newNodeId, newNode);
    } else {
      nodes.set(id, node);
    }
  }

  // Remap wire references
  const paths = board.paths.map(w => {
    let source = w.source;
    let target = w.target;

    if (idMap.has(w.source.chipId)) {
      source = { ...source, chipId: idMap.get(w.source.chipId)! };
    }
    if (idMap.has(w.target.chipId)) {
      target = { ...target, chipId: idMap.get(w.target.chipId)! };
    }

    return { ...w, source, target };
  });

  return { ...board, chips: nodes, paths };
}

export const createNavigationSlice: StateCreator<GameStore, [], [], NavigationSlice> = (
  set,
  get,
) => ({
  boardStack: [],
  activeBoardReadOnly: false,
  navigationDepth: 0,
  editingUtilityId: null,
  editingNodeIdInParent: null,

  zoomIntoNode: (chipId) => {
    const state = get();
    if (!state.activeBoard) return;

    const node = state.activeBoard.chips.get(chipId);
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

    // Capture crop from current animation state (set during zoom-in trigger)
    const animState = state.zoomTransitionState;
    const zoomedCrop = animState.type === 'capturing' ? animState.zoomedCrop : undefined;

    const stackEntry: BoardStackEntry = {
      board: state.activeBoard,
      portConstants: state.portConstants,
      chipIdInParent: chipId,
      readOnly: state.activeBoardReadOnly,
      meterSlots: state.meterSlots,
      zoomedCrop,
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
      occupancy: recomputeOccupancy(childBoard.chips),
      meterSlots: createDefaultMeterSlots(),
    });
  },

  zoomIntoMenuNode: (chipId) => {
    const state = get();
    if (!state.activeBoard) return;

    // Capture crop from current animation state (set during zoom-in trigger)
    const animState = state.zoomTransitionState;
    const zoomedCrop = animState.type === 'capturing' ? animState.zoomedCrop : undefined;

    const stackEntry: BoardStackEntry = {
      board: state.activeBoard,
      portConstants: state.portConstants,
      chipIdInParent: chipId,
      readOnly: true,
      meterSlots: state.meterSlots,
      zoomedCrop,
    };

    const newStack = [...state.boardStack, stackEntry];

    // Don't set activeBoard here — the caller (menu-navigation.ts) sets it
    set({
      boardStack: newStack,
      navigationDepth: newStack.length,
      selectedNodeId: null,
    });
  },

  zoomOut: () => {
    const state = get();
    if (state.boardStack.length === 0) return;

    const newStack = state.boardStack.slice(0, -1);
    const entry = state.boardStack[state.boardStack.length - 1];

    // If returning to the home board, rebuild it with fresh progression state
    if (entry.board.id === 'motherboard') {
      const freshBoard = createMotherboard(state.completedLevels, state.isLevelUnlocked, state.customPuzzles);
      set({
        boardStack: newStack,
        activeBoard: freshBoard,
        activeBoardId: freshBoard.id,
        portConstants: entry.portConstants,
        activeBoardReadOnly: true,
        navigationDepth: newStack.length,
        selectedNodeId: null,
        occupancy: recomputeOccupancy(freshBoard.chips),
        meterSlots: entry.meterSlots,
      });
      return;
    }

    set({
      boardStack: newStack,
      activeBoard: entry.board,
      activeBoardId: entry.board.id,
      portConstants: entry.portConstants,
      activeBoardReadOnly: entry.readOnly,
      navigationDepth: newStack.length,
      selectedNodeId: null,
      occupancy: recomputeOccupancy(entry.board.chips),
      meterSlots: entry.meterSlots,
    });
  },

  startEditingUtility: (utilityId, board, chipIdInParent?) => {
    const state = get();
    if (!state.activeBoard) return;

    // Capture crop from current animation state (set during zoom-in trigger)
    const animState = state.zoomTransitionState;
    const zoomedCrop = animState.type === 'capturing' ? animState.zoomedCrop : undefined;

    const stackEntry: BoardStackEntry = {
      board: state.activeBoard,
      portConstants: state.portConstants,
      chipIdInParent: (chipIdInParent ?? '') as NodeId,
      readOnly: state.activeBoardReadOnly,
      meterSlots: state.meterSlots,
      zoomedCrop,
    };

    const newStack = [...state.boardStack, stackEntry];

    // Migrate old bidir CPs to utility slot nodes if needed
    const migratedBoard = migrateOldBidirCps(board);

    // Derive meter slots from utility slot nodes on the board
    const utilityMeterSlots = deriveUtilityMeterSlots(migratedBoard);

    set({
      boardStack: newStack,
      activeBoard: migratedBoard,
      activeBoardId: migratedBoard.id,
      portConstants: new Map(),
      activeBoardReadOnly: false,
      navigationDepth: newStack.length,
      selectedNodeId: null,
      editingUtilityId: utilityId,
      editingNodeIdInParent: (chipIdInParent ?? null) as NodeId | null,
      occupancy: recomputeOccupancy(migratedBoard.chips),
      meterSlots: utilityMeterSlots,
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
      const nodes = new Map(parentBoard.chips);
      const existing = nodes.get(nodeSwap.chipId);
      if (existing) {
        nodes.set(nodeSwap.chipId, {
          ...existing,
          type: nodeSwap.newType,
          inputCount: nodeSwap.inputCount,
          outputCount: nodeSwap.outputCount,
          params: { ...existing.params, ...(nodeSwap.cpLayout ? { cpLayout: nodeSwap.cpLayout } : {}) },
        });
        parentBoard = { ...parentBoard, chips: nodes };
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
      occupancy: recomputeOccupancy(parentBoard.chips),
      meterSlots: entry.meterSlots,
    });
  },
});

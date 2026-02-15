import type { StateCreator } from 'zustand';
import type { GameStore } from '../index.ts';
import type { GameboardId, GameboardState, NodeId, NodeState, Wire, NodeRotation } from '../../shared/types/index.ts';
import type { GridPoint } from '../../shared/grid/types.ts';
import { recomputeOccupancy, markNodeOccupied, clearNodeOccupied, createOccupancyGrid } from '../../shared/grid/index.ts';
import { creativeSlotId, utilitySlotId, createUtilitySlotNode } from '../../puzzle/connection-point-nodes.ts';
import type { MeterMode } from '../../gameboard/meters/meter-types.ts';
import { meterKey } from '../../gameboard/meters/meter-types.ts';

export interface GameboardSlice {
  /** The currently active gameboard */
  activeBoard: GameboardState | null;
  /** ID of the active gameboard */
  activeBoardId: GameboardId | null;
  /** Constant values for unconnected input ports. Key: "chipId:portIndex" */
  portConstants: Map<string, number>;
  /** Incremented on structural graph mutations (add/remove node/wire, param change) */
  graphVersion: number;
  /** Incremented only on topology-changing actions (add/remove/move node/wire). NOT incremented by param changes. */
  routingVersion: number;
  /** Occupancy grid (66x36): true = cell occupied by a node bounding box */
  occupancy: boolean[][];

  /** Set the active gameboard */
  setActiveBoard: (board: GameboardState) => void;
  /** Add a node to the active gameboard */
  addNode: (node: NodeState) => void;
  /** Remove a node from the active gameboard */
  removeNode: (chipId: NodeId) => void;
  /** Move a node to a new position (and optionally rotate) */
  moveNode: (chipId: NodeId, newPosition: GridPoint, newRotation?: NodeRotation) => void;
  /** Add a wire to the active gameboard */
  addWire: (wire: Wire) => void;
  /** Remove a wire from the active gameboard */
  removeWire: (wireId: string) => void;
  /** Update parameters on an existing node */
  updateNodeParams: (chipId: NodeId, params: Record<string, number | string | boolean>) => void;
  /** Replace wire array on the active board (preserves portConstants) */
  updateWires: (wires: Wire[]) => void;
  /** Set a constant value for an unconnected input port */
  setPortConstant: (chipId: NodeId, portIndex: number, value: number) => void;
  /** Restore a board and its port constants (used by navigation zoom-out) */
  restoreBoard: (board: GameboardState, portConstants: Map<string, number>) => void;
  /** Update a creative slot node's direction (input/output/off) */
  updateCreativeSlotNode: (slotIndex: number, direction: 'input' | 'output' | 'off') => void;
  /** Add back a creative slot node that was previously removed (for 'off' -> other transition) */
  addCreativeSlotNode: (slotIndex: number, direction: 'input' | 'output') => void;
  /** Batch update node params + port constant in a single set() with one graphVersion bump. Used during knob drag. */
  batchKnobAdjust: (chipId: NodeId, paramKey: string, portIndex: number, value: number) => void;
  /** Toggle a meter slot's mode during utility editing: input→output→off→input. Returns false if blocked by wires. */
  toggleMeterMode: (cpIndex: number) => boolean;
}

export const createGameboardSlice: StateCreator<GameStore, [], [], GameboardSlice> = (set, get) => ({
  activeBoard: null,
  activeBoardId: null,
  portConstants: new Map<string, number>(),
  graphVersion: 0,
  routingVersion: 0,
  occupancy: createOccupancyGrid(),

  setActiveBoard: (board) =>
    set((state) => ({
      activeBoard: board,
      activeBoardId: board.id,
      portConstants: new Map(),
      occupancy: recomputeOccupancy(board.chips),
      graphVersion: state.graphVersion + 1,
      routingVersion: state.routingVersion + 1,
    })),

  addNode: (node) =>
    set((state) => {
      if (!state.activeBoard) return state;
      const nodes = new Map(state.activeBoard.chips);
      nodes.set(node.id, node);
      const occupancy = state.occupancy.map((col) => [...col]);
      markNodeOccupied(occupancy, node);
      return {
        activeBoard: { ...state.activeBoard, chips: nodes },
        graphVersion: state.graphVersion + 1,
        routingVersion: state.routingVersion + 1,
        occupancy,
      };
    }),

  removeNode: (chipId) =>
    set((state) => {
      if (!state.activeBoard) return state;
      const node = state.activeBoard.chips.get(chipId);
      // Locked nodes cannot be deleted
      if (node?.locked) return state;
      const nodes = new Map(state.activeBoard.chips);
      nodes.delete(chipId);
      const wires = state.activeBoard.paths.filter(
        (w) => w.source.chipId !== chipId && w.target.chipId !== chipId
      );
      const occupancy = state.occupancy.map((col) => [...col]);
      if (node) clearNodeOccupied(occupancy, node);
      return {
        activeBoard: { ...state.activeBoard, chips: nodes, paths: wires },
        graphVersion: state.graphVersion + 1,
        routingVersion: state.routingVersion + 1,
        occupancy,
      };
    }),

  moveNode: (chipId, newPosition, newRotation) =>
    set((state) => {
      if (!state.activeBoard) return state;
      const node = state.activeBoard.chips.get(chipId);
      if (!node) return state;

      // Clear old position
      const occupancy = state.occupancy.map((col) => [...col]);
      clearNodeOccupied(occupancy, node);

      // Update node with new position and rotation
      const updatedNode: NodeState = {
        ...node,
        position: newPosition,
        rotation: newRotation ?? node.rotation,
      };

      // Mark new position
      markNodeOccupied(occupancy, updatedNode);

      const nodes = new Map(state.activeBoard.chips);
      nodes.set(chipId, updatedNode);

      return {
        activeBoard: { ...state.activeBoard, chips: nodes },
        graphVersion: state.graphVersion + 1,
        routingVersion: state.routingVersion + 1,
        occupancy,
      };
    }),

  addWire: (wire) =>
    set((state) => {
      if (!state.activeBoard) return state;
      return {
        activeBoard: {
          ...state.activeBoard,
          paths: [...state.activeBoard.paths, wire],
        },
        graphVersion: state.graphVersion + 1,
        routingVersion: state.routingVersion + 1,
      };
    }),

  removeWire: (wireId) =>
    set((state) => {
      if (!state.activeBoard) return state;
      return {
        activeBoard: {
          ...state.activeBoard,
          paths: state.activeBoard.paths.filter((w) => w.id !== wireId),
        },
        graphVersion: state.graphVersion + 1,
        routingVersion: state.routingVersion + 1,
      };
    }),

  updateNodeParams: (chipId, params) =>
    set((state) => {
      if (!state.activeBoard) return state;
      const node = state.activeBoard.chips.get(chipId);
      if (!node) return state;
      const nodes = new Map(state.activeBoard.chips);
      nodes.set(chipId, { ...node, params: { ...node.params, ...params } });
      return {
        activeBoard: { ...state.activeBoard, chips: nodes },
        graphVersion: state.graphVersion + 1,
      };
    }),

  updateWires: (wires) =>
    set((state) => {
      if (!state.activeBoard) return state;
      return {
        activeBoard: { ...state.activeBoard, paths: wires },
      };
    }),

  setPortConstant: (chipId, portIndex, value) =>
    set((state) => {
      const key = `${chipId}:${portIndex}`;
      const portConstants = new Map(state.portConstants);
      portConstants.set(key, value);
      return { portConstants, graphVersion: state.graphVersion + 1 };
    }),

  restoreBoard: (board, portConstants) =>
    set((state) => ({
      activeBoard: board,
      activeBoardId: board.id,
      portConstants,
      occupancy: recomputeOccupancy(board.chips),
      graphVersion: state.graphVersion + 1,
      routingVersion: state.routingVersion + 1,
    })),

  updateCreativeSlotNode: (slotIndex, direction) =>
    set((state) => {
      if (!state.activeBoard) return state;
      const chipId = creativeSlotId(slotIndex);
      const existingNode = state.activeBoard.chips.get(chipId);

      const nodes = new Map(state.activeBoard.chips);
      const occupancy = state.occupancy.map((col) => [...col]);

      // Handle 'off' direction: remove the node
      if (direction === 'off') {
        if (existingNode) {
          nodes.delete(chipId);
          clearNodeOccupied(occupancy, existingNode);
        }
        return {
          activeBoard: { ...state.activeBoard, chips: nodes },
          graphVersion: state.graphVersion + 1,
          routingVersion: state.routingVersion + 1,
          occupancy,
        };
      }

      // For input/output: update existing node
      if (!existingNode) return state;
      nodes.set(chipId, {
        ...existingNode,
        type: direction === 'input' ? 'connection-input' : 'connection-output',
        inputCount: direction === 'input' ? 0 : 1,
        outputCount: direction === 'input' ? 1 : 0,
      });
      return {
        activeBoard: { ...state.activeBoard, chips: nodes },
        graphVersion: state.graphVersion + 1,
        routingVersion: state.routingVersion + 1,
      };
    }),

  addCreativeSlotNode: (slotIndex, direction) =>
    set((state) => {
      if (!state.activeBoard) return state;
      const chipId = creativeSlotId(slotIndex);

      // Don't add if already exists
      if (state.activeBoard.chips.has(chipId)) return state;

      // Import the node creation function dynamically to avoid circular imports
      // For now, create a minimal node structure
      const node: NodeState = {
        id: chipId,
        type: direction === 'input' ? 'connection-input' : 'connection-output',
        position: { col: slotIndex < 3 ? 0 : 60, row: 6 + slotIndex % 3 * 10 },
        rotation: 0,
        inputCount: direction === 'input' ? 0 : 1,
        outputCount: direction === 'input' ? 1 : 0,
        width: 3,
        height: 2,
        params: {},
      };

      const nodes = new Map(state.activeBoard.chips);
      nodes.set(chipId, node);
      const occupancy = state.occupancy.map((col) => [...col]);
      markNodeOccupied(occupancy, node);

      return {
        activeBoard: { ...state.activeBoard, chips: nodes },
        graphVersion: state.graphVersion + 1,
        routingVersion: state.routingVersion + 1,
        occupancy,
      };
    }),

  toggleMeterMode: (cpIndex) => {
    const state = get();
    if (!state.activeBoard) return false;

    const chipId = utilitySlotId(cpIndex);

    // Check if any wires connect to this CP — block toggle if so
    const hasWires = state.activeBoard.paths.some(
      (w) => w.source.chipId === chipId || w.target.chipId === chipId,
    );
    if (hasWires) return false;

    // Read current mode from meter slot (flat slot index key)
    const key = meterKey(cpIndex);
    const slot = state.meterSlots.get(key);
    const currentMode: MeterMode = slot?.mode ?? 'off';

    const nextModeMap: Record<string, MeterMode> = {
      input: 'output',
      output: 'off',
      off: 'input',
    };
    const nextMode = nextModeMap[currentMode] ?? 'input';

    // Update meter slot
    const slots = new Map(state.meterSlots);
    slots.set(key, { mode: nextMode });

    // Update board nodes
    const nodes = new Map(state.activeBoard.chips);
    if (nodes.has(chipId)) {
      nodes.delete(chipId);
    }
    if (nextMode === 'input' || nextMode === 'output') {
      const newNode = createUtilitySlotNode(cpIndex, nextMode);
      nodes.set(newNode.id, newNode);
    }

    set({
      activeBoard: { ...state.activeBoard, chips: nodes },
      meterSlots: slots,
      graphVersion: state.graphVersion + 1,
      routingVersion: state.routingVersion + 1,
    });

    return true;
  },

  batchKnobAdjust: (chipId, paramKey, portIndex, value) =>
    set((state) => {
      if (!state.activeBoard) return state;
      const node = state.activeBoard.chips.get(chipId);
      if (!node) return state;
      const nodes = new Map(state.activeBoard.chips);
      nodes.set(chipId, { ...node, params: { ...node.params, [paramKey]: value } });
      const key = `${chipId}:${portIndex}`;
      const portConstants = new Map(state.portConstants);
      portConstants.set(key, value);
      return {
        activeBoard: { ...state.activeBoard, chips: nodes },
        portConstants,
        graphVersion: state.graphVersion + 1,
      };
    }),
});

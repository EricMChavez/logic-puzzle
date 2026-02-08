import type { StateCreator } from 'zustand';
import type { GameboardId, GameboardState, NodeId, NodeState, Wire, NodeRotation } from '../../shared/types/index.ts';
import type { GridPoint } from '../../shared/grid/types.ts';
import { recomputeOccupancy, markNodeOccupied, clearNodeOccupied, createOccupancyGrid } from '../../shared/grid/index.ts';
import { creativeSlotId } from '../../puzzle/connection-point-nodes.ts';

export interface GameboardSlice {
  /** The currently active gameboard */
  activeBoard: GameboardState | null;
  /** ID of the active gameboard */
  activeBoardId: GameboardId | null;
  /** Constant values for unconnected input ports. Key: "nodeId:portIndex" */
  portConstants: Map<string, number>;
  /** Incremented on structural graph mutations (add/remove node/wire, param change) */
  graphVersion: number;
  /** Occupancy grid (66x36): true = cell occupied by a node bounding box */
  occupancy: boolean[][];

  /** Set the active gameboard */
  setActiveBoard: (board: GameboardState) => void;
  /** Add a node to the active gameboard */
  addNode: (node: NodeState) => void;
  /** Remove a node from the active gameboard */
  removeNode: (nodeId: NodeId) => void;
  /** Move a node to a new position (and optionally rotate) */
  moveNode: (nodeId: NodeId, newPosition: GridPoint, newRotation?: NodeRotation) => void;
  /** Add a wire to the active gameboard */
  addWire: (wire: Wire) => void;
  /** Remove a wire from the active gameboard */
  removeWire: (wireId: string) => void;
  /** Update parameters on an existing node */
  updateNodeParams: (nodeId: NodeId, params: Record<string, number | string | boolean>) => void;
  /** Replace wire array on the active board (preserves portConstants) */
  updateWires: (wires: Wire[]) => void;
  /** Set a constant value for an unconnected input port */
  setPortConstant: (nodeId: NodeId, portIndex: number, value: number) => void;
  /** Restore a board and its port constants (used by navigation zoom-out) */
  restoreBoard: (board: GameboardState, portConstants: Map<string, number>) => void;
  /** Update a creative slot node's direction (input/output/off) */
  updateCreativeSlotNode: (slotIndex: number, direction: 'input' | 'output' | 'off') => void;
  /** Add back a creative slot node that was previously removed (for 'off' -> other transition) */
  addCreativeSlotNode: (slotIndex: number, direction: 'input' | 'output') => void;
}

export const createGameboardSlice: StateCreator<GameboardSlice> = (set) => ({
  activeBoard: null,
  activeBoardId: null,
  portConstants: new Map<string, number>(),
  graphVersion: 0,
  occupancy: createOccupancyGrid(),

  setActiveBoard: (board) =>
    set({
      activeBoard: board,
      activeBoardId: board.id,
      portConstants: new Map(),
      occupancy: recomputeOccupancy(board.nodes),
    }),

  addNode: (node) =>
    set((state) => {
      if (!state.activeBoard) return state;
      const nodes = new Map(state.activeBoard.nodes);
      nodes.set(node.id, node);
      const occupancy = state.occupancy.map((col) => [...col]);
      markNodeOccupied(occupancy, node);
      return {
        activeBoard: { ...state.activeBoard, nodes },
        graphVersion: state.graphVersion + 1,
        occupancy,
      };
    }),

  removeNode: (nodeId) =>
    set((state) => {
      if (!state.activeBoard) return state;
      const node = state.activeBoard.nodes.get(nodeId);
      const nodes = new Map(state.activeBoard.nodes);
      nodes.delete(nodeId);
      const wires = state.activeBoard.wires.filter(
        (w) => w.source.nodeId !== nodeId && w.target.nodeId !== nodeId
      );
      const occupancy = state.occupancy.map((col) => [...col]);
      if (node) clearNodeOccupied(occupancy, node);
      return {
        activeBoard: { ...state.activeBoard, nodes, wires },
        graphVersion: state.graphVersion + 1,
        occupancy,
      };
    }),

  moveNode: (nodeId, newPosition, newRotation) =>
    set((state) => {
      if (!state.activeBoard) return state;
      const node = state.activeBoard.nodes.get(nodeId);
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

      const nodes = new Map(state.activeBoard.nodes);
      nodes.set(nodeId, updatedNode);

      return {
        activeBoard: { ...state.activeBoard, nodes },
        graphVersion: state.graphVersion + 1,
        occupancy,
      };
    }),

  addWire: (wire) =>
    set((state) => {
      if (!state.activeBoard) return state;
      return {
        activeBoard: {
          ...state.activeBoard,
          wires: [...state.activeBoard.wires, wire],
        },
        graphVersion: state.graphVersion + 1,
      };
    }),

  removeWire: (wireId) =>
    set((state) => {
      if (!state.activeBoard) return state;
      return {
        activeBoard: {
          ...state.activeBoard,
          wires: state.activeBoard.wires.filter((w) => w.id !== wireId),
        },
        graphVersion: state.graphVersion + 1,
      };
    }),

  updateNodeParams: (nodeId, params) =>
    set((state) => {
      if (!state.activeBoard) return state;
      const node = state.activeBoard.nodes.get(nodeId);
      if (!node) return state;
      const nodes = new Map(state.activeBoard.nodes);
      nodes.set(nodeId, { ...node, params: { ...node.params, ...params } });
      return {
        activeBoard: { ...state.activeBoard, nodes },
        graphVersion: state.graphVersion + 1,
      };
    }),

  updateWires: (wires) =>
    set((state) => {
      if (!state.activeBoard) return state;
      return {
        activeBoard: { ...state.activeBoard, wires },
      };
    }),

  setPortConstant: (nodeId, portIndex, value) =>
    set((state) => {
      const key = `${nodeId}:${portIndex}`;
      const portConstants = new Map(state.portConstants);
      portConstants.set(key, value);
      return { portConstants, graphVersion: state.graphVersion + 1 };
    }),

  restoreBoard: (board, portConstants) =>
    set({
      activeBoard: board,
      activeBoardId: board.id,
      portConstants,
      occupancy: recomputeOccupancy(board.nodes),
    }),

  updateCreativeSlotNode: (slotIndex, direction) =>
    set((state) => {
      if (!state.activeBoard) return state;
      const nodeId = creativeSlotId(slotIndex);
      const existingNode = state.activeBoard.nodes.get(nodeId);

      const nodes = new Map(state.activeBoard.nodes);
      const occupancy = state.occupancy.map((col) => [...col]);

      // Handle 'off' direction: remove the node
      if (direction === 'off') {
        if (existingNode) {
          nodes.delete(nodeId);
          clearNodeOccupied(occupancy, existingNode);
        }
        return {
          activeBoard: { ...state.activeBoard, nodes },
          graphVersion: state.graphVersion + 1,
          occupancy,
        };
      }

      // For input/output: update existing node
      if (!existingNode) return state;
      nodes.set(nodeId, {
        ...existingNode,
        type: direction === 'input' ? 'connection-input' : 'connection-output',
        inputCount: direction === 'input' ? 0 : 1,
        outputCount: direction === 'input' ? 1 : 0,
      });
      return {
        activeBoard: { ...state.activeBoard, nodes },
        graphVersion: state.graphVersion + 1,
      };
    }),

  addCreativeSlotNode: (slotIndex, direction) =>
    set((state) => {
      if (!state.activeBoard) return state;
      const nodeId = creativeSlotId(slotIndex);

      // Don't add if already exists
      if (state.activeBoard.nodes.has(nodeId)) return state;

      // Import the node creation function dynamically to avoid circular imports
      // For now, create a minimal node structure
      const node: NodeState = {
        id: nodeId,
        type: direction === 'input' ? 'connection-input' : 'connection-output',
        position: { col: slotIndex < 3 ? 0 : 60, row: 6 + slotIndex % 3 * 10 },
        rotation: 0,
        inputCount: direction === 'input' ? 0 : 1,
        outputCount: direction === 'input' ? 1 : 0,
        width: 3,
        height: 2,
        params: {},
      };

      const nodes = new Map(state.activeBoard.nodes);
      nodes.set(nodeId, node);
      const occupancy = state.occupancy.map((col) => [...col]);
      markNodeOccupied(occupancy, node);

      return {
        activeBoard: { ...state.activeBoard, nodes },
        graphVersion: state.graphVersion + 1,
        occupancy,
      };
    }),
});

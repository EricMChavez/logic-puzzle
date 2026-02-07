import type { StateCreator } from 'zustand';
import type { GameStore } from '../index.ts';
import { getPortGridAnchor, getPortWireDirection, findPath } from '../../shared/routing/index.ts';
import { createOccupancyGrid, mergeOccupancy } from '../../shared/grid/index.ts';
import { GRID_COLS, GRID_ROWS } from '../../shared/grid/index.ts';

export interface RoutingSlice {
  /** Compute A* paths for all wires on the active board */
  routeAllWires: () => void;
}

export const createRoutingSlice: StateCreator<GameStore, [], [], RoutingSlice> = (_set, get) => ({
  routeAllWires: () => {
    const state = get();
    if (!state.activeBoard) return;

    const { nodes, wires } = state.activeBoard;
    const { occupancy } = state;

    // Transient wire occupancy for collision avoidance
    const wireOccupancy = createOccupancyGrid();

    const updatedWires = wires.map((wire) => {
      const sourceNode = nodes.get(wire.source.nodeId);
      const targetNode = nodes.get(wire.target.nodeId);
      if (!sourceNode || !targetNode) return wire;

      const sourceAnchor = getPortGridAnchor(
        sourceNode, wire.source.side, wire.source.portIndex,
      );
      const targetAnchor = getPortGridAnchor(
        targetNode, wire.target.side, wire.target.portIndex,
      );

      // Get wire directions based on node rotations
      const startDir = getPortWireDirection(sourceNode, wire.source.side);
      const endDir = getPortWireDirection(targetNode, wire.target.side);

      // Try routing with combined node + wire occupancy for collision avoidance
      const combined = mergeOccupancy(occupancy, wireOccupancy);
      let path = findPath(sourceAnchor, targetAnchor, combined, startDir, endDir);

      // Fallback: if collision-aware routing fails, use node-only occupancy
      if (!path) {
        path = findPath(sourceAnchor, targetAnchor, occupancy, startDir, endDir);
      }

      // Mark this wire's path cells in wireOccupancy for subsequent wires
      if (path) {
        for (const pt of path) {
          if (pt.col >= 0 && pt.col < GRID_COLS && pt.row >= 0 && pt.row < GRID_ROWS) {
            wireOccupancy[pt.col][pt.row] = true;
          }
        }
      }

      return { ...wire, path: path ?? [] };
    });

    state.updateWires(updatedWires);
  },
});

/**
 * Subscribe to structural changes and re-route all wires automatically.
 * Triggers on graphVersion changes (node/wire add/remove) and board switches.
 */
export function initRouting(store: {
  getState(): GameStore;
  subscribe(listener: (state: GameStore, prev: GameStore) => void): () => void;
}): void {
  store.subscribe((state, prev) => {
    // Re-route after board switch
    if (state.activeBoardId !== prev.activeBoardId && state.activeBoard) {
      store.getState().routeAllWires();
      return;
    }

    // Re-route after structural change (node/wire add/remove/param change)
    if (state.graphVersion !== prev.graphVersion && state.activeBoard) {
      store.getState().routeAllWires();
    }
  });
}

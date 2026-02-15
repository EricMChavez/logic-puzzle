import { describe, it, expect, vi } from 'vitest';
import { createRoutingSlice, initRouting } from './routing-slice.ts';
import type { RoutingSlice } from './routing-slice.ts';
import { createOccupancyGrid } from '../../shared/grid/occupancy.ts';
import type { GameboardState, Wire, NodeState } from '../../shared/types/index.ts';
import { createWire } from '../../shared/types/index.ts';

function makeNode(id: string, col: number, row: number, inputCount = 1, outputCount = 1): NodeState {
  return { id, type: 'invert', position: { col, row }, params: {}, inputCount, outputCount };
}

/**
 * Minimal harness that provides the gameboard state needed by routeAllWires.
 * Returns the routing slice with a spy on updateWires.
 */
function createTestHarness(board: GameboardState | null = null) {
  const occupancy = board ? (() => {
    const g = createOccupancyGrid();
    // Just create an empty grid; nodes placed in playable area
    return g;
  })() : createOccupancyGrid();

  let currentWires = board?.paths ?? [];
  const updateWiresSpy = vi.fn((paths: Wire[]) => {
    currentWires = paths;
  });

  const fakeStore = {
    activeBoard: board,
    activeBoardId: board?.id ?? null,
    occupancy,
    updateWires: updateWiresSpy,
  };

  let state: RoutingSlice = {} as RoutingSlice;
  const set = (partial: Partial<RoutingSlice> | ((s: RoutingSlice) => Partial<RoutingSlice>)) => {
    const update = typeof partial === 'function' ? partial(state) : partial;
    state = { ...state, ...update };
  };
  const get = () => ({ ...state, ...fakeStore } as any);
  state = (createRoutingSlice as Function)(set, get, { setState: set, getState: get, subscribe: () => () => {} });

  return {
    get: () => state,
    actions: state,
    updateWiresSpy,
    getWires: () => currentWires,
    fakeStore,
  };
}

describe('routing-slice', () => {
  it('routeAllWires does nothing when no active board', () => {
    const { actions, updateWiresSpy } = createTestHarness(null);
    actions.routeAllWires();
    expect(updateWiresSpy).not.toHaveBeenCalled();
  });

  it('routeAllWires computes paths for wires between nodes', () => {
    const nodeA = makeNode('a', 12, 8);
    const nodeB = makeNode('b', 25, 8);
    const wire = createWire('w1', { chipId: 'a', portIndex: 0, side: 'output' }, { chipId: 'b', portIndex: 0, side: 'input' });
    const board: GameboardState = {
      id: 'test-board',
      chips: new Map([['a', nodeA], ['b', nodeB]]),
      paths: [wire],
    };

    const { actions, updateWiresSpy, getWires } = createTestHarness(board);
    actions.routeAllWires();

    expect(updateWiresSpy).toHaveBeenCalledTimes(1);
    const routed = getWires();
    expect(routed.length).toBe(1);
    expect(routed[0].route.length).toBeGreaterThan(0);
    // Path should start at source node's right grid line and end at target node's left grid line
    expect(routed[0].route[0].col).toBe(12 + 3); // node.col + NODE_GRID_COLS (right grid line)
    const lastPt = routed[0].route[routed[0].route.length - 1];
    expect(lastPt.col).toBe(25); // target node.col (left grid line)
  });

  it('routeAllWires preserves wire id and source/target', () => {
    const nodeA = makeNode('a', 12, 8);
    const nodeB = makeNode('b', 25, 8);
    const wire = createWire('w1', { chipId: 'a', portIndex: 0, side: 'output' }, { chipId: 'b', portIndex: 0, side: 'input' });
    const board: GameboardState = {
      id: 'test-board',
      chips: new Map([['a', nodeA], ['b', nodeB]]),
      paths: [wire],
    };

    const { actions, getWires } = createTestHarness(board);
    actions.routeAllWires();

    const routed = getWires();
    expect(routed[0].id).toBe('w1');
    expect(routed[0].source.chipId).toBe('a');
    expect(routed[0].target.chipId).toBe('b');
  });

  it('routeAllWires sets empty path when routing fails', () => {
    // Place nodes with a wall between them
    const nodeA = makeNode('a', 12, 8);
    const nodeB = makeNode('b', 30, 8);
    const wire = createWire('w1', { chipId: 'a', portIndex: 0, side: 'output' }, { chipId: 'b', portIndex: 0, side: 'input' });
    const board: GameboardState = {
      id: 'test-board',
      chips: new Map([['a', nodeA], ['b', nodeB]]),
      paths: [wire],
    };

    const harness = createTestHarness(board);
    // Block the entire corridor between source and target
    for (let c = 16; c <= 29; c++) {
      for (let r = 0; r < 18; r++) {
        harness.fakeStore.occupancy[c][r] = true;
      }
    }
    harness.actions.routeAllWires();
    expect(harness.getWires()[0].route).toEqual([]);
  });
});

describe('initRouting', () => {
  it('calls routeAllWires when routingVersion changes', () => {
    const routeAllWiresSpy = vi.fn();
    let listener: ((state: any, prev: any) => void) | null = null;

    const mockStore = {
      getState: () => ({ routeAllWires: routeAllWiresSpy }),
      subscribe: (fn: (state: any, prev: any) => void) => {
        listener = fn;
        return () => {};
      },
    };

    initRouting(mockStore as any);
    expect(listener).not.toBeNull();

    // Simulate routingVersion change with active board (topology change)
    listener!(
      { routingVersion: 2, activeBoardId: 'b1', activeBoard: {} },
      { routingVersion: 1, activeBoardId: 'b1', activeBoard: {} },
    );
    expect(routeAllWiresSpy).toHaveBeenCalledTimes(1);
  });

  it('does not call routeAllWires when only graphVersion changes (param update)', () => {
    const routeAllWiresSpy = vi.fn();
    let listener: ((state: any, prev: any) => void) | null = null;

    const mockStore = {
      getState: () => ({ routeAllWires: routeAllWiresSpy }),
      subscribe: (fn: (state: any, prev: any) => void) => {
        listener = fn;
        return () => {};
      },
    };

    initRouting(mockStore as any);

    // graphVersion changes but routingVersion stays the same (e.g. knob adjust)
    listener!(
      { graphVersion: 5, routingVersion: 1, activeBoardId: 'b1', activeBoard: {} },
      { graphVersion: 4, routingVersion: 1, activeBoardId: 'b1', activeBoard: {} },
    );
    expect(routeAllWiresSpy).not.toHaveBeenCalled();
  });

  it('calls routeAllWires when activeBoardId changes', () => {
    const routeAllWiresSpy = vi.fn();
    let listener: ((state: any, prev: any) => void) | null = null;

    const mockStore = {
      getState: () => ({ routeAllWires: routeAllWiresSpy }),
      subscribe: (fn: (state: any, prev: any) => void) => {
        listener = fn;
        return () => {};
      },
    };

    initRouting(mockStore as any);

    listener!(
      { graphVersion: 1, activeBoardId: 'b2', activeBoard: {} },
      { graphVersion: 1, activeBoardId: 'b1', activeBoard: {} },
    );
    expect(routeAllWiresSpy).toHaveBeenCalledTimes(1);
  });

  it('does not call routeAllWires when nothing changes', () => {
    const routeAllWiresSpy = vi.fn();
    let listener: ((state: any, prev: any) => void) | null = null;

    const mockStore = {
      getState: () => ({ routeAllWires: routeAllWiresSpy }),
      subscribe: (fn: (state: any, prev: any) => void) => {
        listener = fn;
        return () => {};
      },
    };

    initRouting(mockStore as any);

    listener!(
      { graphVersion: 1, activeBoardId: 'b1', activeBoard: {} },
      { graphVersion: 1, activeBoardId: 'b1', activeBoard: {} },
    );
    expect(routeAllWiresSpy).not.toHaveBeenCalled();
  });
});

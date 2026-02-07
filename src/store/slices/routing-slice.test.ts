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

  let currentWires = board?.wires ?? [];
  const updateWiresSpy = vi.fn((wires: Wire[]) => {
    currentWires = wires;
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
    const wire = createWire('w1', { nodeId: 'a', portIndex: 0, side: 'output' }, { nodeId: 'b', portIndex: 0, side: 'input' });
    const board: GameboardState = {
      id: 'test-board',
      nodes: new Map([['a', nodeA], ['b', nodeB]]),
      wires: [wire],
    };

    const { actions, updateWiresSpy, getWires } = createTestHarness(board);
    actions.routeAllWires();

    expect(updateWiresSpy).toHaveBeenCalledTimes(1);
    const routed = getWires();
    expect(routed.length).toBe(1);
    expect(routed[0].path.length).toBeGreaterThan(0);
    // Path should start near source and end near target
    expect(routed[0].path[0].col).toBe(12 + 3); // node.col + NODE_GRID_COLS
    const lastPt = routed[0].path[routed[0].path.length - 1];
    expect(lastPt.col).toBe(25 - 1); // target node.col - 1
  });

  it('routeAllWires preserves wire id and signal buffer', () => {
    const nodeA = makeNode('a', 12, 8);
    const nodeB = makeNode('b', 25, 8);
    const wire = createWire('w1', { nodeId: 'a', portIndex: 0, side: 'output' }, { nodeId: 'b', portIndex: 0, side: 'input' });
    wire.signalBuffer[0] = 42;
    wire.writeHead = 5;
    const board: GameboardState = {
      id: 'test-board',
      nodes: new Map([['a', nodeA], ['b', nodeB]]),
      wires: [wire],
    };

    const { actions, getWires } = createTestHarness(board);
    actions.routeAllWires();

    const routed = getWires();
    expect(routed[0].id).toBe('w1');
    expect(routed[0].signalBuffer[0]).toBe(42);
    expect(routed[0].writeHead).toBe(5);
  });

  it('routeAllWires sets empty path when routing fails', () => {
    // Place nodes with a wall between them
    const nodeA = makeNode('a', 12, 8);
    const nodeB = makeNode('b', 30, 8);
    const wire = createWire('w1', { nodeId: 'a', portIndex: 0, side: 'output' }, { nodeId: 'b', portIndex: 0, side: 'input' });
    const board: GameboardState = {
      id: 'test-board',
      nodes: new Map([['a', nodeA], ['b', nodeB]]),
      wires: [wire],
    };

    const harness = createTestHarness(board);
    // Block the entire corridor between source and target
    for (let c = 16; c <= 29; c++) {
      for (let r = 0; r < 18; r++) {
        harness.fakeStore.occupancy[c][r] = true;
      }
    }
    harness.actions.routeAllWires();
    expect(harness.getWires()[0].path).toEqual([]);
  });
});

describe('initRouting', () => {
  it('calls routeAllWires when graphVersion changes', () => {
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

    // Simulate graphVersion change with active board
    listener!(
      { graphVersion: 2, activeBoardId: 'b1', activeBoard: {} },
      { graphVersion: 1, activeBoardId: 'b1', activeBoard: {} },
    );
    expect(routeAllWiresSpy).toHaveBeenCalledTimes(1);
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

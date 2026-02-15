import { describe, it, expect } from 'vitest';
import type { NodeState, GameboardState } from '../../shared/types/index.ts';
import { createGameboardSlice } from './gameboard-slice.ts';

function makeNode(id: string, type: string, col: number, row: number, overrides: Partial<NodeState> = {}): NodeState {
  return { id, type, position: { col, row }, params: {}, inputCount: 1, outputCount: 1, ...overrides };
}

describe('gameboard-slice removeNode', () => {
  it('rejects removal of locked node', () => {
    const lockedNode = makeNode('n1', 'invert', 15, 10, { locked: true });
    const board: GameboardState = {
      id: 'test-board',
      chips: new Map([['n1', lockedNode]]),
      paths: [],
    };

    // Create a minimal store for testing the slice
    let state: any = {
      activeBoard: board,
      graphVersion: 0,
      occupancy: Array.from({ length: 66 }, () => new Array(36).fill(false)),
    };
    const get = () => state;
    const set = (fn: any) => {
      const result = typeof fn === 'function' ? fn(state) : fn;
      state = { ...state, ...result };
    };
    const slice = createGameboardSlice(set as any, get as any, {} as any);

    slice.removeNode('n1');
    // Node should still be present
    expect(state.activeBoard.chips.has('n1')).toBe(true);
    expect(state.graphVersion).toBe(0);
  });

  it('allows removal of non-locked node', () => {
    const normalNode = makeNode('n2', 'invert', 15, 10);
    const board: GameboardState = {
      id: 'test-board',
      chips: new Map([['n2', normalNode]]),
      paths: [],
    };

    let state: any = {
      activeBoard: board,
      graphVersion: 0,
      occupancy: Array.from({ length: 66 }, () => new Array(36).fill(false)),
    };
    const get = () => state;
    const set = (fn: any) => {
      const result = typeof fn === 'function' ? fn(state) : fn;
      state = { ...state, ...result };
    };
    const slice = createGameboardSlice(set as any, get as any, {} as any);

    slice.removeNode('n2');
    // Node should be removed
    expect(state.activeBoard.chips.has('n2')).toBe(false);
    expect(state.graphVersion).toBe(1);
  });
});

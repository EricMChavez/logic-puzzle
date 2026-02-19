import { describe, it, expect } from 'vitest';
import { memoryChip, createMemoryState } from './memory';
import type { MemoryState } from './memory';

describe('Memory node', () => {
  const evaluate = (input: number, state: MemoryState) => {
    return memoryChip.evaluate({
      inputs: [input],
      params: {},
      state,
      tickIndex: 0,
    });
  };

  it('outputs 0 on the first cycle', () => {
    const state = createMemoryState();
    expect(evaluate(50, state)).toEqual([0]);
  });

  it('outputs the previous input on subsequent cycles', () => {
    const state = createMemoryState();
    evaluate(42, state);
    expect(evaluate(99, state)).toEqual([42]);
    expect(evaluate(-100, state)).toEqual([99]);
    expect(evaluate(0, state)).toEqual([-100]);
  });

  it('handles edge values', () => {
    const state = createMemoryState();
    evaluate(100, state);
    expect(evaluate(-100, state)).toEqual([100]);
    expect(evaluate(0, state)).toEqual([-100]);
  });

  it('creates fresh state with previousValue = 0', () => {
    const state = createMemoryState();
    expect(state.previousValue).toBe(0);
  });

  it('has correct metadata', () => {
    expect(memoryChip.type).toBe('memory');
    expect(memoryChip.category).toBe('timing');
    expect(memoryChip.sockets).toHaveLength(1);
    expect(memoryChip.plugs).toHaveLength(1);
    expect(memoryChip.size).toEqual({ width: 3, height: 1 });
    expect(memoryChip.createState).toBeDefined();
    expect(memoryChip.params).toBeUndefined();
  });
});

import { describe, it, expect } from 'vitest';
import { splitterNode } from './splitter';

describe('Splitter node', () => {
  const evaluate = (a: number) =>
    splitterNode.evaluate({
      inputs: [a],
      params: {},
      state: undefined,
      tickIndex: 0,
    });

  it('halves positive input to both outputs', () => {
    expect(evaluate(100)).toEqual([50, 50]);
    expect(evaluate(80)).toEqual([40, 40]);
  });

  it('halves negative input to both outputs', () => {
    expect(evaluate(-100)).toEqual([-50, -50]);
    expect(evaluate(-80)).toEqual([-40, -40]);
  });

  it('handles zero', () => {
    expect(evaluate(0)).toEqual([0, 0]);
  });

  it('handles odd values (integer division)', () => {
    // 50 / 2 = 25
    expect(evaluate(50)).toEqual([25, 25]);
    // 51 / 2 = 25.5
    expect(evaluate(51)).toEqual([25.5, 25.5]);
  });

  it('preserves signal when merged back', () => {
    // Split then merge should give original (before any clamping)
    const [out1, out2] = evaluate(80);
    expect(out1 + out2).toBe(80);
  });

  it('has correct metadata', () => {
    expect(splitterNode.type).toBe('splitter');
    expect(splitterNode.category).toBe('routing');
    expect(splitterNode.inputs).toHaveLength(1);
    expect(splitterNode.outputs).toHaveLength(2);
    expect(splitterNode.size).toEqual({ width: 3, height: 2 });
  });
});

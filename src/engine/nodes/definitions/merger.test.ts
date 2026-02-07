import { describe, it, expect } from 'vitest';
import { mergerNode } from './merger';

describe('Merger node', () => {
  const evaluate = (a: number, b: number) =>
    mergerNode.evaluate({
      inputs: [a, b],
      params: {},
      state: undefined,
      tickIndex: 0,
    });

  it('adds two positive values', () => {
    expect(evaluate(30, 20)).toEqual([50]);
  });

  it('adds two negative values', () => {
    expect(evaluate(-30, -20)).toEqual([-50]);
  });

  it('adds positive and negative', () => {
    expect(evaluate(30, -20)).toEqual([10]);
    expect(evaluate(-30, 20)).toEqual([-10]);
  });

  it('handles zero inputs', () => {
    expect(evaluate(50, 0)).toEqual([50]);
    expect(evaluate(0, 50)).toEqual([50]);
    expect(evaluate(0, 0)).toEqual([0]);
  });

  it('clamps positive overflow', () => {
    expect(evaluate(70, 50)).toEqual([100]); // 120 → 100
    expect(evaluate(100, 100)).toEqual([100]); // 200 → 100
  });

  it('clamps negative overflow', () => {
    expect(evaluate(-70, -50)).toEqual([-100]); // -120 → -100
    expect(evaluate(-100, -100)).toEqual([-100]); // -200 → -100
  });

  it('cancels out to zero', () => {
    expect(evaluate(50, -50)).toEqual([0]);
    expect(evaluate(-100, 100)).toEqual([0]);
  });

  it('has correct metadata', () => {
    expect(mergerNode.type).toBe('merger');
    expect(mergerNode.category).toBe('math');
    expect(mergerNode.inputs).toHaveLength(2);
    expect(mergerNode.outputs).toHaveLength(1);
    expect(mergerNode.size).toEqual({ width: 3, height: 2 });
  });
});

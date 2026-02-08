import { describe, it, expect } from 'vitest';
import { polarizerNode } from './polarizer';

describe('Polarizer node', () => {
  const evaluate = (a: number) =>
    polarizerNode.evaluate({
      inputs: [a],
      params: {},
      state: undefined,
      tickIndex: 0,
    });

  it('polarizes positive values to +100', () => {
    expect(evaluate(1)).toEqual([100]);
    expect(evaluate(50)).toEqual([100]);
    expect(evaluate(100)).toEqual([100]);
  });

  it('polarizes negative values to -100', () => {
    expect(evaluate(-1)).toEqual([-100]);
    expect(evaluate(-50)).toEqual([-100]);
    expect(evaluate(-100)).toEqual([-100]);
  });

  it('passes through zero as zero', () => {
    expect(evaluate(0)).toEqual([0]);
  });

  it('handles small values near zero', () => {
    expect(evaluate(0.001)).toEqual([100]);
    expect(evaluate(-0.001)).toEqual([-100]);
  });

  it('has correct metadata', () => {
    expect(polarizerNode.type).toBe('polarizer');
    expect(polarizerNode.category).toBe('math');
    expect(polarizerNode.inputs).toHaveLength(1);
    expect(polarizerNode.outputs).toHaveLength(1);
    expect(polarizerNode.size).toEqual({ width: 2, height: 2 });
  });
});

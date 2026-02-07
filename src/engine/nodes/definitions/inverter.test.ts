import { describe, it, expect } from 'vitest';
import { inverterNode } from './inverter';

describe('Inverter node', () => {
  const evaluate = (a: number) =>
    inverterNode.evaluate({
      inputs: [a],
      params: {},
      state: undefined,
      tickIndex: 0,
    });

  it('inverts positive to negative', () => {
    expect(evaluate(50)).toEqual([-50]);
    expect(evaluate(100)).toEqual([-100]);
  });

  it('inverts negative to positive', () => {
    expect(evaluate(-50)).toEqual([50]);
    expect(evaluate(-100)).toEqual([100]);
  });

  it('passes through zero', () => {
    expect(evaluate(0)).toEqual([0]);
  });

  it('clamps after inversion', () => {
    // -(-100) = 100, which is at the limit
    expect(evaluate(-100)).toEqual([100]);
  });

  it('has correct metadata', () => {
    expect(inverterNode.type).toBe('inverter');
    expect(inverterNode.category).toBe('math');
    expect(inverterNode.inputs).toHaveLength(1);
    expect(inverterNode.outputs).toHaveLength(1);
    expect(inverterNode.size).toEqual({ width: 2, height: 2 });
  });
});

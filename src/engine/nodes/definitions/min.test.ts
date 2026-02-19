import { describe, it, expect } from 'vitest';
import { minChip } from './min';

describe('Min node', () => {
  const evaluate = (a: number, b: number) =>
    minChip.evaluate({
      inputs: [a, b],
      params: {},
      state: undefined,
      tickIndex: 0,
    });

  it('has correct metadata', () => {
    expect(minChip.type).toBe('min');
    expect(minChip.category).toBe('math');
    expect(minChip.sockets).toHaveLength(2);
    expect(minChip.plugs).toHaveLength(1);
    expect(minChip.size).toEqual({ width: 2, height: 2 });
  });

  it('returns smaller of two positive values', () => {
    expect(evaluate(30, 70)).toEqual([30]);
    expect(evaluate(100, 50)).toEqual([50]);
  });

  it('returns smaller of two negative values', () => {
    expect(evaluate(-30, -70)).toEqual([-70]);
    expect(evaluate(-100, -50)).toEqual([-100]);
  });

  it('returns smaller of mixed values', () => {
    expect(evaluate(-50, 50)).toEqual([-50]);
    expect(evaluate(50, -50)).toEqual([-50]);
  });

  it('handles zeros', () => {
    expect(evaluate(0, 0)).toEqual([0]);
    expect(evaluate(0, 50)).toEqual([0]);
    expect(evaluate(-50, 0)).toEqual([-50]);
  });

  it('handles equal values', () => {
    expect(evaluate(42, 42)).toEqual([42]);
    expect(evaluate(-100, -100)).toEqual([-100]);
  });

  it('handles boundary values', () => {
    expect(evaluate(-100, 100)).toEqual([-100]);
    expect(evaluate(100, -100)).toEqual([-100]);
    expect(evaluate(100, 100)).toEqual([100]);
    expect(evaluate(-100, -100)).toEqual([-100]);
  });
});

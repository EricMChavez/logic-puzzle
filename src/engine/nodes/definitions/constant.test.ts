import { describe, it, expect } from 'vitest';
import { constantNode } from './constant';

describe('Constant node', () => {
  const evaluate = (value: number) =>
    constantNode.evaluate({
      inputs: [],
      params: { value },
      state: undefined,
      tickIndex: 0,
    });

  it('outputs zero by default', () => {
    expect(evaluate(0)).toEqual([0]);
  });

  it('outputs positive values (value * 10)', () => {
    expect(evaluate(5)).toEqual([50]);
    expect(evaluate(10)).toEqual([100]);
  });

  it('outputs negative values (value * 10)', () => {
    expect(evaluate(-5)).toEqual([-50]);
    expect(evaluate(-10)).toEqual([-100]);
  });

  it('clamps output above 100', () => {
    expect(evaluate(15)).toEqual([100]);
  });

  it('clamps output below -100', () => {
    expect(evaluate(-15)).toEqual([-100]);
  });

  it('has correct metadata', () => {
    expect(constantNode.type).toBe('constant');
    expect(constantNode.category).toBe('source');
    expect(constantNode.inputs).toHaveLength(0);
    expect(constantNode.outputs).toHaveLength(1);
    expect(constantNode.size).toEqual({ width: 2, height: 2 });
  });

  it('has value parameter defined', () => {
    expect(constantNode.params).toHaveLength(1);
    expect(constantNode.params![0]).toMatchObject({
      key: 'value',
      type: 'number',
      default: 0,
      min: -10,
      max: 10,
    });
  });
});

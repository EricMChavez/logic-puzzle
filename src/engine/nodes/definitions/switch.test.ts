import { describe, it, expect } from 'vitest';
import { switchNode } from './switch';

describe('Switch node', () => {
  const evaluate = (a: number, b: number, ctrl: number) =>
    switchNode.evaluate({
      inputs: [a, b, ctrl],
      params: {},
      state: undefined,
      tickIndex: 0,
    });

  describe('straight routing (ctrl >= 0)', () => {
    it('routes A→Out1, B→Out2 when ctrl is positive', () => {
      expect(evaluate(10, 20, 50)).toEqual([10, 20]);
      expect(evaluate(100, -100, 1)).toEqual([100, -100]);
    });

    it('routes straight when ctrl is zero', () => {
      expect(evaluate(10, 20, 0)).toEqual([10, 20]);
    });
  });

  describe('crossed routing (ctrl < 0)', () => {
    it('routes B→Out1, A→Out2 when ctrl is negative', () => {
      expect(evaluate(10, 20, -50)).toEqual([20, 10]);
      expect(evaluate(100, -100, -1)).toEqual([-100, 100]);
    });
  });

  describe('signal preservation', () => {
    it('does not modify signal values', () => {
      // Signals should pass through unchanged
      expect(evaluate(75, -33, 0)).toEqual([75, -33]);
      expect(evaluate(75, -33, -1)).toEqual([-33, 75]);
    });
  });

  it('has correct metadata', () => {
    expect(switchNode.type).toBe('switch');
    expect(switchNode.category).toBe('routing');
    expect(switchNode.inputs).toHaveLength(3);
    expect(switchNode.outputs).toHaveLength(2);
    expect(switchNode.size).toEqual({ width: 3, height: 3 });
  });
});

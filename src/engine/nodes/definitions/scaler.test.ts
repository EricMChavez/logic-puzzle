import { describe, it, expect } from 'vitest';
import { scalerNode } from './scaler';

describe('Scaler node', () => {
  const evaluate = (a: number, b: number) =>
    scalerNode.evaluate({
      inputs: [a, b],
      params: {},
      state: undefined,
      tickIndex: 0,
    });

  describe('scaling factor', () => {
    it('passes through when B=0 (factor 1.0)', () => {
      expect(evaluate(50, 0)).toEqual([50]);
      expect(evaluate(-50, 0)).toEqual([-50]);
    });

    it('doubles when B=100 (factor 2.0)', () => {
      expect(evaluate(50, 100)).toEqual([100]);
      expect(evaluate(25, 100)).toEqual([50]);
    });

    it('increases by 50% when B=50 (factor 1.5)', () => {
      expect(evaluate(40, 50)).toEqual([60]); // 40 * 1.5 = 60
    });

    it('halves when B=-50 (factor 0.5)', () => {
      expect(evaluate(100, -50)).toEqual([50]);
      expect(evaluate(-100, -50)).toEqual([-50]);
    });

    it('mutes when B=-100 (factor 0)', () => {
      expect(evaluate(100, -100)).toEqual([0]);
      expect(evaluate(-100, -100)).toEqual([0]);
      expect(evaluate(50, -100)).toEqual([0]);
    });
  });

  describe('clamping', () => {
    it('clamps positive overflow', () => {
      // 100 * 2 = 200 → clamped to 100
      expect(evaluate(100, 100)).toEqual([100]);
    });

    it('clamps negative overflow', () => {
      // -100 * 2 = -200 → clamped to -100
      expect(evaluate(-100, 100)).toEqual([-100]);
    });
  });

  describe('edge cases', () => {
    it('handles zero input', () => {
      expect(evaluate(0, 100)).toEqual([0]); // 0 * 2 = 0
      expect(evaluate(0, -50)).toEqual([0]); // 0 * 0.5 = 0
    });

    it('handles negative scaling (beyond mute)', () => {
      // B = -150 → factor = -0.5 (inverts and halves)
      // This is allowed - player can create interesting effects
      expect(evaluate(100, -150)).toEqual([-50]);
    });
  });

  it('has correct metadata', () => {
    expect(scalerNode.type).toBe('scaler');
    expect(scalerNode.category).toBe('math');
    expect(scalerNode.inputs).toHaveLength(2);
    expect(scalerNode.outputs).toHaveLength(1);
    expect(scalerNode.size).toEqual({ width: 3, height: 2 });
  });
});

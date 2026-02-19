import { describe, it, expect } from 'vitest';
import { scaleChip } from './scale';

describe('Scale node', () => {
  const evaluate = (a: number, x: number) =>
    scaleChip.evaluate({
      inputs: [a, x],
      params: { factor: 100 },
      state: undefined,
      tickIndex: 0,
    });

  it('has correct metadata', () => {
    expect(scaleChip.type).toBe('scale');
    expect(scaleChip.category).toBe('math');
    expect(scaleChip.sockets).toHaveLength(2);
    expect(scaleChip.plugs).toHaveLength(1);
    expect(scaleChip.size).toEqual({ width: 4, height: 3 });
  });

  it('has X input with bottom side override', () => {
    expect(scaleChip.sockets[1].name).toBe('X');
    expect(scaleChip.sockets[1].side).toBe('bottom');
  });

  it('X=100 passes through (unity)', () => {
    expect(evaluate(50, 100)).toEqual([50]);
    expect(evaluate(-50, 100)).toEqual([-50]);
    expect(evaluate(100, 100)).toEqual([100]);
    expect(evaluate(0, 100)).toEqual([0]);
  });

  it('X=50 halves the signal', () => {
    expect(evaluate(50, 50)).toEqual([25]);
    expect(evaluate(-80, 50)).toEqual([-40]);
    expect(evaluate(100, 50)).toEqual([50]);
  });

  it('X=0 mutes the signal', () => {
    expect(evaluate(50, 0)).toEqual([0]);
    expect(evaluate(-50, 0)).toEqual([0]);
    expect(evaluate(100, 0)).toEqual([0]);
  });

  it('X=-100 inverts the signal', () => {
    expect(evaluate(50, -100)).toEqual([-50]);
    expect(evaluate(-50, -100)).toEqual([50]);
    expect(evaluate(100, -100)).toEqual([-100]);
  });

  it('X=-50 halves and inverts', () => {
    expect(evaluate(50, -50)).toEqual([-25]);
    expect(evaluate(-80, -50)).toEqual([40]);
  });

  it('clamps positive overflow', () => {
    // A=80, X=80 → 80*80/100 = 64 → no clamp
    expect(evaluate(80, 80)).toEqual([64]);
    // No overflow possible when both are in [-100,100] with /100
    // But A=100, X=100 → 100*100/100 = 100 → exactly at limit
    expect(evaluate(100, 100)).toEqual([100]);
  });

  it('handles zero input', () => {
    expect(evaluate(0, 100)).toEqual([0]);
    expect(evaluate(0, -100)).toEqual([0]);
    expect(evaluate(0, 50)).toEqual([0]);
  });

  it('handles all 9 knob positions', () => {
    const a = 40;
    // X=-100: 40*-100/100 = -40
    expect(evaluate(a, -100)).toEqual([-40]);
    // X=-75: 40*-75/100 = -30
    expect(evaluate(a, -75)).toEqual([-30]);
    // X=-50: 40*-50/100 = -20
    expect(evaluate(a, -50)).toEqual([-20]);
    // X=-25: 40*-25/100 = -10
    expect(evaluate(a, -25)).toEqual([-10]);
    // X=0: 40*0/100 = 0
    expect(evaluate(a, 0)).toEqual([0]);
    // X=25: 40*25/100 = 10
    expect(evaluate(a, 25)).toEqual([10]);
    // X=50: 40*50/100 = 20
    expect(evaluate(a, 50)).toEqual([20]);
    // X=75: 40*75/100 = 30
    expect(evaluate(a, 75)).toEqual([30]);
    // X=100: 40*100/100 = 40
    expect(evaluate(a, 100)).toEqual([40]);
  });

  it('has factor parameter with correct config', () => {
    expect(scaleChip.params).toHaveLength(1);
    const param = scaleChip.params![0];
    expect(param.key).toBe('factor');
    expect(param.default).toBe(100);
    expect(param.min).toBe(-100);
    expect(param.max).toBe(100);
    expect(param.step).toBe(25);
  });

  describe('factor parameter ignored in evaluate (knob sets port constant only)', () => {
    const evaluateWithFactor = (a: number, x: number, factor: number) =>
      scaleChip.evaluate({
        inputs: [a, x],
        params: { factor },
        state: undefined,
        tickIndex: 0,
      });

    it('factor param does not affect output (only X input matters)', () => {
      expect(evaluateWithFactor(50, 100, 0)).toEqual([50]);
      expect(evaluateWithFactor(50, 100, -100)).toEqual([50]);
      expect(evaluateWithFactor(40, 25, 25)).toEqual([10]);
    });
  });
});

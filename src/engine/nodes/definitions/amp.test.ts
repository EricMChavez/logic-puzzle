import { describe, it, expect } from 'vitest';
import { ampChip } from './amp';

describe('Amp node', () => {
  const evaluate = (a: number, x: number) =>
    ampChip.evaluate({
      inputs: [a, x],
      params: { gain: 0 },
      state: undefined,
      tickIndex: 0,
    });

  it('has correct metadata', () => {
    expect(ampChip.type).toBe('amp');
    expect(ampChip.category).toBe('math');
    expect(ampChip.sockets).toHaveLength(2);
    expect(ampChip.plugs).toHaveLength(1);
    expect(ampChip.size).toEqual({ width: 4, height: 3 });
  });

  it('has X input with bottom side override', () => {
    expect(ampChip.sockets[1].name).toBe('X');
    expect(ampChip.sockets[1].side).toBe('bottom');
  });

  it('X=0 is unity (pass-through)', () => {
    expect(evaluate(50, 0)).toEqual([50]);
    expect(evaluate(-50, 0)).toEqual([-50]);
    expect(evaluate(100, 0)).toEqual([100]);
    expect(evaluate(0, 0)).toEqual([0]);
  });

  it('X=100 doubles the signal (2x)', () => {
    expect(evaluate(50, 100)).toEqual([100]);
    expect(evaluate(-50, 100)).toEqual([-100]);
    expect(evaluate(30, 100)).toEqual([60]);
  });

  it('X=-100 silences the signal', () => {
    expect(evaluate(50, -100)).toEqual([0]);
    expect(evaluate(-50, -100)).toEqual([0]);
    expect(evaluate(100, -100)).toEqual([0]);
  });

  it('X=50 gives 1.5x gain', () => {
    expect(evaluate(40, 50)).toEqual([60]);
    expect(evaluate(-40, 50)).toEqual([-60]);
    expect(evaluate(20, 50)).toEqual([30]);
  });

  it('X=-50 gives 0.5x gain', () => {
    expect(evaluate(40, -50)).toEqual([20]);
    expect(evaluate(-40, -50)).toEqual([-20]);
    expect(evaluate(80, -50)).toEqual([40]);
  });

  it('clamps at boundaries', () => {
    // A=80, X=100 → 80*200/100 = 160 → clamped to 100
    expect(evaluate(80, 100)).toEqual([100]);
    // A=-80, X=100 → -80*200/100 = -160 → clamped to -100
    expect(evaluate(-80, 100)).toEqual([-100]);
  });

  it('handles zero input', () => {
    expect(evaluate(0, 100)).toEqual([0]);
    expect(evaluate(0, -100)).toEqual([0]);
    expect(evaluate(0, 50)).toEqual([0]);
  });

  it('handles all 9 knob positions', () => {
    const a = 40;
    // X=-100: 40*0/100 = 0
    expect(evaluate(a, -100)).toEqual([0]);
    // X=-75: 40*25/100 = 10
    expect(evaluate(a, -75)).toEqual([10]);
    // X=-50: 40*50/100 = 20
    expect(evaluate(a, -50)).toEqual([20]);
    // X=-25: 40*75/100 = 30
    expect(evaluate(a, -25)).toEqual([30]);
    // X=0: 40*100/100 = 40
    expect(evaluate(a, 0)).toEqual([40]);
    // X=25: 40*125/100 = 50
    expect(evaluate(a, 25)).toEqual([50]);
    // X=50: 40*150/100 = 60
    expect(evaluate(a, 50)).toEqual([60]);
    // X=75: 40*175/100 = 70
    expect(evaluate(a, 75)).toEqual([70]);
    // X=100: 40*200/100 = 80
    expect(evaluate(a, 100)).toEqual([80]);
  });

  it('has gain parameter with correct config', () => {
    expect(ampChip.params).toHaveLength(1);
    const param = ampChip.params![0];
    expect(param.key).toBe('gain');
    expect(param.default).toBe(0);
    expect(param.min).toBe(-100);
    expect(param.max).toBe(100);
    expect(param.step).toBe(25);
  });

  describe('gain parameter ignored in evaluate (knob sets port constant only)', () => {
    const evaluateWithGain = (a: number, x: number, gain: number) =>
      ampChip.evaluate({
        inputs: [a, x],
        params: { gain },
        state: undefined,
        tickIndex: 0,
      });

    it('gain param does not affect output (only X input matters)', () => {
      expect(evaluateWithGain(50, 0, 100)).toEqual([50]);
      expect(evaluateWithGain(50, 0, -100)).toEqual([50]);
      expect(evaluateWithGain(40, 25, 25)).toEqual([50]);
    });
  });
});

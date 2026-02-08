import { describe, it, expect } from 'vitest';
import { ampNode } from './amp';

describe('Amp node', () => {
  const evaluate = (a: number, x: number) =>
    ampNode.evaluate({
      inputs: [a, x],
      params: { gain: 0 },
      state: undefined,
      tickIndex: 0,
    });

  it('has correct metadata', () => {
    expect(ampNode.type).toBe('amp');
    expect(ampNode.category).toBe('math');
    expect(ampNode.inputs).toHaveLength(2);
    expect(ampNode.outputs).toHaveLength(1);
    expect(ampNode.size).toEqual({ width: 3, height: 3 });
  });

  it('has X input with bottom side override', () => {
    expect(ampNode.inputs[1].name).toBe('X');
    expect(ampNode.inputs[1].side).toBe('bottom');
  });

  it('X=0 passes through (unity gain)', () => {
    expect(evaluate(50, 0)).toEqual([50]);
    expect(evaluate(-50, 0)).toEqual([-50]);
    expect(evaluate(100, 0)).toEqual([100]);
    expect(evaluate(0, 0)).toEqual([0]);
  });

  it('X=100 doubles the signal', () => {
    expect(evaluate(50, 100)).toEqual([100]);
    expect(evaluate(-50, 100)).toEqual([-100]);
  });

  it('X=-100 mutes the signal', () => {
    expect(evaluate(50, -100)).toEqual([0]);
    expect(evaluate(-50, -100)).toEqual([0]);
    expect(evaluate(100, -100)).toEqual([0]);
  });

  it('X=-50 halves the signal', () => {
    expect(evaluate(50, -50)).toEqual([25]);
    expect(evaluate(-80, -50)).toEqual([-40]);
  });

  it('clamps positive overflow', () => {
    // A=100, X=100 → 100*(1+1) = 200 → clamped to 100
    expect(evaluate(100, 100)).toEqual([100]);
    // A=80, X=50 → 80*1.5 = 120 → clamped to 100
    expect(evaluate(80, 50)).toEqual([100]);
  });

  it('clamps negative overflow', () => {
    // A=-100, X=100 → -100*(1+1) = -200 → clamped to -100
    expect(evaluate(-100, 100)).toEqual([-100]);
  });

  it('handles zero input', () => {
    expect(evaluate(0, 100)).toEqual([0]);
    expect(evaluate(0, -100)).toEqual([0]);
    expect(evaluate(0, 50)).toEqual([0]);
  });

  it('handles all 9 knob positions', () => {
    const a = 40;
    // X=-100: 40*(1-1) = 0
    expect(evaluate(a, -100)).toEqual([0]);
    // X=-75: 40*0.25 = 10
    expect(evaluate(a, -75)).toEqual([10]);
    // X=-50: 40*0.5 = 20
    expect(evaluate(a, -50)).toEqual([20]);
    // X=-25: 40*0.75 = 30
    expect(evaluate(a, -25)).toEqual([30]);
    // X=0: 40*1 = 40
    expect(evaluate(a, 0)).toEqual([40]);
    // X=25: 40*1.25 = 50
    expect(evaluate(a, 25)).toEqual([50]);
    // X=50: 40*1.5 = 60
    expect(evaluate(a, 50)).toEqual([60]);
    // X=75: 40*1.75 = 70
    expect(evaluate(a, 75)).toEqual([70]);
    // X=100: 40*2 = 80
    expect(evaluate(a, 100)).toEqual([80]);
  });

  it('has gain parameter with correct config', () => {
    expect(ampNode.params).toHaveLength(1);
    const param = ampNode.params![0];
    expect(param.key).toBe('gain');
    expect(param.default).toBe(0);
    expect(param.min).toBe(-100);
    expect(param.max).toBe(100);
    expect(param.step).toBe(25);
  });
});

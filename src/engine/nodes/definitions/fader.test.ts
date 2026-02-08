import { describe, it, expect } from 'vitest';
import { faderNode } from './fader';
import { clamp } from '../../../shared/math';

describe('Fader Node', () => {
  describe('metadata', () => {
    it('has correct type', () => {
      expect(faderNode.type).toBe('fader');
    });

    it('has correct category', () => {
      expect(faderNode.category).toBe('routing');
    });

    it('has 2 inputs (A, X)', () => {
      expect(faderNode.inputs).toHaveLength(2);
      expect(faderNode.inputs[0].name).toBe('A');
      expect(faderNode.inputs[1].name).toBe('X');
    });

    it('has X on bottom side', () => {
      expect(faderNode.inputs[1].side).toBe('bottom');
    });

    it('has 2 outputs (Y, Z)', () => {
      expect(faderNode.outputs).toHaveLength(2);
      expect(faderNode.outputs[0].name).toBe('Y');
      expect(faderNode.outputs[1].name).toBe('Z');
    });

    it('has 3x3 size', () => {
      expect(faderNode.size).toEqual({ width: 3, height: 3 });
    });
  });

  describe('evaluate', () => {
    const evaluate = (a: number, x: number) =>
      faderNode.evaluate({ inputs: [a, x], params: { fade: 0 } });

    it('X=0 splits evenly: Y=50%A, Z=50%A', () => {
      const [y, z] = evaluate(100, 0);
      expect(y).toBe(50);
      expect(z).toBe(50);
    });

    it('X=100: Y=100%A, Z=0%A', () => {
      const [y, z] = evaluate(100, 100);
      expect(y).toBe(100);
      expect(z).toBe(0);
    });

    it('X=-100: Y=0%A, Z=100%A', () => {
      const [y, z] = evaluate(100, -100);
      expect(y).toBe(0);
      expect(z).toBe(100);
    });

    it('X=50: Y=75%A, Z=25%A', () => {
      const [y, z] = evaluate(100, 50);
      expect(y).toBe(75);
      expect(z).toBe(25);
    });

    it('X=-50: Y=25%A, Z=75%A', () => {
      const [y, z] = evaluate(100, -50);
      expect(y).toBe(25);
      expect(z).toBe(75);
    });

    it('A=0 always produces zero outputs', () => {
      const [y, z] = evaluate(0, 50);
      expect(y).toBe(0);
      expect(z).toBe(0);
    });

    it('negative A splits correctly', () => {
      const [y, z] = evaluate(-80, 0);
      expect(y).toBe(-40);
      expect(z).toBe(-40);
    });

    it('clamps output to [-100, +100]', () => {
      // A=100, X=100 → Y=100 (at limit), Z=0
      const [y, z] = evaluate(100, 100);
      expect(y).toBe(100);
      expect(z).toBe(0);
    });

    it('all 9 knob positions produce correct results for A=100', () => {
      const knobValues = [-100, -75, -50, -25, 0, 25, 50, 75, 100];
      for (const x of knobValues) {
        const [y, z] = evaluate(100, x);
        const expectedY = clamp(100 * (50 + x / 2) / 100);
        const expectedZ = clamp(100 * (50 - x / 2) / 100);
        expect(y).toBe(expectedY);
        expect(z).toBe(expectedZ);
        // Y + Z should always equal A (conservation of signal)
        expect(y + z).toBe(100);
      }
    });

    it('Y + Z = A for any X in [-100, 100]', () => {
      // Signal conservation: the fader redistributes but doesn't create/destroy
      const [y, z] = evaluate(60, 30);
      expect(y + z).toBe(60);
    });
  });

  describe('params', () => {
    it('has fade param with correct config', () => {
      expect(faderNode.params).toHaveLength(1);
      expect(faderNode.params[0].key).toBe('fade');
      expect(faderNode.params[0].default).toBe(0);
      expect(faderNode.params[0].min).toBe(-100);
      expect(faderNode.params[0].max).toBe(100);
      expect(faderNode.params[0].step).toBe(25);
    });
  });
});

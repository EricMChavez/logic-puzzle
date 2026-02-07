import { describe, it, expect } from 'vitest';
import {
  SIGNAL_INVERTER,
  SIGNAL_ATTENUATOR,
  SIGNAL_FULLWAVE_RECTIFIER,
  SIGNAL_DELAY,
} from './signal-shaping-levels.ts';
import { generateWaveformValue } from '../waveform-generators.ts';

// ---------------------------------------------------------------------------
// Mathematical correctness — Inverter: output = -input
// ---------------------------------------------------------------------------

describe('SIGNAL_INVERTER mathematical correctness', () => {
  for (const tc of SIGNAL_INVERTER.testCases) {
    it(`${tc.name}: -input matches expected output over 256 ticks`, () => {
      const inputDef = tc.inputs[0];
      const expectedDef = tc.expectedOutputs[0];

      for (let t = 0; t < 256; t++) {
        const inputVal = generateWaveformValue(t, inputDef);
        const inverted = Math.max(-100, Math.min(100, -inputVal));
        const expected = generateWaveformValue(t, expectedDef);
        expect(expected).toBeCloseTo(inverted, 5);
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Mathematical correctness — Attenuator: output = input * 50 / 100
// ---------------------------------------------------------------------------

describe('SIGNAL_ATTENUATOR mathematical correctness', () => {
  for (const tc of SIGNAL_ATTENUATOR.testCases) {
    it(`${tc.name}: input * 50 / 100 matches expected output over 256 ticks`, () => {
      const inputDef = tc.inputs[0];
      const expectedDef = tc.expectedOutputs[0];

      for (let t = 0; t < 256; t++) {
        const inputVal = generateWaveformValue(t, inputDef);
        const attenuated = Math.max(-100, Math.min(100, inputVal * 50 / 100));
        const expected = generateWaveformValue(t, expectedDef);
        expect(expected).toBeCloseTo(attenuated, 5);
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Mathematical correctness — Full-Wave Rectifier: output = |input|
// ---------------------------------------------------------------------------

describe('SIGNAL_FULLWAVE_RECTIFIER mathematical correctness', () => {
  for (const tc of SIGNAL_FULLWAVE_RECTIFIER.testCases) {
    it(`${tc.name}: |input| matches expected output over 256 ticks`, () => {
      const inputDef = tc.inputs[0];
      const expectedDef = tc.expectedOutputs[0];

      for (let t = 0; t < 256; t++) {
        const inputVal = generateWaveformValue(t, inputDef);
        const rectified = Math.abs(inputVal);
        const expected = generateWaveformValue(t, expectedDef);
        expect(expected).toBeCloseTo(rectified, 5);
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Mathematical correctness — Signal Delay: output(t) = input(t - 16)
// ---------------------------------------------------------------------------

describe('SIGNAL_DELAY mathematical correctness', () => {
  for (const tc of SIGNAL_DELAY.testCases) {
    it(`${tc.name}: input(t - 16) matches expected output over 256 ticks`, () => {
      const inputDef = tc.inputs[0];
      const expectedDef = tc.expectedOutputs[0];

      for (let t = 0; t < 256; t++) {
        const delayedInput = generateWaveformValue(t - 16, inputDef);
        const expected = generateWaveformValue(t, expectedDef);
        expect(expected).toBeCloseTo(delayedInput, 5);
      }
    });
  }
});

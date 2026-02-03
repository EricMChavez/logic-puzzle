import { describe, it, expect } from 'vitest';
import { PUZZLE_LEVELS, getPuzzleById } from './index.ts';
import { TUTORIAL_PASSTHROUGH, TUTORIAL_INVERT, TUTORIAL_MIX } from './tutorial-levels.ts';
import { generateWaveformValue } from '../waveform-generators.ts';

describe('PUZZLE_LEVELS', () => {
  it('contains all tutorial levels in order', () => {
    expect(PUZZLE_LEVELS.length).toBeGreaterThanOrEqual(3);
    expect(PUZZLE_LEVELS[0]).toBe(TUTORIAL_PASSTHROUGH);
    expect(PUZZLE_LEVELS[1]).toBe(TUTORIAL_INVERT);
    expect(PUZZLE_LEVELS[2]).toBe(TUTORIAL_MIX);
  });

  it('each level has a unique id', () => {
    const ids = PUZZLE_LEVELS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('getPuzzleById', () => {
  it('finds existing puzzles', () => {
    expect(getPuzzleById('tutorial-passthrough')).toBe(TUTORIAL_PASSTHROUGH);
    expect(getPuzzleById('tutorial-invert')).toBe(TUTORIAL_INVERT);
  });

  it('returns undefined for unknown id', () => {
    expect(getPuzzleById('nonexistent')).toBeUndefined();
  });
});

describe('level data integrity', () => {
  for (const puzzle of PUZZLE_LEVELS) {
    describe(puzzle.id, () => {
      it('has at least 1 active input and output (1-3 range)', () => {
        expect(puzzle.activeInputs).toBeGreaterThanOrEqual(1);
        expect(puzzle.activeInputs).toBeLessThanOrEqual(3);
        expect(puzzle.activeOutputs).toBeGreaterThanOrEqual(1);
        expect(puzzle.activeOutputs).toBeLessThanOrEqual(3);
      });

      it('has at least 2 test cases', () => {
        expect(puzzle.testCases.length).toBeGreaterThanOrEqual(2);
      });

      it('has test case input/output counts matching activeInputs/activeOutputs', () => {
        for (const tc of puzzle.testCases) {
          expect(tc.inputs.length).toBe(puzzle.activeInputs);
          expect(tc.expectedOutputs.length).toBe(puzzle.activeOutputs);
        }
      });

      it('has non-empty title and description', () => {
        expect(puzzle.title.length).toBeGreaterThan(0);
        expect(puzzle.description.length).toBeGreaterThan(0);
      });

      it('has named test cases', () => {
        for (const tc of puzzle.testCases) {
          expect(tc.name.length).toBeGreaterThan(0);
        }
      });

      it('has waveform defs with positive periods', () => {
        for (const tc of puzzle.testCases) {
          for (const def of [...tc.inputs, ...tc.expectedOutputs]) {
            expect(def.period).toBeGreaterThan(0);
          }
        }
      });
    });
  }
});

describe('TUTORIAL_INVERT expected outputs are actually inverted', () => {
  it('sine inversion: output is phase-shifted by half period', () => {
    const tc = TUTORIAL_INVERT.testCases[0];
    const inputDef = tc.inputs[0];
    const outputDef = tc.expectedOutputs[0];

    // At any tick, output should be -input (within floating point tolerance)
    for (let t = 0; t < 64; t++) {
      const inputVal = generateWaveformValue(t, inputDef);
      const outputVal = generateWaveformValue(t, outputDef);
      expect(outputVal).toBeCloseTo(-inputVal, 5);
    }
  });

  it('square inversion: output is phase-shifted by half period', () => {
    const tc = TUTORIAL_INVERT.testCases[1];
    const inputDef = tc.inputs[0];
    const outputDef = tc.expectedOutputs[0];

    for (let t = 0; t < 32; t++) {
      const inputVal = generateWaveformValue(t, inputDef);
      const outputVal = generateWaveformValue(t, outputDef);
      expect(outputVal).toBeCloseTo(-inputVal, 5);
    }
  });
});

describe('TUTORIAL_MIX expected outputs match input sums', () => {
  it('same-frequency sines: sum amplitude equals input amplitudes added', () => {
    const tc = TUTORIAL_MIX.testCases[0];
    const [in1, in2] = tc.inputs;
    const expectedDef = tc.expectedOutputs[0];

    for (let t = 0; t < 64; t++) {
      const sum = generateWaveformValue(t, in1) + generateWaveformValue(t, in2);
      const expected = generateWaveformValue(t, expectedDef);
      // Sum of two same-frequency sines = sine with summed amplitude
      expect(expected).toBeCloseTo(sum, 5);
    }
  });

  it('sine plus constant: expected output is sine with DC offset', () => {
    const tc = TUTORIAL_MIX.testCases[1];
    const [sineDef, constDef] = tc.inputs;
    const expectedDef = tc.expectedOutputs[0];

    for (let t = 0; t < 64; t++) {
      const sum = generateWaveformValue(t, sineDef) + generateWaveformValue(t, constDef);
      const expected = generateWaveformValue(t, expectedDef);
      expect(expected).toBeCloseTo(sum, 5);
    }
  });
});

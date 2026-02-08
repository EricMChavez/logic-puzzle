import { describe, it, expect } from 'vitest';
import { PUZZLE_LEVELS, getPuzzleById } from './index.ts';
import {
  TUTORIAL_RECTIFIER,
  TUTORIAL_AMPLIFIER,
  TUTORIAL_DC_OFFSET,
  TUTORIAL_CLIPPER,
  TUTORIAL_SQUARE_GEN,
} from './tutorial-levels.ts';
import { generateWaveformValue } from '../waveform-generators.ts';

// ---------------------------------------------------------------------------
// Registry tests
// ---------------------------------------------------------------------------

describe('PUZZLE_LEVELS registry', () => {
  it('contains at least 16 levels', () => {
    expect(PUZZLE_LEVELS.length).toBeGreaterThanOrEqual(16);
  });

  it('starts with levels in expected order', () => {
    const ids = PUZZLE_LEVELS.map((p) => p.id);
    const expectedPrefix = [
      'segregation',
      'level-1-polarize',
      'tutorial-rectifier',
      'tutorial-amplifier',
      'tutorial-dc-offset',
      'tutorial-clipper',
      'tutorial-square-gen',
      'signal-inverter',
      'signal-attenuator',
      'signal-fullwave-rectifier',
      'signal-delay',
      'timing-difference',
      'timing-crossfader',
      'timing-ring-modulator',
      'advanced-splitter',
      'advanced-gain-stage',
      'advanced-quadrupler',
    ];
    expect(ids.slice(0, expectedPrefix.length)).toEqual(expectedPrefix);
  });

  it('each level has a unique id', () => {
    const ids = PUZZLE_LEVELS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('getPuzzleById finds every level', () => {
    for (const level of PUZZLE_LEVELS) {
      expect(getPuzzleById(level.id)).toBe(level);
    }
  });

  it('getPuzzleById returns undefined for unknown id', () => {
    expect(getPuzzleById('nonexistent')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Data integrity (generic, iterates all levels)
// ---------------------------------------------------------------------------

describe('level data integrity', () => {
  for (const puzzle of PUZZLE_LEVELS) {
    describe(puzzle.id, () => {
      it('has at least 1 active input and output (1-3 range)', () => {
        expect(puzzle.activeInputs).toBeGreaterThanOrEqual(1);
        expect(puzzle.activeInputs).toBeLessThanOrEqual(3);
        expect(puzzle.activeOutputs).toBeGreaterThanOrEqual(1);
        expect(puzzle.activeOutputs).toBeLessThanOrEqual(3);
      });

      it('has at least 1 test case', () => {
        expect(puzzle.testCases.length).toBeGreaterThanOrEqual(1);
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

// ---------------------------------------------------------------------------
// Mathematical correctness — Rectifier: max(input, 0)
// ---------------------------------------------------------------------------

describe('TUTORIAL_RECTIFIER mathematical correctness', () => {
  for (const tc of TUTORIAL_RECTIFIER.testCases) {
    it(`${tc.name}: max(input, 0) matches expected output over 64 ticks`, () => {
      const inputDef = tc.inputs[0];
      const expectedDef = tc.expectedOutputs[0];

      for (let t = 0; t < 64; t++) {
        const inputVal = generateWaveformValue(t, inputDef);
        const rectified = Math.max(inputVal, 0);
        const expected = generateWaveformValue(t, expectedDef);
        expect(expected).toBeCloseTo(rectified, 5);
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Mathematical correctness — Amplifier: input + input (clamped to [-100,100])
// ---------------------------------------------------------------------------

describe('TUTORIAL_AMPLIFIER mathematical correctness', () => {
  for (const tc of TUTORIAL_AMPLIFIER.testCases) {
    it(`${tc.name}: input + input matches expected output over 64 ticks`, () => {
      const inputDef = tc.inputs[0];
      const expectedDef = tc.expectedOutputs[0];

      for (let t = 0; t < 64; t++) {
        const inputVal = generateWaveformValue(t, inputDef);
        const doubled = Math.max(-100, Math.min(100, inputVal + inputVal));
        const expected = generateWaveformValue(t, expectedDef);
        expect(expected).toBeCloseTo(doubled, 5);
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Mathematical correctness — DC Offset: clamp(input + 50)
// ---------------------------------------------------------------------------

describe('TUTORIAL_DC_OFFSET mathematical correctness', () => {
  for (const tc of TUTORIAL_DC_OFFSET.testCases) {
    it(`${tc.name}: clamp(input + 50) matches expected output over 64 ticks`, () => {
      const inputDef = tc.inputs[0];
      const expectedDef = tc.expectedOutputs[0];

      for (let t = 0; t < 64; t++) {
        const inputVal = generateWaveformValue(t, inputDef);
        const offset = Math.max(-100, Math.min(100, inputVal + 50));
        const expected = generateWaveformValue(t, expectedDef);
        expect(expected).toBeCloseTo(offset, 5);
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Mathematical correctness — Clipper: min(max(input, -50), 50)
// ---------------------------------------------------------------------------

describe('TUTORIAL_CLIPPER mathematical correctness', () => {
  for (const tc of TUTORIAL_CLIPPER.testCases) {
    it(`${tc.name}: clamp(input, -50, 50) matches expected output over 64 ticks`, () => {
      const inputDef = tc.inputs[0];
      const expectedDef = tc.expectedOutputs[0];

      for (let t = 0; t < 64; t++) {
        const inputVal = generateWaveformValue(t, inputDef);
        const clipped = Math.min(50, Math.max(-50, inputVal));
        const expected = generateWaveformValue(t, expectedDef);
        expect(expected).toBeCloseTo(clipped, 5);
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Mathematical correctness — Square Wave Gen: input > 0 ? 100 : -100
// ---------------------------------------------------------------------------

describe('TUTORIAL_SQUARE_GEN mathematical correctness', () => {
  for (const tc of TUTORIAL_SQUARE_GEN.testCases) {
    it(`${tc.name}: threshold(input, 0) matches expected output over 64 ticks`, () => {
      const inputDef = tc.inputs[0];
      const expectedDef = tc.expectedOutputs[0];

      for (let t = 0; t < 64; t++) {
        const inputVal = generateWaveformValue(t, inputDef);
        const thresholded = inputVal > 0 ? 100 : -100;
        const expected = generateWaveformValue(t, expectedDef);
        expect(expected).toBeCloseTo(thresholded, 5);
      }
    });
  }
});

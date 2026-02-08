import { describe, it, expect } from 'vitest';
import { exportCustomPuzzleAsSource } from './export-puzzle.ts';
import type { CustomPuzzle } from '../store/slices/custom-puzzle-slice.ts';

function makeCustomPuzzle(overrides: Partial<CustomPuzzle> = {}): CustomPuzzle {
  return {
    id: 'custom-1234',
    title: 'My Amplifier',
    description: 'Doubles the input signal',
    createdAt: Date.now(),
    slots: [
      { direction: 'input', waveform: { shape: 'sine', amplitude: 100, period: 256, phase: 0, offset: 0 } },
      { direction: 'off' },
      { direction: 'off' },
      { direction: 'output' },
      { direction: 'off' },
      { direction: 'off' },
    ],
    targetSamples: new Map([[3, [0, 50, 100, 50, 0, -50, -100, -50]]]),
    initialNodes: [],
    initialWires: [],
    ...overrides,
  };
}

describe('exportCustomPuzzleAsSource', () => {
  it('generates valid TypeScript with correct import', () => {
    const result = exportCustomPuzzleAsSource(makeCustomPuzzle());
    expect(result).toContain("import type { PuzzleDefinition } from '../types.ts';");
  });

  it('derives kebab-case id from title', () => {
    const result = exportCustomPuzzleAsSource(makeCustomPuzzle());
    expect(result).toContain("id: 'my-amplifier'");
  });

  it('derives UPPER_SNAKE_CASE const name from title', () => {
    const result = exportCustomPuzzleAsSource(makeCustomPuzzle());
    expect(result).toContain('export const MY_AMPLIFIER: PuzzleDefinition');
  });

  it('includes correct activeInputs and activeOutputs counts', () => {
    const result = exportCustomPuzzleAsSource(makeCustomPuzzle());
    expect(result).toContain('activeInputs: 1');
    expect(result).toContain('activeOutputs: 1');
  });

  it('includes input waveform definitions', () => {
    const result = exportCustomPuzzleAsSource(makeCustomPuzzle());
    expect(result).toContain("shape: 'sine'");
    expect(result).toContain('amplitude: 100');
    expect(result).toContain('period: 256');
  });

  it('includes output samples as shape samples', () => {
    const result = exportCustomPuzzleAsSource(makeCustomPuzzle());
    expect(result).toContain("shape: 'samples'");
    expect(result).toContain('samples: [0, 50, 100, 50, 0, -50, -100, -50]');
  });

  it('sets allowedNodes to null', () => {
    const result = exportCustomPuzzleAsSource(makeCustomPuzzle());
    expect(result).toContain('allowedNodes: null');
  });

  it('uses puzzle title as test case name', () => {
    const result = exportCustomPuzzleAsSource(makeCustomPuzzle());
    expect(result).toContain("name: 'My Amplifier'");
  });

  it('always includes connectionPoints with correct slot structure', () => {
    const result = exportCustomPuzzleAsSource(makeCustomPuzzle());
    expect(result).toContain('connectionPoints');
    // Standard layout: input on left slot 0, output on right slot 0
    expect(result).toContain("{ active: true, direction: 'input', cpIndex: 0 }");
    expect(result).toContain("{ active: true, direction: 'output', cpIndex: 0 }");
    // Inactive slots
    expect(result).toContain("{ active: false, direction: 'input' }");
  });

  it('preserves non-standard layout (output on left side)', () => {
    const puzzle = makeCustomPuzzle({
      slots: [
        { direction: 'output' },  // output on left = non-standard
        { direction: 'off' },
        { direction: 'off' },
        { direction: 'input', waveform: { shape: 'sine', amplitude: 100, period: 256, phase: 0, offset: 0 } },
        { direction: 'off' },
        { direction: 'off' },
      ],
      targetSamples: new Map([[0, [10, 20, 30]]]),
    });
    const result = exportCustomPuzzleAsSource(puzzle);
    expect(result).toContain('connectionPoints');
    // Left side has output at slot 0
    expect(result).toContain("{ active: true, direction: 'output', cpIndex: 0 }");
    // Right side has input at slot 0
    expect(result).toContain("{ active: true, direction: 'input', cpIndex: 0 }");
  });

  it('assigns correct cpIndex values for mixed layout', () => {
    const puzzle = makeCustomPuzzle({
      slots: [
        { direction: 'input', waveform: { shape: 'sine', amplitude: 100, period: 256, phase: 0, offset: 0 } },
        { direction: 'output' },
        { direction: 'off' },
        { direction: 'input', waveform: { shape: 'constant', amplitude: 50, period: 16, phase: 0, offset: 0 } },
        { direction: 'output' },
        { direction: 'off' },
      ],
      targetSamples: new Map([
        [1, [10, 20, 30]],
        [4, [40, 50, 60]],
      ]),
    });
    const result = exportCustomPuzzleAsSource(puzzle);
    // Left side: input cpIndex 0, output cpIndex 0
    // Right side: input cpIndex 1, output cpIndex 1
    // The left input is index 0, left output is index 0
    // The right input continues from 1 (1 left input), right output continues from 1 (1 left output)
    expect(result).toContain('connectionPoints');
  });

  it('handles multiple inputs and outputs', () => {
    const puzzle = makeCustomPuzzle({
      slots: [
        { direction: 'input', waveform: { shape: 'sine', amplitude: 100, period: 256, phase: 0, offset: 0 } },
        { direction: 'input', waveform: { shape: 'square', amplitude: 80, period: 128, phase: 0, offset: 0 } },
        { direction: 'off' },
        { direction: 'output' },
        { direction: 'output' },
        { direction: 'off' },
      ],
      targetSamples: new Map([
        [3, [0, 50, 100]],
        [4, [10, 20, 30]],
      ]),
    });
    const result = exportCustomPuzzleAsSource(puzzle);
    expect(result).toContain('activeInputs: 2');
    expect(result).toContain('activeOutputs: 2');
    expect(result).toContain("shape: 'sine'");
    expect(result).toContain("shape: 'square'");
    // Both output sample arrays should be present
    expect(result).toContain('samples: [0, 50, 100]');
    expect(result).toContain('samples: [10, 20, 30]');
  });

  it('escapes single quotes in title and description', () => {
    const puzzle = makeCustomPuzzle({
      title: "It's a test",
      description: "Player's puzzle",
    });
    const result = exportCustomPuzzleAsSource(puzzle);
    expect(result).toContain("title: 'It\\'s a test'");
    expect(result).toContain("description: 'Player\\'s puzzle'");
  });

  it('handles title with special characters for id and const name', () => {
    const puzzle = makeCustomPuzzle({
      title: 'My --Cool-- Puzzle!!!',
    });
    const result = exportCustomPuzzleAsSource(puzzle);
    expect(result).toContain("id: 'my-cool-puzzle'");
    expect(result).toContain('export const MY_COOL_PUZZLE: PuzzleDefinition');
  });

  it('ends with trailing newline', () => {
    const result = exportCustomPuzzleAsSource(makeCustomPuzzle());
    expect(result.endsWith('\n')).toBe(true);
  });
});

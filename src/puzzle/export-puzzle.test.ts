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
      { direction: 'input', waveform: { shape: 'sine-full', amplitude: 100, period: 256, phase: 0, offset: 0 } },
      { direction: 'off' },
      { direction: 'off' },
      { direction: 'output' },
      { direction: 'off' },
      { direction: 'off' },
    ],
    targetSamples: new Map([[3, [0, 50, 100, 50, 0, -50, -100, -50]]]),
    initialNodes: [],
    initialWires: [],
    allowedNodes: null,
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
    expect(result).toContain("shape: 'sine-full'");
    expect(result).toContain('amplitude: 100');
    expect(result).toContain('period: 256');
  });

  it('includes output samples as shape samples', () => {
    const result = exportCustomPuzzleAsSource(makeCustomPuzzle());
    expect(result).toContain("shape: 'samples'");
    expect(result).toContain('samples: [0, 50, 100, 50, 0, -50, -100, -50]');
  });

  it('exports allowedNodes as null when not set', () => {
    const result = exportCustomPuzzleAsSource(makeCustomPuzzle());
    expect(result).toContain('allowedNodes: null');
  });

  it('exports allowedNodes record when set', () => {
    const puzzle = makeCustomPuzzle({
      allowedNodes: { invert: -1, mix: 3 },
    });
    const result = exportCustomPuzzleAsSource(puzzle);
    expect(result).toContain('allowedNodes: { invert: -1, mix: 3 }');
  });

  it('exports initialNodes when present', () => {
    const puzzle = makeCustomPuzzle({
      initialNodes: [
        { id: 'node-1', type: 'invert', position: { col: 20, row: 10 }, params: {}, inputCount: 1, outputCount: 1 },
        { id: 'node-2', type: 'mix', position: { col: 30, row: 15 }, params: { mode: 'add' }, inputCount: 2, outputCount: 1, rotation: 90 },
      ],
    });
    const result = exportCustomPuzzleAsSource(puzzle);
    expect(result).toContain('initialNodes: [');
    expect(result).toContain("id: 'node-1'");
    expect(result).toContain("type: 'invert'");
    expect(result).toContain('position: { col: 20, row: 10 }');
    expect(result).toContain("id: 'node-2'");
    expect(result).toContain('rotation: 90');
    expect(result).toContain('"mode":"add"');
  });

  it('exports initialWires when present', () => {
    const puzzle = makeCustomPuzzle({
      initialWires: [
        { source: { chipId: 'node-1', portIndex: 0 }, target: { chipId: 'node-2', portIndex: 0 } },
      ],
    });
    const result = exportCustomPuzzleAsSource(puzzle);
    expect(result).toContain('initialWires: [');
    expect(result).toContain("chipId: 'node-1'");
    expect(result).toContain("chipId: 'node-2'");
  });

  it('omits initialNodes when empty', () => {
    const result = exportCustomPuzzleAsSource(makeCustomPuzzle());
    expect(result).not.toContain('initialNodes');
  });

  it('omits initialWires when empty', () => {
    const result = exportCustomPuzzleAsSource(makeCustomPuzzle());
    expect(result).not.toContain('initialWires');
  });

  it('uses puzzle title as test case name', () => {
    const result = exportCustomPuzzleAsSource(makeCustomPuzzle());
    expect(result).toContain("name: 'My Amplifier'");
  });

  it('always includes slotConfig with correct slot structure', () => {
    const result = exportCustomPuzzleAsSource(makeCustomPuzzle());
    expect(result).toContain('slotConfig');
    // Standard layout: input on slot 0, output on slot 3
    expect(result).toContain("{ active: true, direction: 'input' }");
    expect(result).toContain("{ active: true, direction: 'output' }");
    // Inactive slots
    expect(result).toContain("{ active: false, direction: 'input' }");
  });

  it('preserves non-standard layout (output on left side)', () => {
    const puzzle = makeCustomPuzzle({
      slots: [
        { direction: 'output' },  // output on left = non-standard
        { direction: 'off' },
        { direction: 'off' },
        { direction: 'input', waveform: { shape: 'sine-full', amplitude: 100, period: 256, phase: 0, offset: 0 } },
        { direction: 'off' },
        { direction: 'off' },
      ],
      targetSamples: new Map([[0, [10, 20, 30]]]),
    });
    const result = exportCustomPuzzleAsSource(puzzle);
    expect(result).toContain('slotConfig');
    // Slot 0 = output, slot 3 = input
    expect(result).toContain("{ active: true, direction: 'output' }");
    expect(result).toContain("{ active: true, direction: 'input' }");
  });

  it('assigns correct active values for mixed layout', () => {
    const puzzle = makeCustomPuzzle({
      slots: [
        { direction: 'input', waveform: { shape: 'sine-full', amplitude: 100, period: 256, phase: 0, offset: 0 } },
        { direction: 'output' },
        { direction: 'off' },
        { direction: 'input', waveform: { shape: 'triangle-half', amplitude: 50, period: 128, phase: 0, offset: 0 } },
        { direction: 'output' },
        { direction: 'off' },
      ],
      targetSamples: new Map([
        [1, [10, 20, 30]],
        [4, [40, 50, 60]],
      ]),
    });
    const result = exportCustomPuzzleAsSource(puzzle);
    expect(result).toContain('slotConfig');
    // 4 active slots + 2 inactive
    const activeCount = (result.match(/active: true/g) || []).length;
    const inactiveCount = (result.match(/active: false/g) || []).length;
    expect(activeCount).toBe(4);
    expect(inactiveCount).toBe(2);
  });

  it('handles multiple inputs and outputs', () => {
    const puzzle = makeCustomPuzzle({
      slots: [
        { direction: 'input', waveform: { shape: 'sine-full', amplitude: 100, period: 256, phase: 0, offset: 0 } },
        { direction: 'input', waveform: { shape: 'square-half', amplitude: 80, period: 128, phase: 0, offset: 0 } },
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
    expect(result).toContain("shape: 'sine-full'");
    expect(result).toContain("shape: 'square-half'");
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

  it('exports tutorialTitle when present', () => {
    const puzzle = makeCustomPuzzle({ tutorialTitle: 'Welcome' });
    const result = exportCustomPuzzleAsSource(puzzle);
    expect(result).toContain("tutorialTitle: 'Welcome'");
  });

  it('exports tutorialMessage when present', () => {
    const puzzle = makeCustomPuzzle({ tutorialMessage: 'Connect input to output' });
    const result = exportCustomPuzzleAsSource(puzzle);
    expect(result).toContain("tutorialMessage: 'Connect input to output'");
  });

  it('exports both tutorialTitle and tutorialMessage', () => {
    const puzzle = makeCustomPuzzle({
      tutorialTitle: 'Step 1',
      tutorialMessage: "Wire the nodes together",
    });
    const result = exportCustomPuzzleAsSource(puzzle);
    expect(result).toContain("tutorialTitle: 'Step 1'");
    expect(result).toContain("tutorialMessage: 'Wire the nodes together'");
  });

  it('escapes quotes in tutorialTitle and tutorialMessage', () => {
    const puzzle = makeCustomPuzzle({
      tutorialTitle: "It's time",
      tutorialMessage: "Let's go",
    });
    const result = exportCustomPuzzleAsSource(puzzle);
    expect(result).toContain("tutorialTitle: 'It\\'s time'");
    expect(result).toContain("tutorialMessage: 'Let\\'s go'");
  });

  it('omits tutorialTitle and tutorialMessage when not set', () => {
    const result = exportCustomPuzzleAsSource(makeCustomPuzzle());
    expect(result).not.toContain('tutorialTitle');
    expect(result).not.toContain('tutorialMessage');
  });

  it('ends with trailing newline', () => {
    const result = exportCustomPuzzleAsSource(makeCustomPuzzle());
    expect(result.endsWith('\n')).toBe(true);
  });
});

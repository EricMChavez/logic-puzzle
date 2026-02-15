import { describe, it, expect } from 'vitest';
import { createPuzzleGameboard } from './puzzle-gameboard.ts';
import { cpInputId, cpOutputId } from './connection-point-nodes.ts';
import type { PuzzleDefinition } from './types.ts';

function makePuzzle(activeInputs: number, activeOutputs: number): PuzzleDefinition {
  return {
    id: 'test',
    title: 'Test',
    description: '',
    activeInputs,
    activeOutputs,
    allowedNodes: null,
    testCases: [{ name: 'case1', inputs: [], expectedOutputs: [] }],
  };
}

describe('createPuzzleGameboard', () => {
  it('creates correct nodes for 1-input / 1-output puzzle', () => {
    const board = createPuzzleGameboard(makePuzzle(1, 1));

    expect(board.id).toBe('puzzle-test');
    expect(board.chips.size).toBe(2);
    expect(board.paths).toEqual([]);

    const input0 = board.chips.get(cpInputId(0));
    expect(input0).toBeDefined();
    expect(input0!.type).toBe('connection-input');
    expect(input0!.inputCount).toBe(0);
    expect(input0!.outputCount).toBe(1);

    const output0 = board.chips.get(cpOutputId(0));
    expect(output0).toBeDefined();
    expect(output0!.type).toBe('connection-output');
    expect(output0!.inputCount).toBe(1);
    expect(output0!.outputCount).toBe(0);
  });

  it('creates correct nodes for 2-input / 1-output puzzle', () => {
    const board = createPuzzleGameboard(makePuzzle(2, 1));

    expect(board.chips.size).toBe(3);

    // Both input CP nodes present
    expect(board.chips.has(cpInputId(0))).toBe(true);
    expect(board.chips.has(cpInputId(1))).toBe(true);

    // Single output CP node present
    expect(board.chips.has(cpOutputId(0))).toBe(true);

    // No extra nodes
    expect(board.chips.has(cpInputId(2))).toBe(false);
    expect(board.chips.has(cpOutputId(1))).toBe(false);
  });

  it('creates correct nodes for 3-input / 2-output puzzle', () => {
    const board = createPuzzleGameboard(makePuzzle(3, 2));

    expect(board.chips.size).toBe(5);

    for (let i = 0; i < 3; i++) {
      expect(board.chips.has(cpInputId(i))).toBe(true);
    }
    for (let i = 0; i < 2; i++) {
      expect(board.chips.has(cpOutputId(i))).toBe(true);
    }
  });

  it('uses puzzle id in gameboard id', () => {
    const puzzle = makePuzzle(1, 1);
    puzzle.id = 'my-puzzle';
    const board = createPuzzleGameboard(puzzle);
    expect(board.id).toBe('puzzle-my-puzzle');
  });

  it('starts with empty wires', () => {
    const board = createPuzzleGameboard(makePuzzle(2, 2));
    expect(board.paths).toEqual([]);
  });

  it('creates CP nodes with physicalSide/meterIndex when connectionPoints is set', () => {
    const puzzle: PuzzleDefinition = {
      ...makePuzzle(1, 1),
      connectionPoints: {
        left: [
          { active: false, direction: 'input' },
          { active: true, direction: 'output', cpIndex: 0 },  // output on left side
          { active: false, direction: 'input' },
        ],
        right: [
          { active: true, direction: 'input', cpIndex: 0 },   // input on right side
          { active: false, direction: 'input' },
          { active: false, direction: 'input' },
        ],
      },
    };

    const board = createPuzzleGameboard(puzzle);
    expect(board.chips.size).toBe(2);

    // Output on left side, meter slot 1
    const output0 = board.chips.get(cpOutputId(0));
    expect(output0).toBeDefined();
    expect(output0!.params).toEqual({ physicalSide: 'left', meterIndex: 1 });

    // Input on right side, meter slot 0
    const input0 = board.chips.get(cpInputId(0));
    expect(input0).toBeDefined();
    expect(input0!.params).toEqual({ physicalSide: 'right', meterIndex: 0 });
  });

  it('falls back to sequential creation when connectionPoints is not set', () => {
    const board = createPuzzleGameboard(makePuzzle(1, 1));
    const input0 = board.chips.get(cpInputId(0));
    expect(input0).toBeDefined();
    // No physicalSide/meterIndex when using fallback
    expect(input0!.params).toEqual({});
  });

  it('adds initialNodes from puzzle definition', () => {
    const puzzle: PuzzleDefinition = {
      ...makePuzzle(1, 1),
      initialNodes: [
        { id: 'node-1', type: 'invert', position: { col: 20, row: 10 }, params: {}, inputCount: 1, outputCount: 1 },
        { id: 'node-2', type: 'mix', position: { col: 30, row: 15 }, params: { mode: 'add' }, inputCount: 2, outputCount: 1, rotation: 90 },
      ],
    };

    const board = createPuzzleGameboard(puzzle);

    // 2 CP nodes + 2 initial nodes
    expect(board.chips.size).toBe(4);

    const node1 = board.chips.get('node-1');
    expect(node1).toBeDefined();
    expect(node1!.type).toBe('invert');
    expect(node1!.position).toEqual({ col: 20, row: 10 });
    expect(node1!.locked).toBe(true);

    const node2 = board.chips.get('node-2');
    expect(node2).toBeDefined();
    expect(node2!.type).toBe('mix');
    expect(node2!.params).toEqual({ mode: 'add' });
    expect(node2!.rotation).toBe(90);
    expect(node2!.locked).toBe(true);
  });

  it('adds initialWires from puzzle definition', () => {
    const puzzle: PuzzleDefinition = {
      ...makePuzzle(1, 1),
      initialNodes: [
        { id: 'node-1', type: 'invert', position: { col: 20, row: 10 }, params: {}, inputCount: 1, outputCount: 1 },
      ],
      initialWires: [
        { source: { chipId: cpInputId(0), portIndex: 0 }, target: { chipId: 'node-1', portIndex: 0 } },
      ],
    };

    const board = createPuzzleGameboard(puzzle);

    expect(board.paths.length).toBe(1);
    expect(board.paths[0].source.chipId).toBe(cpInputId(0));
    expect(board.paths[0].target.chipId).toBe('node-1');
    expect(board.paths[0].route).toBeDefined();
  });

  it('does not add wires when initialWires is empty', () => {
    const puzzle: PuzzleDefinition = {
      ...makePuzzle(1, 1),
      initialWires: [],
    };

    const board = createPuzzleGameboard(puzzle);
    expect(board.paths).toEqual([]);
  });
});

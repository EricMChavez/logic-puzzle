import { describe, it, expect } from 'vitest';
import { createPuzzleGameboard } from './puzzle-gameboard.ts';
import { cpInputId, cpOutputId } from './connection-point-nodes.ts';
import type { PuzzleDefinition, SlotConfig } from './types.ts';

function makePuzzle(activeInputs: number, activeOutputs: number): PuzzleDefinition {
  return {
    id: 'test',
    title: 'Test',
    description: '',
    activeInputs,
    activeOutputs,
    allowedChips: null,
    testCases: [{ name: 'case1', inputs: [], expectedOutputs: [] }],
  };
}

describe('createPuzzleGameboard', () => {
  it('creates correct chips for 1-input / 1-output puzzle', () => {
    const board = createPuzzleGameboard(makePuzzle(1, 1));

    expect(board.id).toBe('puzzle-test');
    expect(board.chips.size).toBe(2);
    expect(board.paths).toEqual([]);

    const input0 = board.chips.get(cpInputId(0));
    expect(input0).toBeDefined();
    expect(input0!.type).toBe('connection-input');
    expect(input0!.socketCount).toBe(0);
    expect(input0!.plugCount).toBe(1);

    const output0 = board.chips.get(cpOutputId(0));
    expect(output0).toBeDefined();
    expect(output0!.type).toBe('connection-output');
    expect(output0!.socketCount).toBe(1);
    expect(output0!.plugCount).toBe(0);
  });

  it('creates correct chips for 2-input / 1-output puzzle', () => {
    const board = createPuzzleGameboard(makePuzzle(2, 1));

    expect(board.chips.size).toBe(3);

    // Both input CP chips present
    expect(board.chips.has(cpInputId(0))).toBe(true);
    expect(board.chips.has(cpInputId(1))).toBe(true);

    // Single output CP chip present
    expect(board.chips.has(cpOutputId(0))).toBe(true);

    // No extra chips
    expect(board.chips.has(cpInputId(2))).toBe(false);
    expect(board.chips.has(cpOutputId(1))).toBe(false);
  });

  it('creates correct chips for 3-input / 2-output puzzle', () => {
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

  it('starts with empty paths', () => {
    const board = createPuzzleGameboard(makePuzzle(2, 2));
    expect(board.paths).toEqual([]);
  });

  it('creates CP chips with physicalSide/meterIndex when connectionPoints is set', () => {
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

  it('adds initialChips from puzzle definition', () => {
    const puzzle: PuzzleDefinition = {
      ...makePuzzle(1, 1),
      initialChips: [
        { id: 'chip-1', type: 'invert', position: { col: 20, row: 10 }, params: {}, socketCount: 1, plugCount: 1 },
        { id: 'chip-2', type: 'mix', position: { col: 30, row: 15 }, params: { mode: 'add' }, socketCount: 2, plugCount: 1, rotation: 90 },
      ],
    };

    const board = createPuzzleGameboard(puzzle);

    // 2 CP chips + 2 initial chips
    expect(board.chips.size).toBe(4);

    const chip1 = board.chips.get('chip-1');
    expect(chip1).toBeDefined();
    expect(chip1!.type).toBe('invert');
    expect(chip1!.position).toEqual({ col: 20, row: 10 });
    expect(chip1!.locked).toBe(true);

    const chip2 = board.chips.get('chip-2');
    expect(chip2).toBeDefined();
    expect(chip2!.type).toBe('mix');
    expect(chip2!.params).toEqual({ mode: 'add' });
    expect(chip2!.rotation).toBe(90);
    expect(chip2!.locked).toBe(true);
  });

  it('adds initialPaths from puzzle definition', () => {
    const puzzle: PuzzleDefinition = {
      ...makePuzzle(1, 1),
      initialChips: [
        { id: 'chip-1', type: 'invert', position: { col: 20, row: 10 }, params: {}, socketCount: 1, plugCount: 1 },
      ],
      initialPaths: [
        { source: { chipId: cpInputId(0), portIndex: 0 }, target: { chipId: 'chip-1', portIndex: 0 } },
      ],
    };

    const board = createPuzzleGameboard(puzzle);

    expect(board.paths.length).toBe(1);
    expect(board.paths[0].source.chipId).toBe(cpInputId(0));
    expect(board.paths[0].target.chipId).toBe('chip-1');
    expect(board.paths[0].route).toBeDefined();
  });

  it('creates CP chips with physicalSide/meterIndex from slotConfig', () => {
    const slotConfig: SlotConfig = [
      { active: false, direction: 'input' },   // slot 0: off
      { active: true, direction: 'input' },     // slot 1: input at left, meterIndex 1
      { active: false, direction: 'input' },    // slot 2: off
      { active: false, direction: 'output' },   // slot 3: off
      { active: true, direction: 'output' },    // slot 4: output at right, meterIndex 1
      { active: false, direction: 'output' },   // slot 5: off
    ];
    const puzzle: PuzzleDefinition = { ...makePuzzle(1, 1), slotConfig };

    const board = createPuzzleGameboard(puzzle);
    expect(board.chips.size).toBe(2);

    const input0 = board.chips.get(cpInputId(0));
    expect(input0).toBeDefined();
    expect(input0!.params).toEqual({ physicalSide: 'left', meterIndex: 1 });

    const output0 = board.chips.get(cpOutputId(0));
    expect(output0).toBeDefined();
    expect(output0!.params).toEqual({ physicalSide: 'right', meterIndex: 1 });
  });

  it('increments per-direction indices correctly with gaps in slotConfig', () => {
    const slotConfig: SlotConfig = [
      { active: true, direction: 'input' },     // slot 0: input 0
      { active: false, direction: 'input' },     // slot 1: off
      { active: true, direction: 'input' },      // slot 2: input 1
      { active: true, direction: 'output' },     // slot 3: output 0
      { active: false, direction: 'output' },    // slot 4: off
      { active: false, direction: 'output' },    // slot 5: off
    ];
    const puzzle: PuzzleDefinition = { ...makePuzzle(2, 1), slotConfig };

    const board = createPuzzleGameboard(puzzle);
    expect(board.chips.size).toBe(3);

    // First input at slot 0
    const input0 = board.chips.get(cpInputId(0));
    expect(input0!.params).toEqual({ physicalSide: 'left', meterIndex: 0 });

    // Second input at slot 2 (skipped slot 1)
    const input1 = board.chips.get(cpInputId(1));
    expect(input1!.params).toEqual({ physicalSide: 'left', meterIndex: 2 });

    // Output at slot 3
    const output0 = board.chips.get(cpOutputId(0));
    expect(output0!.params).toEqual({ physicalSide: 'right', meterIndex: 0 });
  });

  it('slotConfig takes priority over activeInputs/activeOutputs fallback', () => {
    // slotConfig puts input at slot 2 (bottom-left), but activeInputs=1 fallback would use slot 0
    const slotConfig: SlotConfig = [
      { active: false, direction: 'input' },
      { active: false, direction: 'input' },
      { active: true, direction: 'input' },     // slot 2: bottom-left
      { active: true, direction: 'output' },     // slot 3: top-right
      { active: false, direction: 'output' },
      { active: false, direction: 'output' },
    ];
    const puzzle: PuzzleDefinition = { ...makePuzzle(1, 1), slotConfig };

    const board = createPuzzleGameboard(puzzle);

    const input0 = board.chips.get(cpInputId(0));
    expect(input0!.params).toEqual({ physicalSide: 'left', meterIndex: 2 });
  });

  it('does not add paths when initialPaths is empty', () => {
    const puzzle: PuzzleDefinition = {
      ...makePuzzle(1, 1),
      initialPaths: [],
    };

    const board = createPuzzleGameboard(puzzle);
    expect(board.paths).toEqual([]);
  });
});

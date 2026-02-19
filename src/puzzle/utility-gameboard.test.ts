import { describe, it, expect } from 'vitest';
import { createUtilityGameboard } from './utility-gameboard.ts';
import { isUtilitySlotNode, getUtilitySlotIndex } from './connection-point-nodes.ts';

describe('createUtilityGameboard', () => {
  it('creates blank gameboard with no slot chips by default', () => {
    const board = createUtilityGameboard('test-id');

    const slotChips = Array.from(board.chips.values()).filter((n) =>
      isUtilitySlotNode(n.id),
    );

    expect(slotChips).toHaveLength(0);
    expect(board.chips.size).toBe(0);
  });

  it('gameboard ID contains utilityId', () => {
    const board = createUtilityGameboard('my-util');
    expect(board.id).toBe('utility-my-util');
  });

  it('has no paths in initial gameboard', () => {
    const board = createUtilityGameboard('test-id');
    expect(board.paths).toEqual([]);
  });

  it('creates slot chips when explicit directions are provided', () => {
    const board = createUtilityGameboard('test-id', ['input', 'input', 'input', 'output', 'output', 'output']);
    expect(board.chips.size).toBe(6);
    for (let i = 0; i < 3; i++) {
      const chip = board.chips.get(`__cp_utility_${i}__`);
      expect(chip).toBeDefined();
      expect(chip!.type).toBe('connection-input');
      expect(chip!.socketCount).toBe(0);
      expect(chip!.plugCount).toBe(1);
    }
    for (let i = 3; i < 6; i++) {
      const chip = board.chips.get(`__cp_utility_${i}__`);
      expect(chip).toBeDefined();
      expect(chip!.type).toBe('connection-output');
      expect(chip!.socketCount).toBe(1);
      expect(chip!.plugCount).toBe(0);
    }
  });

  it('slot chips have correct slotIndex params when directions provided', () => {
    const board = createUtilityGameboard('test-id', ['input', 'input', 'input', 'output', 'output', 'output']);
    const indices = Array.from(board.chips.values())
      .filter((n) => isUtilitySlotNode(n.id))
      .map((n) => getUtilitySlotIndex(n.id))
      .sort();
    expect(indices).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('respects custom directions', () => {
    const board = createUtilityGameboard('test-id', ['output', 'off', 'input', 'input', 'off', 'output']);

    // Slot 0: output
    expect(board.chips.get('__cp_utility_0__')?.type).toBe('connection-output');
    // Slot 1: off (no chip)
    expect(board.chips.has('__cp_utility_1__')).toBe(false);
    // Slot 2: input
    expect(board.chips.get('__cp_utility_2__')?.type).toBe('connection-input');
    // Slot 3: input
    expect(board.chips.get('__cp_utility_3__')?.type).toBe('connection-input');
    // Slot 4: off (no chip)
    expect(board.chips.has('__cp_utility_4__')).toBe(false);
    // Slot 5: output
    expect(board.chips.get('__cp_utility_5__')?.type).toBe('connection-output');

    expect(board.chips.size).toBe(4);
  });
});

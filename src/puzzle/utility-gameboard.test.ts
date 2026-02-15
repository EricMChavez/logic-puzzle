import { describe, it, expect } from 'vitest';
import { createUtilityGameboard } from './utility-gameboard.ts';
import { isUtilitySlotNode, getUtilitySlotIndex } from './connection-point-nodes.ts';

describe('createUtilityGameboard', () => {
  it('creates gameboard with 6 utility slot nodes', () => {
    const board = createUtilityGameboard('test-id');

    const slotNodes = Array.from(board.chips.values()).filter((n) =>
      isUtilitySlotNode(n.id),
    );

    expect(slotNodes).toHaveLength(6);
    expect(board.chips.size).toBe(6);
  });

  it('gameboard ID contains utilityId', () => {
    const board = createUtilityGameboard('my-util');
    expect(board.id).toBe('utility-my-util');
  });

  it('has no wires in initial gameboard', () => {
    const board = createUtilityGameboard('test-id');
    expect(board.paths).toEqual([]);
  });

  it('left slots (0-2) are connection-input, right slots (3-5) are connection-output by default', () => {
    const board = createUtilityGameboard('test-id');
    for (let i = 0; i < 3; i++) {
      const node = board.chips.get(`__cp_utility_${i}__`);
      expect(node).toBeDefined();
      expect(node!.type).toBe('connection-input');
      expect(node!.inputCount).toBe(0);
      expect(node!.outputCount).toBe(1);
    }
    for (let i = 3; i < 6; i++) {
      const node = board.chips.get(`__cp_utility_${i}__`);
      expect(node).toBeDefined();
      expect(node!.type).toBe('connection-output');
      expect(node!.inputCount).toBe(1);
      expect(node!.outputCount).toBe(0);
    }
  });

  it('slot nodes have slotIndex params 0-5', () => {
    const board = createUtilityGameboard('test-id');
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
    // Slot 1: off (no node)
    expect(board.chips.has('__cp_utility_1__')).toBe(false);
    // Slot 2: input
    expect(board.chips.get('__cp_utility_2__')?.type).toBe('connection-input');
    // Slot 3: input
    expect(board.chips.get('__cp_utility_3__')?.type).toBe('connection-input');
    // Slot 4: off (no node)
    expect(board.chips.has('__cp_utility_4__')).toBe(false);
    // Slot 5: output
    expect(board.chips.get('__cp_utility_5__')?.type).toBe('connection-output');

    expect(board.chips.size).toBe(4);
  });
});

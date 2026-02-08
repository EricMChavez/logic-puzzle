import { describe, it, expect } from 'vitest';
import { createUtilityGameboard } from './utility-gameboard.ts';
import { isBidirectionalCpNode } from './connection-point-nodes.ts';

describe('createUtilityGameboard', () => {
  it('creates gameboard with 6 bidirectional CP nodes', () => {
    const board = createUtilityGameboard('test-id');

    const bidirCPs = Array.from(board.nodes.values()).filter((n) =>
      isBidirectionalCpNode(n.id),
    );

    expect(bidirCPs).toHaveLength(6);
    expect(board.nodes.size).toBe(6);
  });

  it('gameboard ID contains utilityId', () => {
    const board = createUtilityGameboard('my-util');
    expect(board.id).toBe('utility-my-util');
  });

  it('has no wires in initial gameboard', () => {
    const board = createUtilityGameboard('test-id');
    expect(board.wires).toEqual([]);
  });

  it('bidirectional CPs have 1 input and 1 output', () => {
    const board = createUtilityGameboard('test-id');
    const bidirCPs = Array.from(board.nodes.values()).filter((n) =>
      isBidirectionalCpNode(n.id),
    );
    for (const cp of bidirCPs) {
      expect(cp.inputCount).toBe(1);
      expect(cp.outputCount).toBe(1);
      expect(cp.type).toBe('connection-point');
    }
  });

  it('CP nodes have cpIndex params 0-5', () => {
    const board = createUtilityGameboard('test-id');
    const indices = Array.from(board.nodes.values())
      .filter((n) => isBidirectionalCpNode(n.id))
      .map((n) => n.params.cpIndex as number)
      .sort();
    expect(indices).toEqual([0, 1, 2, 3, 4, 5]);
  });
});

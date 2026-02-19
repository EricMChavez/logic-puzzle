import { describe, it, expect } from 'vitest';
import { gameboardFromBakeMetadata } from './gameboard-from-metadata.ts';
import type { BakeMetadata } from '../engine/baking/index.ts';
import { cpInputId, cpOutputId, isConnectionPointNode } from './connection-point-nodes.ts';

function makeMetadata(overrides: Partial<BakeMetadata> = {}): BakeMetadata {
  return {
    topoOrder: [],
    chipConfigs: [],
    edges: [],
    socketCount: 1,
    plugCount: 1,
    ...overrides,
  };
}

describe('gameboardFromBakeMetadata', () => {
  it('creates correct board id', () => {
    const board = gameboardFromBakeMetadata('inv1', makeMetadata());
    expect(board.id).toBe('viewer-puzzle:inv1');
  });

  it('single invert node → 3 nodes (2 CPs + 1 processing), correct wires', () => {
    const meta = makeMetadata({
      socketCount: 1,
      plugCount: 1,
      topoOrder: [cpInputId(0), 'n1', cpOutputId(0)],
      chipConfigs: [
        { id: cpInputId(0), type: 'connection-input', params: {}, socketCount: 0, plugCount: 1 },
        { id: 'n1', type: 'invert', params: {}, socketCount: 1, plugCount: 1 },
        { id: cpOutputId(0), type: 'connection-output', params: {}, socketCount: 1, plugCount: 0 },
      ],
      edges: [
        { fromChipId: cpInputId(0), fromPort: 0, toChipId: 'n1', toPort: 0 },
        { fromChipId: 'n1', fromPort: 0, toChipId: cpOutputId(0), toPort: 0 },
      ],
    });

    const board = gameboardFromBakeMetadata('inv1', meta);

    expect(board.chips.size).toBe(3);
    expect(board.chips.has(cpInputId(0))).toBe(true);
    expect(board.chips.has(cpOutputId(0))).toBe(true);
    expect(board.chips.has('n1')).toBe(true);

    const n1 = board.chips.get('n1')!;
    expect(n1.type).toBe('invert');
    expect(n1.socketCount).toBe(1);
    expect(n1.plugCount).toBe(1);

    expect(board.paths).toHaveLength(2);
    expect(board.paths[0].source.chipId).toBe(cpInputId(0));
    expect(board.paths[0].target.chipId).toBe('n1');
    expect(board.paths[1].source.chipId).toBe('n1');
    expect(board.paths[1].target.chipId).toBe(cpOutputId(0));
  });

  it('multi-node graph → all nodes present, non-overlapping positions', () => {
    const meta = makeMetadata({
      socketCount: 2,
      plugCount: 1,
      topoOrder: [cpInputId(0), cpInputId(1), 'a', 'b', 'c', cpOutputId(0)],
      chipConfigs: [
        { id: cpInputId(0), type: 'connection-input', params: {}, socketCount: 0, plugCount: 1 },
        { id: cpInputId(1), type: 'connection-input', params: {}, socketCount: 0, plugCount: 1 },
        { id: 'a', type: 'invert', params: {}, socketCount: 1, plugCount: 1 },
        { id: 'b', type: 'invert', params: {}, socketCount: 1, plugCount: 1 },
        { id: 'c', type: 'mix', params: { mode: 'Add' }, socketCount: 2, plugCount: 1 },
        { id: cpOutputId(0), type: 'connection-output', params: {}, socketCount: 1, plugCount: 0 },
      ],
      edges: [
        { fromChipId: cpInputId(0), fromPort: 0, toChipId: 'a', toPort: 0 },
        { fromChipId: cpInputId(1), fromPort: 0, toChipId: 'b', toPort: 0 },
        { fromChipId: 'a', fromPort: 0, toChipId: 'c', toPort: 0 },
        { fromChipId: 'b', fromPort: 0, toChipId: 'c', toPort: 1 },
        { fromChipId: 'c', fromPort: 0, toChipId: cpOutputId(0), toPort: 0 },
      ],
    });

    const board = gameboardFromBakeMetadata('multi', meta);

    // 2 input CPs + 1 output CP + 3 processing = 6
    expect(board.chips.size).toBe(6);

    // All processing nodes present
    expect(board.chips.has('a')).toBe(true);
    expect(board.chips.has('b')).toBe(true);
    expect(board.chips.has('c')).toBe(true);

    // Check non-overlapping positions for processing nodes
    const positions = ['a', 'b', 'c'].map((id) => board.chips.get(id)!.position);
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const same = positions[i].col === positions[j].col && positions[i].row === positions[j].row;
        expect(same).toBe(false);
      }
    }
  });

  it('direct CP-to-CP → only CP nodes', () => {
    const meta = makeMetadata({
      socketCount: 1,
      plugCount: 1,
      topoOrder: [cpInputId(0), cpOutputId(0)],
      chipConfigs: [
        { id: cpInputId(0), type: 'connection-input', params: {}, socketCount: 0, plugCount: 1 },
        { id: cpOutputId(0), type: 'connection-output', params: {}, socketCount: 1, plugCount: 0 },
      ],
      edges: [
        { fromChipId: cpInputId(0), fromPort: 0, toChipId: cpOutputId(0), toPort: 0 },
      ],
    });

    const board = gameboardFromBakeMetadata('passthrough', meta);

    expect(board.chips.size).toBe(2);
    for (const [id] of board.chips) {
      expect(isConnectionPointNode(id)).toBe(true);
    }
    expect(board.paths).toHaveLength(1);
  });

  it('preserves node params from metadata', () => {
    const meta = makeMetadata({
      socketCount: 1,
      plugCount: 1,
      chipConfigs: [
        { id: cpInputId(0), type: 'connection-input', params: {}, socketCount: 0, plugCount: 1 },
        { id: 'n1', type: 'threshold', params: { threshold: 42 }, socketCount: 1, plugCount: 1 },
        { id: cpOutputId(0), type: 'connection-output', params: {}, socketCount: 1, plugCount: 0 },
      ],
      edges: [],
    });

    const board = gameboardFromBakeMetadata('param-test', meta);
    const n1 = board.chips.get('n1')!;
    expect(n1.params).toEqual({ threshold: 42 });
  });
});

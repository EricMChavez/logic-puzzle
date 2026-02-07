import { describe, it, expect } from 'vitest';
import { gameboardFromBakeMetadata } from './gameboard-from-metadata.ts';
import type { BakeMetadata } from '../engine/baking/index.ts';
import { cpInputId, cpOutputId, isConnectionPointNode } from './connection-point-nodes.ts';

function makeMetadata(overrides: Partial<BakeMetadata> = {}): BakeMetadata {
  return {
    topoOrder: [],
    nodeConfigs: [],
    edges: [],
    inputDelays: [],
    inputCount: 1,
    outputCount: 1,
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
      inputCount: 1,
      outputCount: 1,
      topoOrder: [cpInputId(0), 'n1', cpOutputId(0)],
      nodeConfigs: [
        { id: cpInputId(0), type: 'connection-input', params: {}, inputCount: 0, outputCount: 1 },
        { id: 'n1', type: 'invert', params: {}, inputCount: 1, outputCount: 1 },
        { id: cpOutputId(0), type: 'connection-output', params: {}, inputCount: 1, outputCount: 0 },
      ],
      edges: [
        { fromNodeId: cpInputId(0), fromPort: 0, toNodeId: 'n1', toPort: 0, wtsDelay: 16 },
        { fromNodeId: 'n1', fromPort: 0, toNodeId: cpOutputId(0), toPort: 0, wtsDelay: 16 },
      ],
    });

    const board = gameboardFromBakeMetadata('inv1', meta);

    expect(board.nodes.size).toBe(3);
    expect(board.nodes.has(cpInputId(0))).toBe(true);
    expect(board.nodes.has(cpOutputId(0))).toBe(true);
    expect(board.nodes.has('n1')).toBe(true);

    const n1 = board.nodes.get('n1')!;
    expect(n1.type).toBe('invert');
    expect(n1.inputCount).toBe(1);
    expect(n1.outputCount).toBe(1);

    expect(board.wires).toHaveLength(2);
    expect(board.wires[0].source.nodeId).toBe(cpInputId(0));
    expect(board.wires[0].target.nodeId).toBe('n1');
    expect(board.wires[1].source.nodeId).toBe('n1');
    expect(board.wires[1].target.nodeId).toBe(cpOutputId(0));
  });

  it('multi-node graph → all nodes present, non-overlapping positions', () => {
    const meta = makeMetadata({
      inputCount: 2,
      outputCount: 1,
      topoOrder: [cpInputId(0), cpInputId(1), 'a', 'b', 'c', cpOutputId(0)],
      nodeConfigs: [
        { id: cpInputId(0), type: 'connection-input', params: {}, inputCount: 0, outputCount: 1 },
        { id: cpInputId(1), type: 'connection-input', params: {}, inputCount: 0, outputCount: 1 },
        { id: 'a', type: 'invert', params: {}, inputCount: 1, outputCount: 1 },
        { id: 'b', type: 'invert', params: {}, inputCount: 1, outputCount: 1 },
        { id: 'c', type: 'mix', params: { mode: 'Add' }, inputCount: 2, outputCount: 1 },
        { id: cpOutputId(0), type: 'connection-output', params: {}, inputCount: 1, outputCount: 0 },
      ],
      edges: [
        { fromNodeId: cpInputId(0), fromPort: 0, toNodeId: 'a', toPort: 0, wtsDelay: 16 },
        { fromNodeId: cpInputId(1), fromPort: 0, toNodeId: 'b', toPort: 0, wtsDelay: 16 },
        { fromNodeId: 'a', fromPort: 0, toNodeId: 'c', toPort: 0, wtsDelay: 16 },
        { fromNodeId: 'b', fromPort: 0, toNodeId: 'c', toPort: 1, wtsDelay: 16 },
        { fromNodeId: 'c', fromPort: 0, toNodeId: cpOutputId(0), toPort: 0, wtsDelay: 16 },
      ],
    });

    const board = gameboardFromBakeMetadata('multi', meta);

    // 2 input CPs + 1 output CP + 3 processing = 6
    expect(board.nodes.size).toBe(6);

    // All processing nodes present
    expect(board.nodes.has('a')).toBe(true);
    expect(board.nodes.has('b')).toBe(true);
    expect(board.nodes.has('c')).toBe(true);

    // Check non-overlapping positions for processing nodes
    const positions = ['a', 'b', 'c'].map((id) => board.nodes.get(id)!.position);
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const same = positions[i].col === positions[j].col && positions[i].row === positions[j].row;
        expect(same).toBe(false);
      }
    }
  });

  it('direct CP-to-CP → only CP nodes', () => {
    const meta = makeMetadata({
      inputCount: 1,
      outputCount: 1,
      topoOrder: [cpInputId(0), cpOutputId(0)],
      nodeConfigs: [
        { id: cpInputId(0), type: 'connection-input', params: {}, inputCount: 0, outputCount: 1 },
        { id: cpOutputId(0), type: 'connection-output', params: {}, inputCount: 1, outputCount: 0 },
      ],
      edges: [
        { fromNodeId: cpInputId(0), fromPort: 0, toNodeId: cpOutputId(0), toPort: 0, wtsDelay: 16 },
      ],
    });

    const board = gameboardFromBakeMetadata('passthrough', meta);

    expect(board.nodes.size).toBe(2);
    for (const [id] of board.nodes) {
      expect(isConnectionPointNode(id)).toBe(true);
    }
    expect(board.wires).toHaveLength(1);
  });

  it('preserves node params from metadata', () => {
    const meta = makeMetadata({
      inputCount: 1,
      outputCount: 1,
      nodeConfigs: [
        { id: cpInputId(0), type: 'connection-input', params: {}, inputCount: 0, outputCount: 1 },
        { id: 'n1', type: 'threshold', params: { threshold: 42 }, inputCount: 1, outputCount: 1 },
        { id: cpOutputId(0), type: 'connection-output', params: {}, inputCount: 1, outputCount: 0 },
      ],
      edges: [],
    });

    const board = gameboardFromBakeMetadata('param-test', meta);
    const n1 = board.nodes.get('n1')!;
    expect(n1.params).toEqual({ threshold: 42 });
  });
});

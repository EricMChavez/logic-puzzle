import { describe, it, expect } from 'vitest';
import {
  cpInputId,
  cpOutputId,
  cpBidirectionalId,
  isConnectionPointNode,
  isConnectionInputNode,
  isConnectionOutputNode,
  isBidirectionalCpNode,
  getConnectionPointIndex,
  getBidirectionalCpIndex,
  createConnectionPointNode,
  createBidirectionalConnectionPointNode,
} from './connection-point-nodes.ts';

describe('cpInputId / cpOutputId', () => {
  it('generates expected ID format', () => {
    expect(cpInputId(0)).toBe('__cp_input_0__');
    expect(cpInputId(2)).toBe('__cp_input_2__');
    expect(cpOutputId(0)).toBe('__cp_output_0__');
    expect(cpOutputId(1)).toBe('__cp_output_1__');
  });
});

describe('isConnectionPointNode', () => {
  it('returns true for input CP nodes', () => {
    expect(isConnectionPointNode('__cp_input_0__')).toBe(true);
  });
  it('returns true for output CP nodes', () => {
    expect(isConnectionPointNode('__cp_output_1__')).toBe(true);
  });
  it('returns false for regular node IDs', () => {
    expect(isConnectionPointNode('abc123')).toBe(false);
    expect(isConnectionPointNode('__cp_input')).toBe(false);
  });
});

describe('isConnectionInputNode / isConnectionOutputNode', () => {
  it('distinguishes input from output', () => {
    expect(isConnectionInputNode('__cp_input_0__')).toBe(true);
    expect(isConnectionOutputNode('__cp_input_0__')).toBe(false);
    expect(isConnectionOutputNode('__cp_output_2__')).toBe(true);
    expect(isConnectionInputNode('__cp_output_2__')).toBe(false);
  });
});

describe('getConnectionPointIndex', () => {
  it('extracts index from input CP', () => {
    expect(getConnectionPointIndex('__cp_input_0__')).toBe(0);
    expect(getConnectionPointIndex('__cp_input_2__')).toBe(2);
  });
  it('extracts index from output CP', () => {
    expect(getConnectionPointIndex('__cp_output_1__')).toBe(1);
  });
  it('returns -1 for non-CP IDs', () => {
    expect(getConnectionPointIndex('regular-node')).toBe(-1);
  });
});

describe('createConnectionPointNode', () => {
  it('creates input CP with 0 inputs and 1 output', () => {
    const node = createConnectionPointNode('input', 0);
    expect(node.id).toBe('__cp_input_0__');
    expect(node.type).toBe('connection-input');
    expect(node.socketCount).toBe(0);
    expect(node.plugCount).toBe(1);
  });

  it('creates output CP with 1 input and 0 outputs', () => {
    const node = createConnectionPointNode('output', 1);
    expect(node.id).toBe('__cp_output_1__');
    expect(node.type).toBe('connection-output');
    expect(node.socketCount).toBe(1);
    expect(node.plugCount).toBe(0);
  });
});

describe('cpBidirectionalId', () => {
  it('generates expected ID format', () => {
    expect(cpBidirectionalId(0)).toBe('__cp_bidir_0__');
    expect(cpBidirectionalId(5)).toBe('__cp_bidir_5__');
  });
});

describe('isBidirectionalCpNode', () => {
  it('returns true for bidir CP nodes', () => {
    expect(isBidirectionalCpNode('__cp_bidir_0__')).toBe(true);
    expect(isBidirectionalCpNode('__cp_bidir_5__')).toBe(true);
  });
  it('returns false for regular CP nodes', () => {
    expect(isBidirectionalCpNode('__cp_input_0__')).toBe(false);
    expect(isBidirectionalCpNode('__cp_output_0__')).toBe(false);
  });
  it('returns false for regular node IDs', () => {
    expect(isBidirectionalCpNode('abc123')).toBe(false);
  });
});

describe('getBidirectionalCpIndex', () => {
  it('extracts index from bidir CP', () => {
    expect(getBidirectionalCpIndex('__cp_bidir_0__')).toBe(0);
    expect(getBidirectionalCpIndex('__cp_bidir_3__')).toBe(3);
  });
  it('returns -1 for non-bidir IDs', () => {
    expect(getBidirectionalCpIndex('__cp_input_0__')).toBe(-1);
    expect(getBidirectionalCpIndex('regular-node')).toBe(-1);
  });
});

describe('isConnectionPointNode with bidir CPs', () => {
  it('returns true for bidir CP nodes', () => {
    expect(isConnectionPointNode('__cp_bidir_0__')).toBe(true);
    expect(isConnectionPointNode('__cp_bidir_5__')).toBe(true);
  });
});

describe('createBidirectionalConnectionPointNode', () => {
  it('creates bidir CP with 1 input and 1 output', () => {
    const node = createBidirectionalConnectionPointNode(2);
    expect(node.id).toBe('__cp_bidir_2__');
    expect(node.type).toBe('connection-point');
    expect(node.socketCount).toBe(1);
    expect(node.plugCount).toBe(1);
    expect(node.params.cpIndex).toBe(2);
  });
});

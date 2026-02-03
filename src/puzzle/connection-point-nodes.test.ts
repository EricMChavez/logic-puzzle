import { describe, it, expect } from 'vitest';
import {
  cpInputId,
  cpOutputId,
  isConnectionPointNode,
  isConnectionInputNode,
  isConnectionOutputNode,
  getConnectionPointIndex,
  createConnectionPointNode,
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
    expect(node.inputCount).toBe(0);
    expect(node.outputCount).toBe(1);
  });

  it('creates output CP with 1 input and 0 outputs', () => {
    const node = createConnectionPointNode('output', 1);
    expect(node.id).toBe('__cp_output_1__');
    expect(node.type).toBe('connection-output');
    expect(node.inputCount).toBe(1);
    expect(node.outputCount).toBe(0);
  });
});

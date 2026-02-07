import { describe, it, expect } from 'vitest';
import { getNodePortPosition, getConnectionPointPosition } from './port-positions.ts';
import type { NodeState } from '../../shared/types/index.ts';
import {
  FUNDAMENTAL_GRID_COLS,
  FUNDAMENTAL_GRID_ROWS,
  UTILITY_GRID_COLS,
  UTILITY_GRID_ROWS,
  PLAYABLE_START,
  METER_RIGHT_START,
} from '../../shared/grid/index.ts';
import { METER_GRID_ROWS, METER_GAP_ROWS, METER_VERTICAL_OFFSETS } from '../meters/meter-types.ts';

function makeNode(id: string, type: string, col: number, row: number, inputs = 1, outputs = 1): NodeState {
  return { id, type, position: { col, row }, params: {}, inputCount: inputs, outputCount: outputs };
}

describe('getNodePortPosition', () => {
  it('ports are at integer grid positions for wire routing', () => {
    const cellSize = 40;
    const node = makeNode('n1', 'invert', 5, 3, 2, 1);
    // 2 inputs on a 2-row node: ports at rows 3 and 4 (integer positions)
    // port 0: row = 3 + floor(0 * 2 / 2) = 3
    // port 1: row = 3 + floor(1 * 2 / 2) = 4

    const pos0 = getNodePortPosition(node, 'input', 0, cellSize);
    const pos1 = getNodePortPosition(node, 'input', 1, cellSize);

    expect(pos0.y).toBe(3 * cellSize); // row 3
    expect(pos1.y).toBe(4 * cellSize); // row 4
  });

  it('output port x-position uses grid-based node width', () => {
    const cellSize = 50;
    const node = makeNode('n1', 'invert', 5, 3);
    const nodeWidth = FUNDAMENTAL_GRID_COLS * cellSize;
    const nodeX = 5 * cellSize;

    const pos = getNodePortPosition(node, 'output', 0, cellSize);
    expect(pos.x).toBe(nodeX + nodeWidth);
  });

  it('input port x-position is at left edge of node', () => {
    const cellSize = 50;
    const node = makeNode('n1', 'invert', 5, 3);
    const nodeX = 5 * cellSize;

    const pos = getNodePortPosition(node, 'input', 0, cellSize);
    expect(pos.x).toBe(nodeX);
  });

  it('utility node single port is centered at integer position', () => {
    const cellSize = 40;
    const node = makeNode('u1', 'utility:scope', 4, 2, 1, 1);
    const nodeX = 4 * cellSize;
    const nodeWidth = UTILITY_GRID_COLS * cellSize;

    const outPos = getNodePortPosition(node, 'output', 0, cellSize);
    expect(outPos.x).toBe(nodeX + nodeWidth);

    const inPos = getNodePortPosition(node, 'input', 0, cellSize);
    expect(inPos.x).toBe(nodeX);

    // Single port on 3-row node: centered at row = 2 + floor(3/2) = 2 + 1 = 3
    expect(outPos.y).toBe((2 + 1) * cellSize);
  });

  it('puzzle node with many ports at integer positions', () => {
    const cellSize = 40;
    const node = makeNode('p1', 'puzzle:abc', 5, 1, 4, 1);
    // 4 inputs on a 5-row node (max(2, 4+1) = 5)
    // port 0: row = 1 + floor(0 * 5 / 4) = 1
    // port 3: row = 1 + floor(3 * 5 / 4) = 1 + 3 = 4

    const pos0 = getNodePortPosition(node, 'input', 0, cellSize);
    const pos3 = getNodePortPosition(node, 'input', 3, cellSize);

    expect(pos0.y).toBe(1 * cellSize); // row 1
    expect(pos3.y).toBe(4 * cellSize); // row 4
  });
});

describe('getConnectionPointPosition', () => {
  const cellSize = 40;

  it('input CPs are positioned at PLAYABLE_START gridline', () => {
    const pos = getConnectionPointPosition('input', 0, cellSize);
    expect(pos.x).toBe(PLAYABLE_START * cellSize);
  });

  it('output CPs are positioned at METER_RIGHT_START gridline', () => {
    const pos = getConnectionPointPosition('output', 0, cellSize);
    expect(pos.x).toBe(METER_RIGHT_START * cellSize);
  });

  it('CPs are vertically centered within their meter slot (with vertical offsets)', () => {
    // Layout: no margin, meters 12 rows each, no gaps, with per-meter vertical offsets
    // Meter centers at rows: (0 + i*12 + offset[i] + 6)
    const meterTopMargin = 0;
    const meterStride = METER_GRID_ROWS + METER_GAP_ROWS; // 12 + 0 = 12
    for (let i = 0; i < 3; i++) {
      const pos = getConnectionPointPosition('input', i, cellSize);
      const verticalOffset = METER_VERTICAL_OFFSETS[i];
      const expectedY = (meterTopMargin + i * meterStride + verticalOffset + METER_GRID_ROWS / 2) * cellSize;
      expect(pos.y).toBe(expectedY);
    }
  });

  it('scales with cellSize', () => {
    const pos32 = getConnectionPointPosition('input', 1, 32);
    const pos64 = getConnectionPointPosition('input', 1, 64);
    expect(pos64.x).toBe(pos32.x * 2);
    expect(pos64.y).toBe(pos32.y * 2);
  });
});

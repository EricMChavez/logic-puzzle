import { describe, it, expect } from 'vitest';
import { hitTest, hitTestMeter, findNearestSnapTarget, WIRE_SNAP_RADIUS_CELLS } from './hit-testing.ts';
import type { ChipState, Path } from '../../shared/types/index.ts';
import { createPath } from '../../shared/types/index.ts';
import {
  GRID_COLS,
  GRID_ROWS,
  FUNDAMENTAL_GRID_COLS,
  FUNDAMENTAL_GRID_ROWS,
  UTILITY_GRID_COLS,
  UTILITY_GRID_ROWS,
  METER_RIGHT_START,
  PLAYABLE_START,
} from '../../shared/grid/index.ts';
import { getNodePortPosition } from './port-positions.ts';
import { NODE_STYLE } from '../../shared/constants/index.ts';
import type { MeterKey, MeterSlotState } from '../meters/meter-types.ts';
import { METER_GRID_COLS, METER_GRID_ROWS, CHANNEL_RATIOS } from '../meters/meter-types.ts';
import { cpBidirectionalId } from '../../puzzle/connection-point-nodes.ts';

function makeNode(id: string, type: string, col: number, row: number, inputs = 1, outputs = 1): ChipState {
  return { id, type, position: { col, row }, params: {}, socketCount: inputs, plugCount: outputs };
}

function makeWire(id: string, route: Array<{ col: number; row: number }>): Path {
  const w = createPath(id, { chipId: 'a', portIndex: 0, side: 'plug' }, { chipId: 'b', portIndex: 0, side: 'socket' });
  w.route = route;
  return w;
}

describe('hitTest node body', () => {
  const cellSize = 40;
  const canvasWidth = GRID_COLS * cellSize;
  const canvasHeight = GRID_ROWS * cellSize;

  it('detects fundamental node body with 3x2 dimensions', () => {
    const nodes = new Map<string, ChipState>();
    nodes.set('n1', makeNode('n1', 'invert', 10, 6));

    const nodeX = 10 * cellSize;
    const nodeY = 6 * cellSize;

    // Center of node should hit
    const result = hitTest(
      nodeX + (FUNDAMENTAL_GRID_COLS * cellSize) / 2,
      nodeY + (FUNDAMENTAL_GRID_ROWS * cellSize) / 2,
      nodes, canvasWidth, canvasHeight, cellSize,
    );
    expect(result.type).toBe('node');
    if (result.type === 'node') expect(result.chipId).toBe('n1');
  });

  it('does not hit outside fundamental node bounds (with body offset)', () => {
    const nodes = new Map<string, ChipState>();
    nodes.set('n1', makeNode('n1', 'invert', 10, 6));

    const nodeX = 10 * cellSize;
    const nodeY = 6 * cellSize;
    const bodyOffset = NODE_STYLE.BODY_OFFSET * cellSize;

    // Well past right edge of offset body, far enough to avoid port hit radius
    const result = hitTest(
      nodeX + bodyOffset + FUNDAMENTAL_GRID_COLS * cellSize + 20,
      nodeY + cellSize / 2, // Center of first row (between port positions for 1-output node)
      nodes, canvasWidth, canvasHeight, cellSize,
    );
    expect(result.type).toBe('empty');
  });

  it('uses variable dimensions for utility nodes (5x3)', () => {
    const nodes = new Map<string, ChipState>();
    nodes.set('u1', makeNode('u1', 'utility:scope', 10, 6));

    const nodeX = 10 * cellSize;
    const nodeY = 6 * cellSize;

    // Point within 5x3 area but outside 3x2 area
    const result = hitTest(
      nodeX + 4 * cellSize - 5,
      nodeY + 2 * cellSize + 5,
      nodes, canvasWidth, canvasHeight, cellSize,
    );
    expect(result.type).toBe('node');
    if (result.type === 'node') expect(result.chipId).toBe('u1');
  });

  it('does not hit utility node outside 5x3 bounds (with body offset)', () => {
    const nodes = new Map<string, ChipState>();
    nodes.set('u1', makeNode('u1', 'utility:scope', 10, 6));

    const nodeX = 10 * cellSize;
    const nodeY = 6 * cellSize;
    const bodyOffset = NODE_STYLE.BODY_OFFSET * cellSize;

    // Well past 5-col right edge of offset body, far enough to avoid port hit radius
    const result = hitTest(
      nodeX + bodyOffset + UTILITY_GRID_COLS * cellSize + 20,
      nodeY + cellSize / 2, // Centered vertically to avoid ports at gridlines
      nodes, canvasWidth, canvasHeight, cellSize,
    );
    expect(result.type).toBe('empty');

    // Well past 3-row bottom edge, avoiding input ports on left edge
    const result2 = hitTest(
      nodeX + bodyOffset + cellSize, // Away from left edge ports, accounting for offset
      nodeY + UTILITY_GRID_ROWS * cellSize + 20,
      nodes, canvasWidth, canvasHeight, cellSize,
    );
    expect(result2.type).toBe('empty');
  });

  it('uses variable height for puzzle nodes', () => {
    const nodes = new Map<string, ChipState>();
    // 4 inputs → 5 rows tall
    nodes.set('p1', makeNode('p1', 'puzzle:abc', 10, 6, 4, 1));

    const nodeX = 10 * cellSize;
    const nodeY = 6 * cellSize;

    // Point in 5th row (outside 2-row fundamental but inside 5-row puzzle)
    const result = hitTest(
      nodeX + cellSize,
      nodeY + 4 * cellSize - 5,
      nodes, canvasWidth, canvasHeight, cellSize,
    );
    expect(result.type).toBe('node');
    if (result.type === 'node') expect(result.chipId).toBe('p1');
  });
});

describe('hitTest wire', () => {
  const cellSize = 40;
  const canvasWidth = GRID_COLS * cellSize;
  const canvasHeight = GRID_ROWS * cellSize;
  const emptyNodes = new Map<string, ChipState>();

  it('detects hit on horizontal wire segment', () => {
    // Wire from (10,5) to (14,5) — horizontal at row 5 gridline
    const wire = makeWire('w1', [
      { col: 10, row: 5 },
      { col: 14, row: 5 },
    ]);
    // Click near gridline (wires are on gridlines, not cell centers)
    const x = 12 * cellSize;
    const y = 5 * cellSize;
    const result = hitTest(x, y, emptyNodes, canvasWidth, canvasHeight, cellSize, [wire]);
    expect(result.type).toBe('path');
    if (result.type === 'path') expect(result.pathId).toBe('w1');
  });

  it('detects hit on vertical wire segment', () => {
    const wire = makeWire('w1', [
      { col: 10, row: 3 },
      { col: 10, row: 8 },
    ]);
    // Click on gridline
    const x = 10 * cellSize;
    const y = 6 * cellSize;
    const result = hitTest(x, y, emptyNodes, canvasWidth, canvasHeight, cellSize, [wire]);
    expect(result.type).toBe('path');
    if (result.type === 'path') expect(result.pathId).toBe('w1');
  });

  it('does not hit wire when far away', () => {
    const wire = makeWire('w1', [
      { col: 10, row: 5 },
      { col: 14, row: 5 },
    ]);
    // Click far below the wire (at row 10 gridline, wire is at row 5)
    const x = 12 * cellSize;
    const y = 10 * cellSize;
    const result = hitTest(x, y, emptyNodes, canvasWidth, canvasHeight, cellSize, [wire]);
    expect(result.type).toBe('empty');
  });

  it('node body takes priority over wire', () => {
    const nodes = new Map<string, ChipState>();
    nodes.set('n1', makeNode('n1', 'invert', 10, 5));

    const wire = makeWire('w1', [
      { col: 10, row: 5 },
      { col: 14, row: 5 },
    ]);

    // Click inside node body (which overlaps with wire path on gridline)
    const x = 11 * cellSize;
    const y = 5 * cellSize + 3; // Slightly inside the node
    const result = hitTest(x, y, nodes, canvasWidth, canvasHeight, cellSize, [wire]);
    expect(result.type).toBe('node');
  });

  it('ignores wires with fewer than 2 path points', () => {
    const wire = makeWire('w1', [{ col: 20, row: 5 }]);
    const x = 20 * cellSize;
    const y = 5 * cellSize;
    const result = hitTest(x, y, emptyNodes, canvasWidth, canvasHeight, cellSize, [wire]);
    expect(result.type).toBe('empty');
  });

  it('detects hit on multi-segment wire', () => {
    const wire = makeWire('w1', [
      { col: 5, row: 5 },
      { col: 10, row: 5 },
      { col: 10, row: 10 },
    ]);
    // Click on the vertical segment (at gridline)
    const x = 10 * cellSize;
    const y = 8 * cellSize;
    const result = hitTest(x, y, emptyNodes, canvasWidth, canvasHeight, cellSize, [wire]);
    expect(result.type).toBe('path');
    if (result.type === 'path') expect(result.pathId).toBe('w1');
  });
});

describe('hitTestMeter', () => {
  const cellSize = 40;

  function makeMeterSlots(): Map<MeterKey, MeterSlotState> {
    const slots = new Map<MeterKey, MeterSlotState>();
    for (let i = 0; i < 3; i++) {
      slots.set(`slot:${i}` as MeterKey, { mode: 'input' });
      slots.set(`slot:${i + 3}` as MeterKey, { mode: 'output' });
    }
    return slots;
  }

  it('hits left meter waveform area when clicked', () => {
    const slots = makeMeterSlots();
    // Click in waveform area of left meter index 0 (first ~59% of meter width)
    const waveformWidth = METER_GRID_COLS * cellSize * CHANNEL_RATIOS.waveform;
    const x = waveformWidth / 2; // Center of waveform area
    const y = (METER_GRID_ROWS * cellSize) / 2; // Center of first meter vertically
    const result = hitTestMeter(x, y, cellSize, slots);
    expect(result).not.toBeNull();
    expect(result?.type).toBe('meter');
    if (result?.type === 'meter') expect(result.slotIndex).toBe(0);
  });

  it('hits right meter waveform area when clicked', () => {
    const slots = makeMeterSlots();
    // Right meter waveform is at the right edge of the meter
    const meterX = METER_RIGHT_START * cellSize;
    const meterW = METER_GRID_COLS * cellSize;
    const waveformWidth = meterW * CHANNEL_RATIOS.waveform;
    // Waveform starts at meterX + meterW - waveformWidth
    const waveformStartX = meterX + meterW - waveformWidth;
    const x = waveformStartX + waveformWidth / 2; // Center of waveform area
    const y = (METER_GRID_ROWS * cellSize) / 2;
    const result = hitTestMeter(x, y, cellSize, slots);
    expect(result).not.toBeNull();
    expect(result?.type).toBe('meter');
    if (result?.type === 'meter') expect(result.slotIndex).toBe(3);
  });

  it('does not hit left meter when clicking in playable area', () => {
    const slots = makeMeterSlots();
    // Click at the start of playable area (column 6)
    const x = PLAYABLE_START * cellSize + cellSize / 2;
    const y = (METER_GRID_ROWS * cellSize) / 2;
    const result = hitTestMeter(x, y, cellSize, slots);
    expect(result).toBeNull();
  });

  it('does not hit right meter when clicking in middle of playable area', () => {
    const slots = makeMeterSlots();
    // Click in middle of playable area (around column 30)
    const x = 30 * cellSize;
    const y = (METER_GRID_ROWS * cellSize) / 2;
    const result = hitTestMeter(x, y, cellSize, slots);
    expect(result).toBeNull();
  });

  it('does not hit meters outside waveform channel (needle/level bar area)', () => {
    const slots = makeMeterSlots();
    // Click in needle area of left meter (rightmost part, toward gameboard)
    const meterW = METER_GRID_COLS * cellSize;
    const x = meterW - 2; // Right edge of left meter, in needle area
    const y = (METER_GRID_ROWS * cellSize) / 2;
    const result = hitTestMeter(x, y, cellSize, slots);
    expect(result).toBeNull();
  });

  it('hits correct meter based on vertical position', () => {
    const slots = makeMeterSlots();
    // Click in second left meter (index 1, rows 12-23)
    const waveformWidth = METER_GRID_COLS * cellSize * CHANNEL_RATIOS.waveform;
    const x = waveformWidth / 2;
    const y = METER_GRID_ROWS * cellSize + (METER_GRID_ROWS * cellSize) / 2; // Center of meter 1
    const result = hitTestMeter(x, y, cellSize, slots);
    expect(result).not.toBeNull();
    if (result?.type === 'meter') expect(result.slotIndex).toBe(1);
  });

  it('skips hidden meters', () => {
    const slots = makeMeterSlots();
    // Hide the first left meter
    slots.set('slot:0' as MeterKey, { mode: 'hidden' });
    const waveformWidth = METER_GRID_COLS * cellSize * CHANNEL_RATIOS.waveform;
    const x = waveformWidth / 2;
    const y = (METER_GRID_ROWS * cellSize) / 2;
    const result = hitTestMeter(x, y, cellSize, slots);
    expect(result).toBeNull();
  });
});

describe('hitTest CP node filtering', () => {
  const cellSize = 40;
  const canvasWidth = GRID_COLS * cellSize;
  const canvasHeight = GRID_ROWS * cellSize;

  it('skips bidirectional CP nodes in body hit test', () => {
    // Place bidir CP nodes at position {0, 0} (in meter zone)
    const nodes = new Map<string, ChipState>();
    for (let i = 0; i < 6; i++) {
      const id = cpBidirectionalId(i);
      nodes.set(id, makeNode(id, 'connection-bidirectional', 0, 0, 1, 1));
    }

    // Click at (0, 0) — should be empty, not a node hit
    const result = hitTest(0, 0, nodes, canvasWidth, canvasHeight, cellSize);
    expect(result.type).toBe('empty');
  });

  it('still hits regular nodes placed near CP nodes', () => {
    const nodes = new Map<string, ChipState>();
    // Add a bidir CP and a regular node at the same position
    const cpId = cpBidirectionalId(0);
    nodes.set(cpId, makeNode(cpId, 'connection-bidirectional', 15, 5, 1, 1));
    nodes.set('n1', makeNode('n1', 'invert', 15, 5));

    const x = 15 * cellSize + cellSize;
    const y = 5 * cellSize + cellSize / 2;
    const result = hitTest(x, y, nodes, canvasWidth, canvasHeight, cellSize);
    expect(result.type).toBe('node');
    if (result.type === 'node') expect(result.chipId).toBe('n1');
  });
});

describe('findNearestSnapTarget', () => {
  const cellSize = 40;

  it('snaps to a nearby port within radius', () => {
    const nodes = new Map<string, ChipState>();
    const node = makeNode('n1', 'max', 20, 10, 2, 1);
    nodes.set('n1', node);

    // Get the actual output port position
    const portPos = getNodePortPosition(node, 'output', 0, cellSize);

    // Click near but not exactly on the output port (offset by ~1 cell)
    const result = findNearestSnapTarget(
      portPos.x + cellSize * 0.8, portPos.y,
      WIRE_SNAP_RADIUS_CELLS * cellSize,
      nodes, cellSize,
    );
    expect(result).not.toBeNull();
    expect(result!.type).toBe('port');
    if (result!.type === 'port') {
      expect(result!.portRef.chipId).toBe('n1');
      expect(result!.portRef.side).toBe('plug');
    }
  });

  it('returns null when no target is within radius', () => {
    const nodes = new Map<string, ChipState>();
    nodes.set('n1', makeNode('n1', 'max', 20, 10, 2, 1));

    // Click far from any port (10 cells away)
    const result = findNearestSnapTarget(
      5 * cellSize, 5 * cellSize,
      WIRE_SNAP_RADIUS_CELLS * cellSize,
      nodes, cellSize,
    );
    expect(result).toBeNull();
  });

  it('respects isValidTarget filter', () => {
    const nodes = new Map<string, ChipState>();
    const node = makeNode('n1', 'max', 20, 10, 2, 1);
    nodes.set('n1', node);

    const portPos = getNodePortPosition(node, 'output', 0, cellSize);

    // Reject all targets via filter
    const result = findNearestSnapTarget(
      portPos.x + cellSize * 0.5, portPos.y,
      WIRE_SNAP_RADIUS_CELLS * cellSize,
      nodes, cellSize,
      undefined, undefined, undefined, undefined,
      () => false,
    );
    expect(result).toBeNull();
  });

  it('prefers the closer target when multiple are within radius', () => {
    const nodes = new Map<string, ChipState>();
    // Two nodes, each with an input port at different distances from the test point
    const nodeA = makeNode('a', 'max', 20, 10, 2, 1);
    const nodeB = makeNode('b', 'max', 23, 10, 2, 1);
    nodes.set('a', nodeA);
    nodes.set('b', nodeB);

    // Get both output port positions
    const posA = getNodePortPosition(nodeA, 'output', 0, cellSize);
    const posB = getNodePortPosition(nodeB, 'output', 0, cellSize);

    // Click exactly between them but slightly closer to B
    const midX = (posA.x + posB.x) / 2 + 1;
    const midY = (posA.y + posB.y) / 2;

    const result = findNearestSnapTarget(
      midX, midY,
      WIRE_SNAP_RADIUS_CELLS * cellSize * 3, // large radius to include both
      nodes, cellSize,
    );
    expect(result).not.toBeNull();
    expect(result!.type).toBe('port');
    if (result!.type === 'port') {
      expect(result!.portRef.chipId).toBe('b');
    }
  });

  it('exports WIRE_SNAP_RADIUS_CELLS as a positive number', () => {
    expect(WIRE_SNAP_RADIUS_CELLS).toBeGreaterThan(0);
    expect(WIRE_SNAP_RADIUS_CELLS).toBe(2);
  });
});

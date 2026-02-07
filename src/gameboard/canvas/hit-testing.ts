import type { NodeId, NodeState, PortRef, Vec2, Wire } from '../../shared/types/index.ts';
import { CONNECTION_POINT_CONFIG, NODE_STYLE } from '../../shared/constants/index.ts';
import { getNodePortPosition, getConnectionPointPosition, getNodeHitRect } from './port-positions.ts';
import { isConnectionPointNode } from '../../puzzle/connection-point-nodes.ts';
import { gridToPixel, getNodeGridSize, METER_LEFT_START, METER_RIGHT_START } from '../../shared/grid/index.ts';
import type { MeterKey, MeterSlotState } from '../meters/meter-types.ts';
import { METER_GRID_ROWS, METER_GRID_COLS, METER_GAP_ROWS, CHANNEL_RATIOS } from '../meters/meter-types.ts';

export type HitResult =
  | { type: 'port'; portRef: PortRef; position: Vec2 }
  | { type: 'connection-point'; side: 'input' | 'output'; index: number; position: Vec2 }
  | { type: 'node'; nodeId: NodeId }
  | { type: 'wire'; wireId: string }
  | { type: 'meter'; side: 'left' | 'right'; index: number; slotIndex: number }
  | { type: 'empty' };

const PORT_HIT_RADIUS = 12;
const CP_HIT_RADIUS = 24; // Increased from 14 to make connection points easier to click
const WIRE_HIT_THRESHOLD = 6;

function dist(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Point-to-line-segment distance for wire hit testing.
 */
function pointToSegmentDist(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return dist(px, py, ax, ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return dist(px, py, ax + t * dx, ay + t * dy);
}

/**
 * Hit test at canvas coordinate (x, y).
 * Priority: ports > connection points > node body > wires > empty.
 */
export function hitTest(
  x: number,
  y: number,
  nodes: ReadonlyMap<NodeId, NodeState>,
  _canvasWidth: number,
  _canvasHeight: number,
  cellSize: number,
  wires: ReadonlyArray<Wire> = [],
  activeInputs?: number,
  activeOutputs?: number,
): HitResult {
  // 1. Check node ports (highest priority — skip virtual CP nodes)
  for (const node of nodes.values()) {
    if (isConnectionPointNode(node.id)) continue;
    for (let i = 0; i < node.outputCount; i++) {
      const pos = getNodePortPosition(node, 'output', i, cellSize);
      if (dist(x, y, pos.x, pos.y) <= PORT_HIT_RADIUS) {
        return {
          type: 'port',
          portRef: { nodeId: node.id, portIndex: i, side: 'output' },
          position: pos,
        };
      }
    }
    for (let i = 0; i < node.inputCount; i++) {
      const pos = getNodePortPosition(node, 'input', i, cellSize);
      if (dist(x, y, pos.x, pos.y) <= PORT_HIT_RADIUS) {
        return {
          type: 'port',
          portRef: { nodeId: node.id, portIndex: i, side: 'input' },
          position: pos,
        };
      }
    }
  }

  // 2. Check connection points (only active ones)
  const inputCount = activeInputs ?? CONNECTION_POINT_CONFIG.INPUT_COUNT;
  const outputCount = activeOutputs ?? CONNECTION_POINT_CONFIG.OUTPUT_COUNT;
  for (let i = 0; i < inputCount; i++) {
    const pos = getConnectionPointPosition('input', i, cellSize);
    if (dist(x, y, pos.x, pos.y) <= CP_HIT_RADIUS) {
      return { type: 'connection-point', side: 'input', index: i, position: pos };
    }
  }
  for (let i = 0; i < outputCount; i++) {
    const pos = getConnectionPointPosition('output', i, cellSize);
    if (dist(x, y, pos.x, pos.y) <= CP_HIT_RADIUS) {
      return { type: 'connection-point', side: 'output', index: i, position: pos };
    }
  }

  // 3. Check node bodies (using full grid footprint for hit detection)
  const entries = Array.from(nodes.entries()).reverse();
  for (const [id, node] of entries) {
    const rect = getNodeHitRect(node, cellSize);
    if (
      x >= rect.x &&
      x <= rect.x + rect.width &&
      y >= rect.y &&
      y <= rect.y + rect.height
    ) {
      return { type: 'node', nodeId: id };
    }
  }

  // 4. Check wires (path segments at gridline intersections)
  for (const wire of wires) {
    if (wire.path.length < 2) continue;
    for (let i = 0; i < wire.path.length - 1; i++) {
      const ax = wire.path[i].col * cellSize;
      const ay = wire.path[i].row * cellSize;
      const bx = wire.path[i + 1].col * cellSize;
      const by = wire.path[i + 1].row * cellSize;
      if (pointToSegmentDist(x, y, ax, ay, bx, by) <= WIRE_HIT_THRESHOLD) {
        return { type: 'wire', wireId: wire.id };
      }
    }
  }

  return { type: 'empty' };
}

/**
 * Hit test meters at canvas coordinate (x, y).
 * Returns a meter hit if the click is within an active meter's waveform channel area.
 * Returns null if no meter is hit.
 */
export function hitTestMeter(
  x: number,
  y: number,
  cellSize: number,
  meterSlots: ReadonlyMap<MeterKey, MeterSlotState>,
): HitResult | null {
  // Meter layout: 3 meters per side, each 12 rows tall with no gaps (doubled density grid)
  // Left meters: cols 0-5, Right meters: cols 58-63
  // First meter starts at row 0 (no margin)
  const startRow = 0;

  for (const slot of meterSlots.values()) {
    if (slot.visualState === 'hidden') continue;

    // Calculate meter bounds in pixels
    const meterRow = startRow + slot.index * (METER_GRID_ROWS + METER_GAP_ROWS);
    const meterCol = slot.side === 'left' ? METER_LEFT_START : METER_RIGHT_START;

    const meterX = meterCol * cellSize;
    const meterY = meterRow * cellSize;
    const meterW = METER_GRID_COLS * cellSize;
    const meterH = METER_GRID_ROWS * cellSize;

    // Check if click is within meter bounds
    if (x < meterX || x > meterX + meterW || y < meterY || y > meterY + meterH) {
      continue;
    }

    // Check if click is within the waveform channel area (leftmost ~59% of meter)
    const waveformWidth = meterW * CHANNEL_RATIOS.waveform;
    const waveformStartX = slot.side === 'left' ? meterX : meterX + meterW - waveformWidth;
    const waveformEndX = waveformStartX + waveformWidth;

    if (x >= waveformStartX && x <= waveformEndX) {
      // Calculate slot index: left side is 0-2, right side is 3-5
      const slotIndex = slot.side === 'left' ? slot.index : slot.index + 3;
      return {
        type: 'meter',
        side: slot.side,
        index: slot.index,
        slotIndex,
      };
    }
  }

  return null;
}

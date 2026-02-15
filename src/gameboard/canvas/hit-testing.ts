import type { NodeId, NodeState, PortRef, Vec2, Wire } from '../../shared/types/index.ts';
import { CONNECTION_POINT_CONFIG, NODE_STYLE } from '../../shared/constants/index.ts';
import { getKnobConfig } from '../../engine/nodes/framework.ts';
import { getNodeDefinition } from '../../engine/nodes/registry.ts';
import { getNodePortPosition, getConnectionPointPosition, getNodeHitRect, getNodeBodyPixelRect } from './port-positions.ts';
import { isConnectionPointNode } from '../../puzzle/connection-point-nodes.ts';
import { buildWirePixelPath } from './render-wires.ts';
import { METER_LEFT_START, METER_RIGHT_START } from '../../shared/grid/index.ts';
import type { MeterKey, MeterSlotState } from '../meters/meter-types.ts';
import { METER_GRID_ROWS, METER_GRID_COLS, METER_GAP_ROWS, METER_VERTICAL_OFFSETS, CHANNEL_RATIOS, meterKeyToSlotIndex } from '../meters/meter-types.ts';
import { TOTAL_SLOTS, slotSide, slotPerSideIndex } from '../../shared/grid/slot-helpers.ts';
import type { SlotConfig } from '../../puzzle/types.ts';
import { buildSlotConfig, buildSlotConfigFromDirections } from '../../puzzle/types.ts';
import { deriveDirectionsFromMeterSlots } from '../meters/meter-types.ts';

export type HitResult =
  | { type: 'port'; portRef: PortRef; position: Vec2 }
  | { type: 'connection-point'; slotIndex: number; direction: 'input' | 'output'; position: Vec2 }
  | { type: 'knob'; chipId: NodeId; center: Vec2 }
  | { type: 'node'; chipId: NodeId }
  | { type: 'wire'; wireId: string }
  | { type: 'meter'; slotIndex: number }
  | { type: 'playback-button'; button: 'prev' | 'play-pause' | 'next' }
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
 * Derive a SlotConfig for hit testing from available information.
 */
function deriveSlotConfig(
  slotConfig?: SlotConfig,
  activeInputs?: number,
  activeOutputs?: number,
  meterSlots?: ReadonlyMap<MeterKey, MeterSlotState>,
): SlotConfig {
  if (slotConfig) return slotConfig;
  if (activeInputs !== undefined || activeOutputs !== undefined) {
    return buildSlotConfig(
      activeInputs ?? CONNECTION_POINT_CONFIG.INPUT_COUNT,
      activeOutputs ?? CONNECTION_POINT_CONFIG.OUTPUT_COUNT,
    );
  }
  if (meterSlots) {
    const dirs = deriveDirectionsFromMeterSlots(meterSlots);
    return buildSlotConfigFromDirections(dirs);
  }
  return buildSlotConfig(CONNECTION_POINT_CONFIG.INPUT_COUNT, CONNECTION_POINT_CONFIG.OUTPUT_COUNT);
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
  slotConfig?: SlotConfig,
  _editingUtilityId?: string | null,
  meterSlots?: ReadonlyMap<MeterKey, MeterSlotState>,
): HitResult {
  // 1. Check node ports (highest priority — skip virtual CP nodes)
  for (const node of nodes.values()) {
    if (isConnectionPointNode(node.id)) continue;
    for (let i = 0; i < node.outputCount; i++) {
      const pos = getNodePortPosition(node, 'output', i, cellSize);
      if (dist(x, y, pos.x, pos.y) <= PORT_HIT_RADIUS) {
        return {
          type: 'port',
          portRef: { chipId: node.id, portIndex: i, side: 'output' },
          position: pos,
        };
      }
    }
    for (let i = 0; i < node.inputCount; i++) {
      const pos = getNodePortPosition(node, 'input', i, cellSize);
      if (dist(x, y, pos.x, pos.y) <= PORT_HIT_RADIUS) {
        return {
          type: 'port',
          portRef: { chipId: node.id, portIndex: i, side: 'input' },
          position: pos,
        };
      }
    }
  }

  // 2. Check connection points (single loop 0-5 over SlotConfig)
  const config = deriveSlotConfig(slotConfig, activeInputs, activeOutputs, meterSlots);
  for (let i = 0; i < TOTAL_SLOTS; i++) {
    const slot = config[i];
    if (!slot.active) continue;
    const side = slotSide(i);
    const perSideIdx = slotPerSideIndex(i);
    const pos = getConnectionPointPosition(side, perSideIdx, cellSize);
    if (dist(x, y, pos.x, pos.y) <= CP_HIT_RADIUS) {
      return { type: 'connection-point', slotIndex: i, direction: slot.direction, position: pos };
    }
  }

  // 3. Check knobs (before node bodies for priority)
  for (const node of nodes.values()) {
    if (isConnectionPointNode(node.id)) continue;
    if (!getKnobConfig(getNodeDefinition(node.type))) continue;
    const bodyRect = getNodeBodyPixelRect(node, cellSize);
    const labelFontSize = Math.round(NODE_STYLE.LABEL_FONT_RATIO * cellSize);
    const centerX = bodyRect.x + bodyRect.width / 2;
    const centerY = bodyRect.y + bodyRect.height / 2 + labelFontSize * 0.5;
    const knobRadius = 1.1 * cellSize;
    if (dist(x, y, centerX, centerY) <= knobRadius) {
      return { type: 'knob', chipId: node.id, center: { x: centerX, y: centerY } };
    }
  }

  // 4. Check node bodies (using full grid footprint for hit detection)
  // Forward iteration, keep last match for correct z-order (last = top)
  let bodyHitId: NodeId | null = null;
  for (const [id, node] of nodes) {
    if (isConnectionPointNode(id)) continue;
    const rect = getNodeHitRect(node, cellSize);
    if (
      x >= rect.x &&
      x <= rect.x + rect.width &&
      y >= rect.y &&
      y <= rect.y + rect.height
    ) {
      bodyHitId = id;
    }
  }
  if (bodyHitId !== null) {
    return { type: 'node', chipId: bodyHitId };
  }

  // 5. Check wires (path segments at gridline intersections)
  for (const wire of wires) {
    if (wire.route.length >= 2) {
      for (let i = 0; i < wire.route.length - 1; i++) {
        const ax = wire.route[i].col * cellSize;
        const ay = wire.route[i].row * cellSize;
        const bx = wire.route[i + 1].col * cellSize;
        const by = wire.route[i + 1].row * cellSize;
        if (pointToSegmentDist(x, y, ax, ay, bx, by) <= WIRE_HIT_THRESHOLD) {
          return { type: 'wire', wireId: wire.id };
        }
      }
    } else {
      // Fallback: empty-path wire rendered as straight line between endpoints
      const pts = buildWirePixelPath(wire, cellSize, nodes);
      if (pts.length >= 2) {
        for (let i = 0; i < pts.length - 1; i++) {
          if (pointToSegmentDist(x, y, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y) <= WIRE_HIT_THRESHOLD) {
            return { type: 'wire', wireId: wire.id };
          }
        }
      }
    }
  }

  return { type: 'empty' };
}

export const WIRE_SNAP_RADIUS_CELLS = 2;

/**
 * Find the nearest valid snap target (port or connection point) within a pixel radius.
 * Used when a wire drop misses the exact hit target — snaps to the closest valid endpoint.
 */
export function findNearestSnapTarget(
  x: number,
  y: number,
  maxRadiusPx: number,
  nodes: ReadonlyMap<NodeId, NodeState>,
  cellSize: number,
  slotConfig?: SlotConfig,
  activeInputs?: number,
  activeOutputs?: number,
  meterSlots?: ReadonlyMap<MeterKey, MeterSlotState>,
  isValidTarget?: (hit: HitResult) => boolean,
): HitResult | null {
  let bestHit: HitResult | null = null;
  let bestDist = maxRadiusPx;

  // Check all non-CP-node ports
  for (const node of nodes.values()) {
    if (isConnectionPointNode(node.id)) continue;
    for (let i = 0; i < node.outputCount; i++) {
      const pos = getNodePortPosition(node, 'output', i, cellSize);
      const d = dist(x, y, pos.x, pos.y);
      if (d < bestDist) {
        const hit: HitResult = {
          type: 'port',
          portRef: { chipId: node.id, portIndex: i, side: 'output' },
          position: pos,
        };
        if (!isValidTarget || isValidTarget(hit)) {
          bestDist = d;
          bestHit = hit;
        }
      }
    }
    for (let i = 0; i < node.inputCount; i++) {
      const pos = getNodePortPosition(node, 'input', i, cellSize);
      const d = dist(x, y, pos.x, pos.y);
      if (d < bestDist) {
        const hit: HitResult = {
          type: 'port',
          portRef: { chipId: node.id, portIndex: i, side: 'input' },
          position: pos,
        };
        if (!isValidTarget || isValidTarget(hit)) {
          bestDist = d;
          bestHit = hit;
        }
      }
    }
  }

  // Check connection points
  const config = deriveSlotConfig(slotConfig, activeInputs, activeOutputs, meterSlots);
  for (let i = 0; i < TOTAL_SLOTS; i++) {
    const slot = config[i];
    if (!slot.active) continue;
    const side = slotSide(i);
    const perSideIdx = slotPerSideIndex(i);
    const pos = getConnectionPointPosition(side, perSideIdx, cellSize);
    const d = dist(x, y, pos.x, pos.y);
    if (d < bestDist) {
      const hit: HitResult = { type: 'connection-point', slotIndex: i, direction: slot.direction, position: pos };
      if (!isValidTarget || isValidTarget(hit)) {
        bestDist = d;
        bestHit = hit;
      }
    }
  }

  return bestHit;
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
  const startRow = 0;
  const meterStride = METER_GRID_ROWS + METER_GAP_ROWS;

  for (const [key, slot] of meterSlots) {
    if (slot.mode === 'hidden') continue;

    const slotIdx = meterKeyToSlotIndex(key);
    const side = slotSide(slotIdx);
    const index = slotPerSideIndex(slotIdx);

    // Calculate meter bounds in pixels (matches render-loop.ts positioning)
    const meterRow = startRow + index * meterStride + METER_VERTICAL_OFFSETS[index];
    const meterCol = side === 'left' ? METER_LEFT_START : METER_RIGHT_START;

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
    const waveformStartX = side === 'left' ? meterX : meterX + meterW - waveformWidth;
    const waveformEndX = waveformStartX + waveformWidth;

    if (x >= waveformStartX && x <= waveformEndX) {
      return { type: 'meter', slotIndex: slotIdx };
    }
  }

  return null;
}

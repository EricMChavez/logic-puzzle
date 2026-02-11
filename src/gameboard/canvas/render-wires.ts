import type { Wire, NodeState } from '../../shared/types/index.ts';
import type { ThemeTokens } from '../../shared/tokens/token-types.ts';
import { getNodePortPosition, getConnectionPointPosition } from './port-positions.ts';
import { isConnectionPointNode, isConnectionInputNode, getConnectionPointIndex, isCreativeSlotNode, getCreativeSlotIndex, isBidirectionalCpNode, getBidirectionalCpIndex } from '../../puzzle/connection-point-nodes.ts';
import { getDevOverrides } from '../../dev/index.ts';

// ── Colour helpers ──────────────────────────────────────────────────────────

type RGB = [number, number, number];

/** Parse a CSS hex color (#rgb or #rrggbb) to an RGB triple. */
export function hexToRgb(hex: string): RGB {
  let h = hex.replace('#', '');
  if (h.length === 3) {
    h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  }
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/** Linearly interpolate between two RGB colours; return an `rgb()` string. */
export function lerpColor(a: RGB, b: RGB, t: number): string {
  const r = Math.round(a[0] + (b[0] - a[0]) * t);
  const g = Math.round(a[1] + (b[1] - a[1]) * t);
  const bl = Math.round(a[2] + (b[2] - a[2]) * t);
  return `rgb(${r},${g},${bl})`;
}

// ── Signal → visual mapping ─────────────────────────────────────────────────

/**
 * Map a signal value (±100) to a polarity colour.
 * Gradient: signalZero (soft white) → polarity over |value| 0–colorRampEnd.
 * At value 0 the colour is a soft white; at ±100 it is full amber/teal.
 * This distinguishes "signal at 0" from "no signal" (which uses colorNeutral).
 */
export function signalToColor(value: number, tokens: ThemeTokens): string {
  const devOverrides = getDevOverrides();
  const useOverrides = devOverrides.enabled;

  const colorRampEnd = useOverrides ? devOverrides.wireStyle.colorRampEnd : 100;
  const zeroColor = useOverrides ? devOverrides.colors.signalZero : tokens.signalZero;
  const positiveColor = useOverrides ? devOverrides.colors.signalPositive : tokens.signalPositive;
  const negativeColor = useOverrides ? devOverrides.colors.signalNegative : tokens.signalNegative;

  const abs = Math.abs(value);
  const t = Math.min(abs / colorRampEnd, 1.0);
  const zeroRgb = hexToRgb(zeroColor);
  const polarityRgb = hexToRgb(value >= 0 ? positiveColor : negativeColor);
  return lerpColor(zeroRgb, polarityRgb, t);
}

/**
 * Map |value| to a glow radius.
 * 0 for |v| ≤ glowThreshold, ramps linearly to glowMaxRadius at |v| = 100.
 */
export function signalToGlow(value: number): number {
  const devOverrides = getDevOverrides();
  const useOverrides = devOverrides.enabled;

  const glowThreshold = useOverrides ? devOverrides.wireStyle.glowThreshold : 75;
  const glowMaxRadius = useOverrides ? devOverrides.wireStyle.glowMaxRadius : 30;

  const abs = Math.abs(value);
  if (abs <= glowThreshold) return 0;
  return ((abs - glowThreshold) / (100 - glowThreshold)) * glowMaxRadius;
}

// ── Wire signal lookup ──────────────────────────────────────────────────────

/**
 * Look up the uniform signal value for a wire from the wireValues map.
 * In cycle-based evaluation, every wire has a single value per cycle.
 */
export function getWireSignal(
  wireId: string,
  wireValues: ReadonlyMap<string, number> | undefined,
): number {
  if (!wireValues) return 0;
  return wireValues.get(wireId) ?? 0;
}

// ── Port position helpers ────────────────────────────────────────────────────

/**
 * Get the pixel position of a port for wire rendering.
 * Handles both regular nodes and connection point virtual nodes.
 */
function getPortPixelPosition(
  nodeId: string,
  side: 'input' | 'output',
  portIndex: number,
  nodes: ReadonlyMap<string, NodeState>,
  cellSize: number,
): { x: number; y: number } | null {
  if (isConnectionPointNode(nodeId)) {
    let physicalSide: 'left' | 'right';
    let meterIndex: number;

    if (isCreativeSlotNode(nodeId)) {
      // Creative slots: 0-2 are left, 3-5 are right
      const slotIndex = getCreativeSlotIndex(nodeId);
      physicalSide = slotIndex < 3 ? 'left' : 'right';
      meterIndex = slotIndex < 3 ? slotIndex : slotIndex - 3;
    } else if (isBidirectionalCpNode(nodeId)) {
      // Bidirectional CPs (utility editing): 0-2 are left, 3-5 are right
      const cpIndex = getBidirectionalCpIndex(nodeId);
      physicalSide = cpIndex < 3 ? 'left' : 'right';
      meterIndex = cpIndex < 3 ? cpIndex : cpIndex - 3;
    } else {
      // Standard CP nodes: check for physicalSide in params (custom puzzles),
      // fall back to direction-based mapping (standard puzzles)
      const node = nodes.get(nodeId);
      if (node?.params.physicalSide) {
        physicalSide = node.params.physicalSide as 'left' | 'right';
        meterIndex = node.params.meterIndex as number;
      } else {
        physicalSide = isConnectionInputNode(nodeId) ? 'left' : 'right';
        meterIndex = getConnectionPointIndex(nodeId);
      }
    }

    return getConnectionPointPosition(physicalSide, meterIndex, cellSize);
  }
  const node = nodes.get(nodeId);
  if (!node) return null;
  return getNodePortPosition(node, side, portIndex, cellSize);
}

// ── Wire pixel path builder ─────────────────────────────────────────────────

/**
 * Build the full deduped pixel path for a wire: source port → grid path → target port.
 * Shared by drawWires and drawWireBlips.
 */
export function buildWirePixelPath(
  wire: Wire,
  cellSize: number,
  nodes?: ReadonlyMap<string, NodeState>,
): Array<{ x: number; y: number }> {
  // Allow wires with empty paths if we can resolve endpoints from nodes
  if (wire.path.length === 0 && !nodes) return [];

  // Pre-compute pixel positions for path cells (at gridline intersections)
  const pathPts = wire.path.map((gp) => ({
    x: gp.col * cellSize,
    y: gp.row * cellSize,
  }));

  // Build full point list: source port → path → target port
  const pts: Array<{ x: number; y: number }> = [];

  if (nodes) {
    const sourcePos = getPortPixelPosition(
      wire.source.nodeId,
      wire.source.side,
      wire.source.portIndex,
      nodes,
      cellSize,
    );
    if (sourcePos) pts.push(sourcePos);
  }

  pts.push(...pathPts);

  if (nodes) {
    const targetPos = getPortPixelPosition(
      wire.target.nodeId,
      wire.target.side,
      wire.target.portIndex,
      nodes,
      cellSize,
    );
    if (targetPos) pts.push(targetPos);
  }

  if (pts.length === 0) return [];

  // Deduplicate adjacent coincident points (removes zero-length bridging segments)
  const dedupedPts = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    if (Math.abs(pts[i].x - dedupedPts[dedupedPts.length - 1].x) > 0.5 ||
        Math.abs(pts[i].y - dedupedPts[dedupedPts.length - 1].y) > 0.5) {
      dedupedPts.push(pts[i]);
    }
  }

  return dedupedPts;
}

// ── Three-pass wire renderer ────────────────────────────────────────────────

/**
 * Draw all wires along their auto-routed grid paths, connecting to port positions.
 * When neutralOnly is true, only pass 1 (neutral base) is drawn — used during pause animation.
 */
export function drawWires(
  ctx: CanvasRenderingContext2D,
  tokens: ThemeTokens,
  wires: ReadonlyArray<Wire>,
  cellSize: number,
  nodes?: ReadonlyMap<string, NodeState>,
  wireValues?: ReadonlyMap<string, number>,
  neutralOnly?: boolean,
): void {
  const devOverrides = getDevOverrides();
  const useOverrides = devOverrides.enabled;

  const wireWidth = useOverrides ? devOverrides.wireStyle.baseWidth : (Number(tokens.wireWidthBase) || 6);
  const baseOpacity = useOverrides ? devOverrides.wireStyle.baseOpacity : 1;
  const neutralColor = useOverrides ? devOverrides.colors.colorNeutral : tokens.colorNeutral;

  for (const wire of wires) {
    const dedupedPts = buildWirePixelPath(wire, cellSize, nodes);
    if (dedupedPts.length === 0) continue;

    const totalSegments = dedupedPts.length - 1;

    // ── Pass 1: neutral base polyline ──
    ctx.save();
    ctx.strokeStyle = neutralColor;
    ctx.lineWidth = wireWidth;
    ctx.globalAlpha = baseOpacity;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(dedupedPts[0].x, dedupedPts[0].y);
    for (let i = 1; i < dedupedPts.length; i++) {
      ctx.lineTo(dedupedPts[i].x, dedupedPts[i].y);
    }
    ctx.stroke();
    ctx.restore();

    if (neutralOnly) continue;
    if (totalSegments === 0) continue; // single-point path, base drawn

    // Uniform signal value for the entire wire at current playpoint
    const wireSignal = getWireSignal(wire.id, wireValues);

    // ── Pass 2: glow (|signal| > 75) — single polyline ──
    const glow = signalToGlow(wireSignal);
    if (glow > 0) {
      ctx.save();
      ctx.strokeStyle = signalToColor(wireSignal, tokens);
      ctx.lineWidth = wireWidth;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.shadowColor = ctx.strokeStyle;
      ctx.shadowBlur = glow;
      ctx.beginPath();
      ctx.moveTo(dedupedPts[0].x, dedupedPts[0].y);
      for (let i = 1; i < dedupedPts.length; i++) {
        ctx.lineTo(dedupedPts[i].x, dedupedPts[i].y);
      }
      ctx.stroke();
      ctx.restore();
    }

    // ── Pass 3: polarity colour — single polyline ──
    ctx.save();
    ctx.strokeStyle = signalToColor(wireSignal, tokens);
    ctx.lineWidth = wireWidth;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(dedupedPts[0].x, dedupedPts[0].y);
    for (let i = 1; i < dedupedPts.length; i++) {
      ctx.lineTo(dedupedPts[i].x, dedupedPts[i].y);
    }
    ctx.stroke();
    ctx.restore();
  }
}

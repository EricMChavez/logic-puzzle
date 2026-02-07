import type { Wire, NodeState } from '../../shared/types/index.ts';
import type { ThemeTokens } from '../../shared/tokens/token-types.ts';
import { getNodePortPosition, getConnectionPointPosition } from './port-positions.ts';
import { isConnectionPointNode, isConnectionInputNode, getConnectionPointIndex, isCreativeSlotNode, getCreativeSlotIndex } from '../../puzzle/connection-point-nodes.ts';
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
 * Gradient: neutral → polarity over |value| 0–colorRampEnd, clamped beyond.
 */
export function signalToColor(value: number, tokens: ThemeTokens): string {
  const devOverrides = getDevOverrides();
  const useOverrides = devOverrides.enabled;

  const colorRampEnd = useOverrides ? devOverrides.wireStyle.colorRampEnd : 75;
  const neutralColor = useOverrides ? devOverrides.colors.colorNeutral : tokens.colorNeutral;
  const positiveColor = useOverrides ? devOverrides.colors.signalPositive : tokens.signalPositive;
  const negativeColor = useOverrides ? devOverrides.colors.signalNegative : tokens.signalNegative;

  const abs = Math.abs(value);
  const t = Math.min(abs / colorRampEnd, 1.0);
  const neutralRgb = hexToRgb(neutralColor);
  const polarityRgb = hexToRgb(value >= 0 ? positiveColor : negativeColor);
  return lerpColor(neutralRgb, polarityRgb, t);
}

/**
 * Map |value| to a glow radius.
 * 0 for |v| ≤ glowThreshold, ramps linearly to glowMaxRadius at |v| = 100.
 */
export function signalToGlow(value: number): number {
  const devOverrides = getDevOverrides();
  const useOverrides = devOverrides.enabled;

  const glowThreshold = useOverrides ? devOverrides.wireStyle.glowThreshold : 75;
  const glowMaxRadius = useOverrides ? devOverrides.wireStyle.glowMaxRadius : 12;

  const abs = Math.abs(value);
  if (abs <= glowThreshold) return 0;
  return ((abs - glowThreshold) / (100 - glowThreshold)) * glowMaxRadius;
}

// ── Ring-buffer → segment mapping ───────────────────────────────────────────

const BUFFER_SIZE = 16; // must equal WIRE_BUFFER_SIZE

/**
 * Return the signal value for segment `segIndex` of `totalSegments`.
 *
 * Path[0] = source end → newest sample.
 * Path[last] = target end → oldest sample.
 */
export function getSegmentSignal(
  wire: Pick<Wire, 'signalBuffer' | 'writeHead'>,
  segIndex: number,
  totalSegments: number,
): number {
  const newestIdx =
    (wire.writeHead - 1 + BUFFER_SIZE) % BUFFER_SIZE;
  const t = totalSegments <= 1 ? 0 : segIndex / (totalSegments - 1);
  const sampleOffset = Math.floor(t * (BUFFER_SIZE - 1));
  const bufIdx =
    (newestIdx - sampleOffset + BUFFER_SIZE) % BUFFER_SIZE;
  return wire.signalBuffer[bufIdx];
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
    let cpSide: 'input' | 'output';
    let cpIndex: number;

    if (isCreativeSlotNode(nodeId)) {
      // Creative slots: 0-2 are left (input side), 3-5 are right (output side)
      const slotIndex = getCreativeSlotIndex(nodeId);
      cpSide = slotIndex < 3 ? 'input' : 'output';
      cpIndex = slotIndex < 3 ? slotIndex : slotIndex - 3;
    } else {
      cpSide = isConnectionInputNode(nodeId) ? 'input' : 'output';
      cpIndex = getConnectionPointIndex(nodeId);
    }

    return getConnectionPointPosition(cpSide, cpIndex, cellSize);
  }
  const node = nodes.get(nodeId);
  if (!node) return null;
  return getNodePortPosition(node, side, portIndex, cellSize);
}

// ── Three-pass wire renderer ────────────────────────────────────────────────

/** Draw all wires along their auto-routed grid paths, connecting to port positions. */
export function drawWires(
  ctx: CanvasRenderingContext2D,
  tokens: ThemeTokens,
  wires: ReadonlyArray<Wire>,
  cellSize: number,
  nodes?: ReadonlyMap<string, NodeState>,
): void {
  const devOverrides = getDevOverrides();
  const useOverrides = devOverrides.enabled;

  const wireWidth = useOverrides ? devOverrides.wireStyle.baseWidth : (Number(tokens.wireWidthBase) || 2);
  const baseOpacity = useOverrides ? devOverrides.wireStyle.baseOpacity : 0.4;
  const neutralColor = useOverrides ? devOverrides.colors.colorNeutral : tokens.colorNeutral;

  for (const wire of wires) {
    if (wire.path.length === 0) continue;

    // Pre-compute pixel positions for path cells (at gridline intersections)
    const pathPts = wire.path.map((gp) => ({
      x: gp.col * cellSize,
      y: gp.row * cellSize,
    }));

    // Build full point list: source port → path → target port
    const pts: Array<{ x: number; y: number }> = [];

    // Add source port position if nodes are available
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

    // Add path points
    pts.push(...pathPts);

    // Add target port position if nodes are available
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

    if (pts.length === 0) continue;

    // Deduplicate adjacent coincident points (removes zero-length bridging segments)
    const dedupedPts = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      if (Math.abs(pts[i].x - dedupedPts[dedupedPts.length - 1].x) > 0.5 ||
          Math.abs(pts[i].y - dedupedPts[dedupedPts.length - 1].y) > 0.5) {
        dedupedPts.push(pts[i]);
      }
    }

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

    if (totalSegments === 0) continue; // single-point path, base drawn

    // ── Pass 2: glow segments (|signal| > 75) ──
    for (let s = 0; s < totalSegments; s++) {
      const val = getSegmentSignal(wire, s, totalSegments);
      const glow = signalToGlow(val);
      if (glow <= 0) continue;

      ctx.save();
      ctx.strokeStyle = signalToColor(val, tokens);
      ctx.lineWidth = wireWidth;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.shadowColor = ctx.strokeStyle;
      ctx.shadowBlur = glow;
      ctx.beginPath();
      ctx.moveTo(dedupedPts[s].x, dedupedPts[s].y);
      ctx.lineTo(dedupedPts[s + 1].x, dedupedPts[s + 1].y);
      ctx.stroke();
      ctx.restore();
    }

    // ── Pass 3: polarity colour per segment ──
    for (let s = 0; s < totalSegments; s++) {
      const val = getSegmentSignal(wire, s, totalSegments);
      ctx.save();
      ctx.strokeStyle = signalToColor(val, tokens);
      ctx.lineWidth = wireWidth;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(dedupedPts[s].x, dedupedPts[s].y);
      ctx.lineTo(dedupedPts[s + 1].x, dedupedPts[s + 1].y);
      ctx.stroke();
      ctx.restore();
    }
  }
}

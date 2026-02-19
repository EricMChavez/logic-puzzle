import type { Path, ChipState } from '../../shared/types/index.ts';
import type { ThemeTokens } from '../../shared/tokens/token-types.ts';
import { getNodePortPosition, getConnectionPointPosition } from './port-positions.ts';
import { isConnectionPointNode, isConnectionInputNode, getConnectionPointIndex, isCreativeSlotNode, getCreativeSlotIndex, isUtilitySlotNode, getUtilitySlotIndex, isBidirectionalCpNode, getBidirectionalCpIndex } from '../../puzzle/connection-point-nodes.ts';
import { slotSide, slotPerSideIndex, sideToSlot } from '../../shared/grid/slot-helpers.ts';
import { getDevOverrides } from '../../dev/index.ts';

// ── Colour helpers ──────────────────────────────────────────────────────────

type RGB = [number, number, number];

const _hexToRgbCache = new Map<string, RGB>();

/** Parse a CSS hex color (#rgb or #rrggbb) to an RGB triple (cached). */
export function hexToRgb(hex: string): RGB {
  let cached = _hexToRgbCache.get(hex);
  if (cached) return cached;
  let h = hex.replace('#', '');
  if (h.length === 3) {
    h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  }
  cached = [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
  _hexToRgbCache.set(hex, cached);
  return cached;
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
 *
 * @param glowBoost - 0-1 value that lowers the threshold and increases max radius.
 *   At glowBoost=1, threshold drops by 50 (glow starts at signal 25) and max radius
 *   increases by 20 (to 50px). Used during "it-works" ceremony phase.
 */
export function signalToGlow(value: number, glowBoost: number = 0): number {
  const devOverrides = getDevOverrides();
  const useOverrides = devOverrides.enabled;

  const baseThreshold = useOverrides ? devOverrides.wireStyle.glowThreshold : 75;
  const baseMaxRadius = useOverrides ? devOverrides.wireStyle.glowMaxRadius : 30;

  const glowThreshold = baseThreshold - 50 * glowBoost;
  const glowMaxRadius = baseMaxRadius + 20 * glowBoost;

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
  chipId: string,
  side: 'socket' | 'plug',
  portIndex: number,
  nodes: ReadonlyMap<string, ChipState>,
  cellSize: number,
): { x: number; y: number } | null {
  const logicalSide = side === 'socket' ? 'input' : 'output';
  if (isConnectionPointNode(chipId)) {
    // All CP node types encode a slot index (0-5). Derive physical side and per-side index.
    const slotIndex = getCpSlotIndex(chipId, nodes);
    const physicalSide = slotSide(slotIndex);
    const meterIndex = slotPerSideIndex(slotIndex);
    return getConnectionPointPosition(physicalSide, meterIndex, cellSize);
  }
  const node = nodes.get(chipId);
  if (!node) return null;
  return getNodePortPosition(node, logicalSide, portIndex, cellSize);
}

/**
 * Extract the flat slot index (0-5) from any CP node type.
 * Creative/utility/bidir nodes encode it in their ID.
 * Standard puzzle CP nodes use physicalSide+meterIndex params or direction-based fallback.
 */
function getCpSlotIndex(
  chipId: string,
  nodes: ReadonlyMap<string, ChipState>,
): number {
  if (isCreativeSlotNode(chipId)) return getCreativeSlotIndex(chipId);
  if (isUtilitySlotNode(chipId)) return getUtilitySlotIndex(chipId);
  if (isBidirectionalCpNode(chipId)) return getBidirectionalCpIndex(chipId);

  // Standard puzzle CP: check for physicalSide in params (custom puzzles)
  const node = nodes.get(chipId);
  if (node?.params.physicalSide) {
    const pSide = node.params.physicalSide as 'left' | 'right';
    const idx = node.params.meterIndex as number;
    return sideToSlot(pSide, idx);
  }
  // Fallback: input→left, output→right, per-direction index as per-side index
  const isInput = isConnectionInputNode(chipId);
  const cpIndex = getConnectionPointIndex(chipId);
  return sideToSlot(isInput ? 'left' : 'right', cpIndex);
}

// ── Wire pixel path builder ─────────────────────────────────────────────────

/**
 * Build the full deduped pixel path for a wire: source port → grid path → target port.
 * Shared by drawWires and drawWireBlips.
 */
export function buildWirePixelPath(
  wire: Path,
  cellSize: number,
  nodes?: ReadonlyMap<string, ChipState>,
): Array<{ x: number; y: number }> {
  // Allow wires with empty paths if we can resolve endpoints from nodes
  if (wire.route.length === 0 && !nodes) return [];

  // Pre-compute pixel positions for route cells (at gridline intersections)
  const pathPts = wire.route.map((gp) => ({
    x: gp.col * cellSize,
    y: gp.row * cellSize,
  }));

  // Build full point list: source port → path → target port
  const pts: Array<{ x: number; y: number }> = [];

  if (nodes) {
    const sourcePos = getPortPixelPosition(
      wire.source.chipId,
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
      wire.target.chipId,
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
  wires: ReadonlyArray<Path>,
  cellSize: number,
  nodes?: ReadonlyMap<string, ChipState>,
  wireValues?: ReadonlyMap<string, number>,
  neutralOnly?: boolean,
  liveWireIds?: ReadonlySet<string>,
  glowBoost?: number,
  colorFade?: number,
): void {
  const devOverrides = getDevOverrides();
  const useOverrides = devOverrides.enabled;

  const wireWidth = useOverrides ? devOverrides.wireStyle.baseWidth : (Number(tokens.wireWidthBase) || 6);
  const baseOpacity = useOverrides ? devOverrides.wireStyle.baseOpacity : 1;
  const neutralColor = useOverrides ? devOverrides.colors.colorNeutral : tokens.colorNeutral;
  const fadeAlpha = colorFade ?? 1;

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
    if (liveWireIds && !liveWireIds.has(wire.id)) continue;
    if (totalSegments === 0) continue; // single-point path, base drawn

    // Uniform signal value for the entire wire at current playpoint
    const wireSignal = getWireSignal(wire.id, wireValues);

    // ── Pass 2: glow (|signal| > 75) — single polyline ──
    if (fadeAlpha > 0) {
      const glow = signalToGlow(wireSignal, glowBoost);
      if (glow > 0) {
        ctx.save();
        ctx.globalAlpha = fadeAlpha;
        ctx.strokeStyle = signalToColor(wireSignal, tokens);
        ctx.lineWidth = wireWidth;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.shadowColor = ctx.strokeStyle;
        ctx.shadowBlur = glow * fadeAlpha;
        ctx.beginPath();
        ctx.moveTo(dedupedPts[0].x, dedupedPts[0].y);
        for (let i = 1; i < dedupedPts.length; i++) {
          ctx.lineTo(dedupedPts[i].x, dedupedPts[i].y);
        }
        ctx.stroke();
        ctx.restore();
      }
    }

    // ── Pass 3: polarity colour — single polyline ──
    if (fadeAlpha > 0) {
      ctx.save();
      ctx.globalAlpha = fadeAlpha;
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
}

import type { Wire } from '../../shared/types/index.ts';
import type { ThemeTokens } from '../../shared/tokens/token-types.ts';

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
 * Gradient: neutral → polarity over |value| 0–75, clamped beyond.
 */
export function signalToColor(value: number, tokens: ThemeTokens): string {
  const abs = Math.abs(value);
  const t = Math.min(abs / 75, 1.0);
  const neutralRgb = hexToRgb(tokens.colorNeutral);
  const polarityRgb = hexToRgb(
    value >= 0 ? tokens.signalPositive : tokens.signalNegative,
  );
  return lerpColor(neutralRgb, polarityRgb, t);
}

/**
 * Map |value| to a glow radius.
 * 0 for |v| ≤ 75, ramps linearly to 12 at |v| = 100.
 */
export function signalToGlow(value: number): number {
  const abs = Math.abs(value);
  if (abs <= 75) return 0;
  return ((abs - 75) / 25) * 12;
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

// ── Three-pass wire renderer ────────────────────────────────────────────────

/** Draw all wires along their auto-routed grid paths. */
export function drawWires(
  ctx: CanvasRenderingContext2D,
  tokens: ThemeTokens,
  wires: ReadonlyArray<Wire>,
  cellSize: number,
): void {
  const wireWidth = Number(tokens.wireWidthBase) || 2;

  for (const wire of wires) {
    if (wire.path.length === 0) continue;

    const totalSegments = wire.path.length - 1;

    // Pre-compute pixel positions
    const pts = wire.path.map((gp) => ({
      x: gp.col * cellSize + cellSize / 2,
      y: gp.row * cellSize + cellSize / 2,
    }));

    // ── Pass 1: neutral base polyline ──
    ctx.save();
    ctx.strokeStyle = tokens.colorNeutral;
    ctx.lineWidth = wireWidth;
    ctx.globalAlpha = 0.4;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x, pts[i].y);
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
      ctx.moveTo(pts[s].x, pts[s].y);
      ctx.lineTo(pts[s + 1].x, pts[s + 1].y);
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
      ctx.moveTo(pts[s].x, pts[s].y);
      ctx.lineTo(pts[s + 1].x, pts[s + 1].y);
      ctx.stroke();
      ctx.restore();
    }
  }
}

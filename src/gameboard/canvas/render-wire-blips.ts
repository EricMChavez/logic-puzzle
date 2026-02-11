/**
 * Pause-mode blip rendering.
 *
 * Draws animated signal "blips" traveling along wire paths during pause,
 * cascading in topological evaluation order.
 */

import type { Wire, NodeState } from '../../shared/types/index.ts';
import type { ThemeTokens } from '../../shared/tokens/token-types.ts';
import type { WireAnimationCache } from './wire-animation.ts';
import { buildWirePixelPath, signalToColor, signalToGlow } from './render-wires.ts';
import { getDevOverrides } from '../../dev/index.ts';

// =============================================================================
// Path math helpers
// =============================================================================

/**
 * Compute cumulative Euclidean distances along a polyline.
 * Returns array of length pts.length where [0] = 0 and [i] = distance from start to pts[i].
 */
export function computeCumulativeDistances(
  pts: ReadonlyArray<{ x: number; y: number }>,
): number[] {
  const cumDist = new Array<number>(pts.length);
  cumDist[0] = 0;
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x - pts[i - 1].x;
    const dy = pts[i].y - pts[i - 1].y;
    cumDist[i] = cumDist[i - 1] + Math.sqrt(dx * dx + dy * dy);
  }
  return cumDist;
}

/**
 * Interpolate a point at a given distance along a polyline.
 * Uses cumulative distances for O(log n) lookup.
 */
export function interpolateAlongPath(
  pts: ReadonlyArray<{ x: number; y: number }>,
  cumDist: ReadonlyArray<number>,
  targetDist: number,
): { x: number; y: number } {
  if (pts.length === 0) return { x: 0, y: 0 };
  if (targetDist <= 0) return { x: pts[0].x, y: pts[0].y };

  const totalLength = cumDist[cumDist.length - 1];
  if (targetDist >= totalLength) {
    return { x: pts[pts.length - 1].x, y: pts[pts.length - 1].y };
  }

  // Binary search for the segment containing targetDist
  let lo = 0;
  let hi = pts.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (cumDist[mid] <= targetDist) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  const segLen = cumDist[hi] - cumDist[lo];
  if (segLen === 0) return { x: pts[lo].x, y: pts[lo].y };

  const t = (targetDist - cumDist[lo]) / segLen;
  return {
    x: pts[lo].x + (pts[hi].x - pts[lo].x) * t,
    y: pts[lo].y + (pts[hi].y - pts[lo].y) * t,
  };
}

// =============================================================================
// Blip renderer
// =============================================================================

const BLIP_ALPHA_STEPS = 5;

/**
 * Draw animated signal blips on all wires during pause mode.
 *
 * @param ctx        Canvas context
 * @param tokens     Theme tokens
 * @param wires      All wires on the board
 * @param nodes      All nodes on the board
 * @param cellSize   Grid cell size in pixels
 * @param cache      Pre-computed timing data from computeWireAnimationCache
 * @param globalProgress  Animation progress 0-1 (loops)
 */
export function drawWireBlips(
  ctx: CanvasRenderingContext2D,
  tokens: ThemeTokens,
  wires: ReadonlyArray<Wire>,
  nodes: ReadonlyMap<string, NodeState>,
  cellSize: number,
  cache: WireAnimationCache,
  globalProgress: number,
): void {
  const devOverrides = getDevOverrides();
  const useOverrides = devOverrides.enabled;
  const wireWidth = useOverrides ? devOverrides.wireStyle.baseWidth : (Number(tokens.wireWidthBase) || 6);

  for (const wire of wires) {
    const timing = cache.timings.get(wire.id);
    if (!timing) continue;

    const { departPhase, arrivePhase, signalValue } = timing;

    // Compute local progress along this wire (0 = just departed, 1 = arrived)
    const phaseDuration = arrivePhase - departPhase;
    if (phaseDuration <= 0) continue;

    const rawT = (globalProgress - departPhase) / phaseDuration;

    // Skip if blip hasn't departed or has already arrived at the target node
    if (rawT <= 0 || rawT >= 1) continue;

    const localT = rawT;

    // Build pixel path for this wire
    const pts = buildWirePixelPath(wire, cellSize, nodes);
    if (pts.length < 2) continue;

    const cumDist = computeCumulativeDistances(pts);
    const totalLength = cumDist[cumDist.length - 1];
    if (totalLength === 0) continue;

    // Blip geometry: 3 cells or 20% of wire, whichever is smaller
    const blipLength = Math.min(3 * cellSize, totalLength * 0.2);
    const headDist = localT * totalLength;
    const tailDist = Math.max(0, headDist - blipLength);

    // Draw blip as alpha-stepping segments (tail = transparent, head = full color)
    const color = signalToColor(signalValue, tokens);
    const glow = signalToGlow(signalValue);

    for (let step = 0; step < BLIP_ALPHA_STEPS; step++) {
      const t0 = step / BLIP_ALPHA_STEPS;
      const t1 = (step + 1) / BLIP_ALPHA_STEPS;
      const d0 = tailDist + t0 * (headDist - tailDist);
      const d1 = tailDist + t1 * (headDist - tailDist);

      const p0 = interpolateAlongPath(pts, cumDist, d0);
      const p1 = interpolateAlongPath(pts, cumDist, d1);

      // Alpha ramps from 0 at tail to 1 at head
      const alpha = (t0 + t1) / 2; // midpoint alpha for this segment

      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = wireWidth;
      ctx.globalAlpha = alpha;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      // Add glow on head segments (last 2 steps) for strong signals
      if (glow > 0 && step >= BLIP_ALPHA_STEPS - 2) {
        ctx.shadowColor = color;
        ctx.shadowBlur = glow * alpha;
      }

      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.stroke();
      ctx.restore();
    }
  }
}

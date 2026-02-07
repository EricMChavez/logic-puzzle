import type { ThemeTokens } from '../../shared/tokens/token-types.ts';
import type { LidAnimationState } from '../../store/slices/animation-slice.ts';

/**
 * Ease-in-out cubic for smooth animation.
 */
function easeInOutCubic(t: number): number {
  return t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** Shadow width in CSS pixels for the inner edges of the clamshell halves. */
const SHADOW_WIDTH = 24;

/** Maximum shadow opacity at inner edge. */
const SHADOW_OPACITY = 0.6;

/**
 * Parse animation duration from token string (e.g. "500ms" → 500, "0ms" → 0).
 * Returns milliseconds. Defaults to 500 if unparseable.
 */
export function parseDurationMs(token: string): number {
  const n = parseFloat(token);
  if (isNaN(n) || n < 0) return 500;
  return n;
}

/**
 * Compute animation progress from startTime, current timestamp, and duration token.
 * Returns 0-1 clamped. If duration is 0 (reduced motion), returns 1 instantly.
 */
export function computeProgress(startTime: number, now: number, durationMs: number): number {
  if (durationMs <= 0) return 1;
  const elapsed = now - startTime;
  return Math.min(Math.max(elapsed / durationMs, 0), 1);
}

/**
 * Draw shadow gradient on the inner closing edge of a clamshell half.
 *
 * @param ctx - Canvas context
 * @param edgeX - X position of the inner edge
 * @param fromLeft - true if shadow extends from the edge toward left (right half shadow),
 *                   false if shadow extends from edge toward right (left half shadow)
 * @param height - Canvas height
 * @param intensity - 0-1 intensity multiplier (fades with animation progress)
 */
function drawEdgeShadow(
  ctx: CanvasRenderingContext2D,
  edgeX: number,
  fromLeft: boolean,
  height: number,
  intensity: number,
): void {
  if (intensity <= 0) return;

  const sw = SHADOW_WIDTH;
  const startX = fromLeft ? edgeX : edgeX - sw;
  const endX = fromLeft ? edgeX + sw : edgeX;

  const gradient = ctx.createLinearGradient(startX, 0, endX, 0);

  if (fromLeft) {
    // Shadow fades from edge toward right
    gradient.addColorStop(0, `rgba(0,0,0,${SHADOW_OPACITY * intensity})`);
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
  } else {
    // Shadow fades from edge toward left
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(1, `rgba(0,0,0,${SHADOW_OPACITY * intensity})`);
  }

  ctx.fillStyle = gradient;
  ctx.fillRect(startX, 0, sw, height);
}

/**
 * Draw the lid-open clamshell animation overlay.
 *
 * During 'opening': parent snapshot splits into left/right halves compressing
 * toward edges. The live child board is already rendered behind this overlay.
 *
 * During 'closing': child snapshot displayed in a shrinking center region.
 * The live parent board is already rendered behind this overlay.
 *
 * @param ctx - Canvas 2D context (already DPR-scaled)
 * @param tokens - Theme tokens (for duration parsing)
 * @param state - Current lid animation state (opening or closing)
 * @param progress - Raw 0-1 progress (will be eased internally)
 * @param canvasW - Canvas logical width (CSS pixels)
 * @param canvasH - Canvas logical height (CSS pixels)
 */
export function drawLidAnimation(
  ctx: CanvasRenderingContext2D,
  _tokens: ThemeTokens,
  state: LidAnimationState,
  progress: number,
  canvasW: number,
  canvasH: number,
): void {
  if (state.type === 'idle') return;

  const t = easeInOutCubic(progress);
  const { snapshot } = state;
  const srcW = snapshot.width;
  const srcH = snapshot.height;
  const halfW = canvasW / 2;
  const halfSrcW = srcW / 2;

  if (state.type === 'opening') {
    // Left half of parent snapshot: compresses from center toward left edge
    // At t=0: covers left half of canvas (stripW = halfW)
    // At t=1: gone (stripW = 0)
    const stripW = halfW * (1 - t);

    if (stripW > 0.5) {
      ctx.drawImage(
        snapshot,
        0, 0, halfSrcW, srcH,      // source: left half
        0, 0, stripW, canvasH,      // dest: compressed left strip
      );

      // Shadow on inner edge of left half
      drawEdgeShadow(ctx, stripW, true, canvasH, 1 - t);
    }

    // Right half of parent snapshot: compresses from center toward right edge
    const rightStripW = halfW * (1 - t);

    if (rightStripW > 0.5) {
      ctx.drawImage(
        snapshot,
        halfSrcW, 0, halfSrcW, srcH,                  // source: right half
        canvasW - rightStripW, 0, rightStripW, canvasH, // dest: compressed right strip
      );

      // Shadow on inner edge of right half
      drawEdgeShadow(ctx, canvasW - rightStripW, false, canvasH, 1 - t);
    }
  }

  if (state.type === 'closing') {
    // Child snapshot displayed in shrinking center region
    // At t=0: fills entire canvas (centerW = canvasW)
    // At t=1: gone (centerW = 0)
    const centerW = canvasW * (1 - t);
    const centerX = (canvasW - centerW) / 2;

    if (centerW > 0.5) {
      // Source crop matches the visible portion
      const srcCropX = (srcW - srcW * (1 - t)) / 2;
      const srcCropW = srcW * (1 - t);

      ctx.drawImage(
        snapshot,
        srcCropX, 0, srcCropW, srcH,    // source: center crop of child
        centerX, 0, centerW, canvasH,    // dest: center region
      );

      // Shadows on both closing edges
      drawEdgeShadow(ctx, centerX, false, canvasH, t);
      drawEdgeShadow(ctx, centerX + centerW, true, canvasH, t);
    }
  }
}

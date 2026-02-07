import type { ThemeTokens } from '../../shared/tokens/token-types.ts';

/**
 * Ease-in-out cubic for smooth animation (matches lid-animation).
 */
function easeInOutCubic(t: number): number {
  return t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Draw the victory burst overlay — a full-canvas color flash that fades out.
 *
 * At progress=0: full flash (radial blend of signalPositive + signalNegative).
 * At progress=1: fully faded out.
 *
 * @param ctx - Canvas 2D context
 * @param tokens - Theme tokens
 * @param progress - Raw 0-1 progress (eased internally)
 * @param canvasW - Canvas logical width
 * @param canvasH - Canvas logical height
 */
export function drawVictoryBurst(
  ctx: CanvasRenderingContext2D,
  tokens: ThemeTokens,
  progress: number,
  canvasW: number,
  canvasH: number,
): void {
  if (progress >= 1) return;

  const t = easeInOutCubic(progress);
  const alpha = 1 - t;

  ctx.save();
  ctx.globalAlpha = alpha;

  // Radial gradient: signalPositive at center, signalNegative at edges
  const cx = canvasW / 2;
  const cy = canvasH / 2;
  const radius = Math.sqrt(cx * cx + cy * cy);
  const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
  gradient.addColorStop(0, tokens.signalPositive);
  gradient.addColorStop(1, tokens.signalNegative);

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvasW, canvasH);
  ctx.restore();
}

/**
 * Draw the name reveal overlay — centered puzzle name and description
 * that fade in and scale up.
 *
 * @param ctx - Canvas 2D context
 * @param tokens - Theme tokens
 * @param progress - Raw 0-1 progress (eased internally)
 * @param puzzleName - Puzzle title text
 * @param puzzleDescription - Puzzle description text
 * @param canvasW - Canvas logical width
 * @param canvasH - Canvas logical height
 */
export function drawNameReveal(
  ctx: CanvasRenderingContext2D,
  tokens: ThemeTokens,
  progress: number,
  puzzleName: string,
  puzzleDescription: string,
  canvasW: number,
  canvasH: number,
): void {
  if (progress <= 0) return;

  const t = easeInOutCubic(progress);
  const alpha = t;
  const scale = 0.8 + 0.2 * t;

  ctx.save();
  ctx.globalAlpha = alpha;

  const cx = canvasW / 2;
  const cy = canvasH / 2;

  // Semi-transparent backdrop for readability
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(0, 0, canvasW, canvasH);

  // Apply scale transform from center
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  ctx.translate(-cx, -cy);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Puzzle name (large)
  const nameFontSize = Math.round(canvasH * 0.06);
  ctx.font = `bold ${nameFontSize}px sans-serif`;
  ctx.fillStyle = tokens.textPrimary;
  ctx.fillText(puzzleName, cx, cy - nameFontSize * 0.6);

  // Puzzle description (smaller, below)
  const descFontSize = Math.round(canvasH * 0.03);
  ctx.font = `${descFontSize}px sans-serif`;
  ctx.fillStyle = tokens.textSecondary;
  ctx.fillText(puzzleDescription, cx, cy + descFontSize * 1.2);

  ctx.restore();
}

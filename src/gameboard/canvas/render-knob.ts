import type { ThemeTokens } from '../../shared/tokens/token-types.ts';

/** Knob sweep: 270 degrees (gap at bottom, from 7 o'clock to 5 o'clock) */
const SWEEP_DEG = 270;
const SWEEP_RAD = (SWEEP_DEG * Math.PI) / 180;
/** Start angle: 7 o'clock position (135° from east, in radians) */
const START_ANGLE = (135 * Math.PI) / 180;
/** End angle: 5 o'clock position */
const END_ANGLE = START_ANGLE + SWEEP_RAD;

/**
 * Map a value in [-100, +100] to an angle on the knob arc.
 * -100 → start (7 o'clock), +100 → end (5 o'clock)
 */
function valueToAngle(value: number): number {
  const t = (value + 100) / 200;
  return START_ANGLE + t * SWEEP_RAD;
}

/**
 * Draw a DAW-style rotary knob on a canvas context.
 *
 * @param ctx - Canvas rendering context
 * @param tokens - Theme tokens for color
 * @param centerX - Center X in pixel coords
 * @param centerY - Center Y in pixel coords
 * @param radius - Outer arc radius in pixels
 * @param value - Current value in [-100, +100]
 * @param isWired - Whether the knob port is wired (non-interactive)
 * @param isRejected - Whether a disabled-knob click was just attempted (shows error overlay)
 */
export function drawKnob(
  ctx: CanvasRenderingContext2D,
  tokens: ThemeTokens,
  centerX: number,
  centerY: number,
  radius: number,
  value: number,
  isWired: boolean,
  isRejected: boolean,
): void {
  const arcWidth = Math.max(2, radius * 0.18);
  const innerRadius = radius * 0.55;
  const indicatorLength = radius * 0.75;

  ctx.save();

  // --- Outer arc track (background) ---
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, START_ANGLE, END_ANGLE, false);
  ctx.strokeStyle = tokens.textSecondary;
  ctx.globalAlpha = 0.4;
  ctx.lineWidth = arcWidth;
  ctx.lineCap = 'round';
  ctx.stroke();

  // --- Active arc (from center outward toward value) ---
  const centerAngle = valueToAngle(0);
  const valueAngle = valueToAngle(value);
  if (value !== 0) {
    ctx.beginPath();
    if (value > 0) {
      ctx.arc(centerX, centerY, radius, centerAngle, valueAngle, false);
    } else {
      ctx.arc(centerX, centerY, radius, valueAngle, centerAngle, false);
    }
    ctx.strokeStyle = value > 0 ? tokens.signalPositive : tokens.signalNegative;
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = arcWidth;
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  // --- Inner fill (dark circle) ---
  ctx.beginPath();
  ctx.arc(centerX, centerY, innerRadius, 0, Math.PI * 2);
  ctx.fillStyle = tokens.surfaceNode;
  ctx.globalAlpha = 0.85;
  ctx.fill();

  // --- Indicator line ---
  const indicatorAngle = valueAngle;
  const fromX = centerX + Math.cos(indicatorAngle) * (innerRadius * 0.3);
  const fromY = centerY + Math.sin(indicatorAngle) * (innerRadius * 0.3);
  const toX = centerX + Math.cos(indicatorAngle) * indicatorLength;
  const toY = centerY + Math.sin(indicatorAngle) * indicatorLength;

  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
  ctx.strokeStyle = tokens.textPrimary;
  ctx.globalAlpha = 1.0;
  ctx.lineWidth = Math.max(1.5, arcWidth * 0.6);
  ctx.lineCap = 'round';
  ctx.stroke();

  // --- Error overlay when disabled knob click attempted ---
  if (isRejected) {
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius + arcWidth * 0.5, 0, Math.PI * 2);
    ctx.fillStyle = tokens.colorError;
    ctx.globalAlpha = 0.25;
    ctx.fill();
  }

  ctx.restore();
}

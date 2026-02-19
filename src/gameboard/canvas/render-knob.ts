import type { ThemeTokens } from '../../shared/tokens/token-types.ts';
import { HIGHLIGHT_STREAK } from '../../shared/constants/index.ts';
import { getDevOverrides } from '../../dev/index.ts';
import { signalToColor } from './render-wires.ts';

/** Knob sweep: 270 degrees (gap at bottom, from 7 o'clock to 5 o'clock) */
const SWEEP_DEG = 270;
const SWEEP_RAD = (SWEEP_DEG * Math.PI) / 180;
/** Start angle: 7 o'clock position (135° from east, in radians) */
const START_ANGLE = (135 * Math.PI) / 180;
/** End angle: 5 o'clock position */
const END_ANGLE = START_ANGLE + SWEEP_RAD;
const TWO_PI = Math.PI * 2;
/** Dead zone boundaries (the 90° gap at bottom of knob) */
const DEAD_ZONE_LOW = END_ANGLE % TWO_PI; // 45° (PI/4)
const DEAD_ZONE_HIGH = START_ANGLE;        // 135° (3*PI/4)
const DEAD_ZONE_MID = Math.PI / 2;        // 90° — straight down

/**
 * Map cursor position to a knob value in [-100, +100] for radial drag mode.
 * Angles within the 90° dead zone (bottom of knob) clamp to the nearest extreme.
 * Result is snapped to 50-unit intervals: -100, -50, 0, +50, +100.
 */
export function radialAngleToValue(
  cursorX: number,
  cursorY: number,
  centerX: number,
  centerY: number,
): number {
  const dx = cursorX - centerX;
  const dy = cursorY - centerY;

  // Degenerate case: cursor exactly at knob center
  if (dx === 0 && dy === 0) return 0;

  // atan2 gives [-PI, PI], normalize to [0, 2PI)
  const raw = Math.atan2(dy, dx);
  const angle = ((raw % TWO_PI) + TWO_PI) % TWO_PI;

  // Dead zone: [PI/4, 3*PI/4] — the 90° gap at bottom of knob
  if (angle >= DEAD_ZONE_LOW && angle <= DEAD_ZONE_HIGH) {
    return angle < DEAD_ZONE_MID ? 100 : -100;
  }

  // Angular offset from START_ANGLE going clockwise, mod 2PI
  const offset = ((angle - START_ANGLE) % TWO_PI + TWO_PI) % TWO_PI;

  // Map through 270° sweep to t in [0, 1]
  const t = Math.min(1, Math.max(0, offset / SWEEP_RAD));

  // Map to [-100, +100] and snap to 50-unit intervals
  const rawValue = t * 200 - 100;
  const snapped = Math.round(rawValue / 50) * 50;
  return Math.max(-100, Math.min(100, snapped)) || 0; // avoid -0
}

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
  _isWired: boolean,
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
    ctx.strokeStyle = signalToColor(value, tokens);
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = arcWidth;
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  // --- Inner fill (dark circle) with shadow for raised depth ---
  const devOverrides = getDevOverrides();
  const knobShadowBlur = devOverrides.enabled ? devOverrides.meterStyle.knobShadowBlur : 0.5;
  const knobHighlightOpacity = devOverrides.enabled ? devOverrides.meterStyle.knobHighlightOpacity : 0.3;

  ctx.save();
  if (knobShadowBlur > 0) {
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = radius * knobShadowBlur;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = radius * 0.05;
  }
  ctx.beginPath();
  ctx.arc(centerX, centerY, innerRadius, 0, Math.PI * 2);
  ctx.fillStyle = tokens.surfaceNode;
  ctx.globalAlpha = 0.85;
  ctx.fill();
  ctx.restore();

  // --- Warm highlight arc along top of inner circle ---
  if (knobHighlightOpacity > 0) {
    const warmTint = HIGHLIGHT_STREAK.WARM_TINT;
    ctx.save();
    // Clip to inner circle
    ctx.beginPath();
    ctx.arc(centerX, centerY, innerRadius, 0, Math.PI * 2);
    ctx.clip();
    // Draw arc along top (~120 degrees centered at top)
    ctx.strokeStyle = `rgba(${warmTint.r},${warmTint.g},${warmTint.b},${knobHighlightOpacity})`;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 1;
    ctx.beginPath();
    // 120 degrees centered at top: from -150deg to -30deg (in standard canvas angles)
    const highlightStart = (-150 * Math.PI) / 180;
    const highlightEnd = (-30 * Math.PI) / 180;
    ctx.arc(centerX, centerY, innerRadius - 0.5, highlightStart, highlightEnd);
    ctx.stroke();
    ctx.restore();
  }

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

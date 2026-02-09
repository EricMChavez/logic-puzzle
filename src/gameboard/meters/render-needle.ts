import type { ThemeTokens } from '../../shared/tokens/token-types.ts';
import type { PixelRect } from '../../shared/grid/types.ts';
import { isReducedMotion } from '../../shared/tokens/theme-manager.ts';
import { VERTICAL_HEIGHT_RATIO } from './meter-types.ts';
import { getDevOverrides } from '../../dev/index.ts';

/**
 * Needle length as fraction of needle rect width.
 * At 4.0, the tip reaches into the level bar when at 0 (horizontal).
 * Layout: needle (10%) + levelBar (30%) = 40% of meter width.
 * So 40% / 10% = 4.0 of needle rect width to span to the bar's left edge.
 */
const NEEDLE_LENGTH_RATIO = 4.0;

/** Eye (pivot) dot radius in pixels */
const EYE_RADIUS = 3;

/**
 * Draw a needle that pivots from the gameboard-side edge of the meter.
 *
 * The eye sits at the gameboard-side edge, vertically centered:
 *   - Left meters: eye at right edge (gameboard is on the right)
 *   - Right meters: eye at left edge (gameboard is on the left)
 *
 * The needle tip tracks the edge of the bar level - it rotates to place
 * its tip inline with the top/bottom of the filled bar area.
 */
export function drawNeedle(
  ctx: CanvasRenderingContext2D,
  tokens: ThemeTokens,
  currentValue: number,
  rect: PixelRect,
  side: 'left' | 'right',
): void {
  const clamped = Math.max(-100, Math.min(100, currentValue));
  const normalized = clamped / 100; // -1..+1

  // Eye (pivot) at the gameboard-side edge, vertically centered
  const eyeX = side === 'left'
    ? rect.x + rect.width
    : rect.x;
  const eyeY = rect.y + rect.height / 2;

  const needleLength = rect.width * NEEDLE_LENGTH_RATIO;

  // Calculate bar height to match the level bar rendering
  const halfHeight = (rect.height * VERTICAL_HEIGHT_RATIO) / 2;
  const barHeight = Math.abs(normalized) * halfHeight;

  // Calculate swing angle so tip aligns with bar level edge
  // swing = asin(barHeight / needleLength), clamped to avoid NaN
  const sinSwing = Math.min(1, barHeight / needleLength);
  const swingMagnitude = Math.asin(sinSwing);

  // Apply sign based on value polarity (positive = up, negative = down)
  const swing = normalized >= 0 ? swingMagnitude : -swingMagnitude;

  // Base angle: left needle points left (PI), right needle points right (0)
  const baseAngle = side === 'left' ? Math.PI : 0;
  const swingSign = side === 'left' ? 1 : -1;
  const angle = baseAngle + swing * swingSign;

  const tipX = eyeX + Math.cos(angle) * needleLength;
  const tipY = eyeY + Math.sin(angle) * needleLength;

  const devOverrides = getDevOverrides();
  const useOverrides = devOverrides.enabled;
  const needleColor = useOverrides ? devOverrides.colors.meterNeedle : tokens.meterNeedle;
  const needleGlow = useOverrides ? devOverrides.meterStyle.needleGlow : 10;

  ctx.save();

  // Glow pass
  ctx.strokeStyle = needleColor;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.shadowColor = needleColor;
  ctx.shadowBlur = isReducedMotion() ? 0 : needleGlow;
  ctx.globalAlpha = 0.6;

  ctx.beginPath();
  ctx.moveTo(eyeX, eyeY);
  ctx.lineTo(tipX, tipY);
  ctx.stroke();

  // Crisp pass (no shadow)
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1.0;
  ctx.stroke();

  // Eye dot at pivot
  ctx.fillStyle = needleColor;
  ctx.beginPath();
  ctx.arc(eyeX, eyeY, EYE_RADIUS, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

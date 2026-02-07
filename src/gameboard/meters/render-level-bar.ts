import type { ThemeTokens } from '../../shared/tokens/token-types.ts';
import type { PixelRect } from '../../shared/grid/types.ts';
import { VERTICAL_HEIGHT_RATIO } from './meter-types.ts';
import { getDevOverrides } from '../../dev/index.ts';

/** Cutout configuration for creating needle visibility arc */
export interface LevelBarCutout {
  /** X position of the cutout center (connection point / eye) */
  centerX: number;
  /** Y position of the cutout center (connection point / eye) */
  centerY: number;
  /** Radius of the circular cutout */
  radius: number;
}

/**
 * Draw the level bar channel: a vertical bar from center outward
 * representing the current signal value.
 *
 * Positive values fill upward, negative fill downward.
 * Signal range is -100..+100.
 *
 * An optional cutout creates a circular arc near the connection point
 * to improve needle visibility and emphasize extreme levels.
 */
export function drawLevelBar(
  ctx: CanvasRenderingContext2D,
  tokens: ThemeTokens,
  currentValue: number,
  rect: PixelRect,
  cutout?: LevelBarCutout,
): void {
  const devOverrides = getDevOverrides();
  const useOverrides = devOverrides.enabled;
  const verticalHeightRatio = useOverrides ? devOverrides.meterStyle.verticalHeightRatio : VERTICAL_HEIGHT_RATIO;

  const centerY = rect.y + rect.height / 2;
  const halfHeight = (rect.height * verticalHeightRatio) / 2;

  // Clamp to -100..+100 and normalize to -1..+1
  const clamped = Math.max(-100, Math.min(100, currentValue));
  const normalized = clamped / 100;

  // Bar extent from center
  const barHeight = Math.abs(normalized) * halfHeight;

  if (barHeight < 0.5) return; // Nothing visible

  ctx.save();

  // If cutout specified, create a clipping path that excludes the circular region
  // The clip rect must extend to include the cutout circle, but we only fill the original rect
  if (cutout) {
    const rectCenterX = rect.x + rect.width / 2;
    let clipX = rect.x;
    let clipWidth = rect.width;

    if (cutout.centerX > rectCenterX) {
      // Cutout is on the right (left meter) - extend clip rightward
      clipWidth = (cutout.centerX + cutout.radius) - rect.x + 5;
    } else {
      // Cutout is on the left (right meter) - extend clip leftward
      clipX = cutout.centerX - cutout.radius - 5;
      clipWidth = (rect.x + rect.width) - clipX;
    }

    ctx.beginPath();
    // Outer rectangle boundary - extended to include the cutout circle
    ctx.rect(clipX, rect.y, clipWidth, rect.height);
    // Circle as a "hole" - drawn counter-clockwise for evenodd clipping
    ctx.arc(cutout.centerX, cutout.centerY, cutout.radius, 0, Math.PI * 2, true);
    ctx.clip('evenodd');
  }

  const positiveColor = useOverrides ? devOverrides.colors.signalPositive : tokens.signalPositive;
  const negativeColor = useOverrides ? devOverrides.colors.signalNegative : tokens.signalNegative;
  ctx.fillStyle = normalized >= 0 ? positiveColor : negativeColor;

  if (normalized >= 0) {
    // Fill upward from center - use original rect bounds, clip does the shaping
    ctx.fillRect(rect.x, centerY - barHeight, rect.width, barHeight);
  } else {
    // Fill downward from center - use original rect bounds, clip does the shaping
    ctx.fillRect(rect.x, centerY, rect.width, barHeight);
  }

  ctx.restore();
}

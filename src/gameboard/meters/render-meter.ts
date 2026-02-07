import type { ThemeTokens } from '../../shared/tokens/token-types.ts';
import type { PixelRect } from '../../shared/grid/types.ts';
import type { MeterSlotState } from './meter-types.ts';
import { CHANNEL_RATIOS, VERTICAL_HEIGHT_RATIO } from './meter-types.ts';
import type { MeterCircularBuffer } from './circular-buffer.ts';
import { drawWaveformChannel } from './render-waveform-channel.ts';
import { drawLevelBar, type LevelBarCutout } from './render-level-bar.ts';
import { drawNeedle } from './render-needle.ts';
import { drawTargetOverlay } from './render-target-overlay.ts';

import { getDevOverrides } from '../../dev/index.ts';

/** Data needed to render a single meter, assembled by the render loop */
export interface RenderMeterState {
  slot: MeterSlotState;
  signalBuffer: MeterCircularBuffer | null;
  targetBuffer: MeterCircularBuffer | null;
  /** Per-sample match status for output meters (green coloring) */
  matchStatus?: boolean[] | null;
}

/**
 * Draw a single analog meter in the given pixel rect.
 *
 * Composites: interior background, center-line, 3 channels (waveform, level bar, needle),
 * and optional target overlay for output meters.
 *
 * Visual states:
 * - hidden: early return, no drawing
 * - dimmed: interior + faded overlay only
 * - active: all channels
 * - confirming: all channels + pulsing green border
 * - mismatch: all channels + red flash overlay
 */
export function drawMeter(
  ctx: CanvasRenderingContext2D,
  tokens: ThemeTokens,
  state: RenderMeterState,
  rect: PixelRect,
): void {
  const { slot, signalBuffer, targetBuffer } = state;

  if (slot.visualState === 'hidden') return;

  // Compute channel sub-rects within the meter (mirrored for right-side meters)
  const { waveformRect, levelBarRect, needleRect } = computeChannelRects(rect, slot.side);

  // Compute cutout for level bar (circular arc near connection point)
  const cutout = computeLevelBarCutout(rect, needleRect, slot.side);

  // Draw meter interior background (only behind waveform + levelBar, respecting cutout)
  const devOverrides = getDevOverrides();
  const meterInteriorColor = devOverrides.enabled
    ? devOverrides.colors.meterInterior
    : tokens.meterInterior;
  drawMeterInterior(ctx, meterInteriorColor, waveformRect, levelBarRect, cutout, slot.side);

  if (slot.visualState === 'dimmed') {
    // Dimmed: draw a semi-transparent overlay and return
    ctx.fillStyle = tokens.depthSunken;
    ctx.globalAlpha = 0.5;
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    ctx.globalAlpha = 1.0;
    return;
  }

  // Center-line (dashed, neutral color) - only across waveform + levelBar
  const interiorLeft = Math.min(waveformRect.x, levelBarRect.x);
  const interiorRight = Math.max(waveformRect.x + waveformRect.width, levelBarRect.x + levelBarRect.width);
  const centerY = rect.y + rect.height / 2;
  ctx.save();
  ctx.strokeStyle = tokens.colorNeutral;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.3;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(interiorLeft, centerY);
  ctx.lineTo(interiorRight, centerY);
  ctx.stroke();
  ctx.restore();

  // Current value for level bar and needle
  const currentValue = signalBuffer ? signalBuffer.latest() : 0;

  // Clip all channel drawing to meter bounds
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.width, rect.height);
  ctx.clip();

  // Draw channels
  if (signalBuffer) {
    drawWaveformChannel(ctx, tokens, signalBuffer, waveformRect, state.matchStatus);
  }

  drawLevelBar(ctx, tokens, currentValue, levelBarRect, cutout);
  drawNeedle(ctx, tokens, currentValue, needleRect, slot.side);

  // Target overlay for output meters
  if (targetBuffer && slot.direction === 'output') {
    drawTargetOverlay(ctx, tokens, targetBuffer, waveformRect, state.matchStatus);
  }

  ctx.restore();

  // Visual state overlays
  if (slot.visualState === 'confirming') {
    drawConfirmingBorder(ctx, tokens, rect);
  } else if (slot.visualState === 'mismatch') {
    drawMismatchOverlay(ctx, tokens, rect);
  }
}

/**
 * Compute pixel sub-rects for each channel within the meter housing.
 *
 * Left meters:  waveform | gap | levelBar | gap | needle  (needle toward gameboard)
 * Right meters: needle | gap | levelBar | gap | waveform  (needle toward gameboard)
 *
 * The needle channel is always closest to the gameboard (center of screen).
 */
function computeChannelRects(rect: PixelRect, side: 'left' | 'right'): {
  waveformRect: PixelRect;
  levelBarRect: PixelRect;
  needleRect: PixelRect;
} {
  const devOverrides = getDevOverrides();
  const useOverrides = devOverrides.enabled;

  // Get ratios from dev overrides or defaults
  const waveformRatio = useOverrides ? devOverrides.meterStyle.waveformRatio : CHANNEL_RATIOS.waveform;
  const levelBarRatio = useOverrides ? devOverrides.meterStyle.levelBarRatio : CHANNEL_RATIOS.levelBar;
  const needleRatio = useOverrides ? devOverrides.meterStyle.needleRatio : CHANNEL_RATIOS.needle;

  // Normalize ratios to ensure they sum to ~1.0 (with small gaps)
  const totalRatio = waveformRatio + levelBarRatio + needleRatio + CHANNEL_RATIOS.gapA + CHANNEL_RATIOS.gapB;
  const scale = 1.0 / totalRatio;

  const w = rect.width;
  const waveformW = w * waveformRatio * scale;
  const gapAW = w * CHANNEL_RATIOS.gapA * scale;
  const levelBarW = w * levelBarRatio * scale;
  const gapBW = w * CHANNEL_RATIOS.gapB * scale;
  const needleW = w * needleRatio * scale;

  if (side === 'right') {
    // Right side: needle | gap | levelBar | gap | waveform (needle toward gameboard on left)
    return {
      needleRect: { x: rect.x, y: rect.y, width: needleW, height: rect.height },
      levelBarRect: { x: rect.x + needleW + gapBW, y: rect.y, width: levelBarW, height: rect.height },
      waveformRect: { x: rect.x + needleW + gapBW + levelBarW + gapAW, y: rect.y, width: waveformW, height: rect.height },
    };
  }

  // Left side: waveform | gap | levelBar | gap | needle (needle toward gameboard on right)
  return {
    waveformRect: { x: rect.x, y: rect.y, width: waveformW, height: rect.height },
    levelBarRect: { x: rect.x + waveformW + gapAW, y: rect.y, width: levelBarW, height: rect.height },
    needleRect: { x: rect.x + waveformW + gapAW + levelBarW + gapBW, y: rect.y, width: needleW, height: rect.height },
  };
}

/**
 * Compute the circular cutout for the level bar.
 *
 * The cutout is centered at the connection point (eye of the needle)
 * with a radius that covers the entire level bar area near the connection point.
 * The radius must reach the corners of the level bar's vertical extent.
 */
function computeLevelBarCutout(
  meterRect: PixelRect,
  needleRect: PixelRect,
  side: 'left' | 'right',
): LevelBarCutout {
  const devOverrides = getDevOverrides();
  const useOverrides = devOverrides.enabled;
  const verticalHeightRatio = useOverrides ? devOverrides.meterStyle.verticalHeightRatio : VERTICAL_HEIGHT_RATIO;

  // Eye (connection point) is at the gameboard-side edge of the needle rect
  const eyeX = side === 'left'
    ? needleRect.x + needleRect.width
    : needleRect.x;
  const eyeY = meterRect.y + meterRect.height / 2;

  // The cutout must cover the corner of the level bar's drawn area.
  // Corner is at: (needleRect.x, centerY ± halfDrawnHeight)
  // Distance from eye to corner determines minimum radius.
  const dx = needleRect.width; // horizontal distance from level bar edge to eye
  const halfDrawnHeight = (meterRect.height * verticalHeightRatio) / 2;
  const cornerDistance = Math.sqrt(dx * dx + halfDrawnHeight * halfDrawnHeight);

  // Add buffer to ensure clean coverage
  const radius = cornerDistance + 2;

  return { centerX: eyeX, centerY: eyeY, radius };
}

/**
 * Draw the meter interior background behind waveform + levelBar channels.
 * Respects the cutout near the connection point and vertical height ratio.
 */
function drawMeterInterior(
  ctx: CanvasRenderingContext2D,
  color: string,
  waveformRect: PixelRect,
  levelBarRect: PixelRect,
  cutout: LevelBarCutout,
  _side: 'left' | 'right',
): void {
  const devOverrides = getDevOverrides();
  const useOverrides = devOverrides.enabled;
  const verticalHeightRatio = useOverrides ? devOverrides.meterStyle.verticalHeightRatio : VERTICAL_HEIGHT_RATIO;

  // Compute combined rect spanning waveform and levelBar
  const left = Math.min(waveformRect.x, levelBarRect.x);
  const right = Math.max(waveformRect.x + waveformRect.width, levelBarRect.x + levelBarRect.width);
  const width = right - left;

  // Constrain to vertical drawable area (same as level bar)
  const centerY = waveformRect.y + waveformRect.height / 2;
  const halfHeight = (waveformRect.height * verticalHeightRatio) / 2;
  const top = centerY - halfHeight;
  const height = halfHeight * 2;

  ctx.save();

  // Create clipping path that excludes the cutout circle
  ctx.beginPath();

  // Determine if we need to extend the clip rect to include the cutout
  const rectCenterX = left + width / 2;
  let clipX = left;
  let clipWidth = width;

  if (cutout.centerX > rectCenterX) {
    // Cutout is on the right (left meter) - extend clip rightward
    clipWidth = (cutout.centerX + cutout.radius) - left + 5;
  } else {
    // Cutout is on the left (right meter) - extend clip leftward
    clipX = cutout.centerX - cutout.radius - 5;
    clipWidth = right - clipX;
  }

  // Outer rectangle boundary
  ctx.rect(clipX, top, clipWidth, height);
  // Circle as a "hole" - drawn counter-clockwise for evenodd clipping
  ctx.arc(cutout.centerX, cutout.centerY, cutout.radius, 0, Math.PI * 2, true);
  ctx.clip('evenodd');

  // Fill the interior
  ctx.fillStyle = color;
  ctx.fillRect(left, top, width, height);

  ctx.restore();
}

/** Static green border for confirming state */
function drawConfirmingBorder(
  ctx: CanvasRenderingContext2D,
  tokens: ThemeTokens,
  rect: PixelRect,
): void {
  ctx.save();
  ctx.strokeStyle = tokens.signalPositive;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.8;

  ctx.strokeRect(rect.x + 1, rect.y + 1, rect.width - 2, rect.height - 2);
  ctx.restore();
}

/** Red flash overlay for mismatch state */
function drawMismatchOverlay(ctx: CanvasRenderingContext2D, tokens: ThemeTokens, rect: PixelRect): void {
  ctx.save();
  ctx.fillStyle = tokens.signalNegative;
  ctx.globalAlpha = 0.15;
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  ctx.restore();
}

import type { ThemeTokens } from '../../shared/tokens/token-types.ts';
import type { PixelRect } from '../../shared/grid/types.ts';
import type { MeterSlotState } from './meter-types.ts';
import { CHANNEL_RATIOS, VERTICAL_HEIGHT_RATIO } from './meter-types.ts';
import type { MeterCircularBuffer } from './circular-buffer.ts';
import { drawWaveformChannel, drawMatchOverlay } from './render-waveform-channel.ts';
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
 * - confirming: all channels (no special visual currently)
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

  const devOverrides = getDevOverrides();

  // Opaque backing behind the meter (matches border bounds exactly)
  // Needed because canvas is transparent — without this, meter content is invisible
  const housingColor = devOverrides.enabled
    ? devOverrides.colors.meterInterior
    : tokens.meterHousing;
  drawMeterHousing(ctx, housingColor, waveformRect, levelBarRect, slot.side);

  // Draw meter interior background (behind waveform + levelBar, respecting cutout)
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
    drawWaveformChannel(ctx, tokens, signalBuffer, waveformRect);
  }

  // Match overlay: green wash on top of waveform bars where signal matches target
  if (signalBuffer && state.matchStatus) {
    drawMatchOverlay(ctx, tokens, signalBuffer, waveformRect, state.matchStatus);
  }

  drawLevelBar(ctx, tokens, currentValue, levelBarRect, cutout);
  drawNeedle(ctx, tokens, currentValue, needleRect, slot.side);

  // Target overlay for output meters
  if (targetBuffer && slot.direction === 'output') {
    drawTargetOverlay(ctx, tokens, targetBuffer, waveformRect, state.matchStatus);
  }

  ctx.restore();

  // Draw meter border (3 sides, not facing gameboard) - uses same constrained height as interior
  drawMeterBorder(ctx, tokens, waveformRect, levelBarRect, VERTICAL_HEIGHT_RATIO, slot.side);
}

/**
 * Draw a border on three sides of the meter (not the gameboard-facing side).
 * Uses the same constrained vertical height as the meter interior.
 */
function drawMeterBorder(
  ctx: CanvasRenderingContext2D,
  tokens: ThemeTokens,
  waveformRect: PixelRect,
  levelBarRect: PixelRect,
  verticalHeightRatio: number,
  side: 'left' | 'right',
): void {
  const devOverrides = getDevOverrides();
  const borderColor = devOverrides.enabled
    ? devOverrides.colors.meterBorder
    : tokens.meterBorder;

  // Compute the same constrained bounds as drawMeterInterior
  const left = Math.min(waveformRect.x, levelBarRect.x);
  const right = Math.max(waveformRect.x + waveformRect.width, levelBarRect.x + levelBarRect.width);
  const width = right - left;
  const centerY = waveformRect.y + waveformRect.height / 2;
  const halfHeight = (waveformRect.height * verticalHeightRatio) / 2;
  const top = centerY - halfHeight;
  const height = halfHeight * 2;

  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 2;
  ctx.beginPath();

  if (side === 'left') {
    // Draw top, left, bottom (skip right edge facing gameboard)
    ctx.moveTo(left + width, top);
    ctx.lineTo(left, top);
    ctx.lineTo(left, top + height);
    ctx.lineTo(left + width, top + height);
  } else {
    // Draw top, right, bottom (skip left edge facing gameboard)
    ctx.moveTo(left, top);
    ctx.lineTo(left + width, top);
    ctx.lineTo(left + width, top + height);
    ctx.lineTo(left, top + height);
  }

  ctx.stroke();
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
  const waveformRatio = CHANNEL_RATIOS.waveform;
  const levelBarRatio = CHANNEL_RATIOS.levelBar;
  const needleRatio = CHANNEL_RATIOS.needle;

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
  const verticalHeightRatio = VERTICAL_HEIGHT_RATIO;

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
  const verticalHeightRatio = VERTICAL_HEIGHT_RATIO;

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

/**
 * Draw opaque housing behind the meter, matching the border bounds exactly.
 * Provides an opaque backing so meter content is visible on the transparent canvas.
 */
function drawMeterHousing(
  ctx: CanvasRenderingContext2D,
  color: string,
  waveformRect: PixelRect,
  levelBarRect: PixelRect,
  side: 'left' | 'right',
): void {
  const left = Math.min(waveformRect.x, levelBarRect.x);
  const right = Math.max(waveformRect.x + waveformRect.width, levelBarRect.x + levelBarRect.width);
  const width = right - left;
  const centerY = waveformRect.y + waveformRect.height / 2;
  const halfHeight = (waveformRect.height * VERTICAL_HEIGHT_RATIO) / 2;
  const top = centerY - halfHeight;
  const height = halfHeight * 2;

  ctx.fillStyle = color;
  ctx.fillRect(left, top, width, height);
}


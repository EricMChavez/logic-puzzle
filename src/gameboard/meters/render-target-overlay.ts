import type { ThemeTokens } from '../../shared/tokens/token-types.ts';
import type { PixelRect } from '../../shared/grid/types.ts';
import type { MeterCircularBuffer } from './circular-buffer.ts';
import { METER_BUFFER_CAPACITY, VERTICAL_HEIGHT_RATIO } from './meter-types.ts';

/**
 * Draw the target waveform overlay as a static unfilled stroke line.
 * Used on output meters to show the expected waveform as a fixed reference.
 *
 * The target buffer is pre-filled once and never pushed to, so it renders
 * as a static waveform while the signal scrolls behind it.
 *
 * Uses the same vertical extent and horizontal positioning as the
 * waveform channel for visual alignment.
 */
export function drawTargetOverlay(
  ctx: CanvasRenderingContext2D,
  tokens: ThemeTokens,
  targetBuffer: MeterCircularBuffer,
  rect: PixelRect,
  _matchStatus?: boolean[] | null,
): void {
  const sampleCount = targetBuffer.count;
  if (sampleCount < 2) return;

  const centerY = rect.y + rect.height / 2;
  const halfHeight = (rect.height * VERTICAL_HEIGHT_RATIO) / 2;
  const colWidth = rect.width / METER_BUFFER_CAPACITY;

  // Static target: always draw as dashed reference line
  ctx.save();
  ctx.strokeStyle = tokens.colorTarget;
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = 0.7;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();

  for (let i = 0; i < sampleCount; i++) {
    const value = targetBuffer.at(i);
    const clamped = Math.max(-100, Math.min(100, value));
    const normalized = clamped / 100;
    const distanceFromNewest = sampleCount - 1 - i;
    const x = rect.x + distanceFromNewest * colWidth + colWidth / 2;
    const y = centerY - normalized * halfHeight;

    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }

  ctx.stroke();
  ctx.restore();
}

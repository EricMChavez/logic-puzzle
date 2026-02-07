import type { ThemeTokens } from '../../shared/tokens/token-types.ts';
import type { PixelRect } from '../../shared/grid/types.ts';
import type { MeterCircularBuffer } from './circular-buffer.ts';
import { METER_BUFFER_CAPACITY, VERTICAL_HEIGHT_RATIO } from './meter-types.ts';

/**
 * Draw the target waveform overlay as an unfilled stroke line.
 * Used on output meters to show the expected waveform.
 *
 * Uses the same vertical extent and horizontal positioning as the
 * waveform channel for visual alignment.
 */
export function drawTargetOverlay(
  ctx: CanvasRenderingContext2D,
  tokens: ThemeTokens,
  targetBuffer: MeterCircularBuffer,
  rect: PixelRect,
  matchStatus?: boolean[] | null,
): void {
  const sampleCount = targetBuffer.count;
  if (sampleCount < 2) return;

  const centerY = rect.y + rect.height / 2;
  const halfHeight = (rect.height * VERTICAL_HEIGHT_RATIO) / 2;
  const colWidth = rect.width / METER_BUFFER_CAPACITY;

  // Helper to get x,y for a sample index
  const samplePos = (i: number): { x: number; y: number } => {
    const value = targetBuffer.at(i);
    const clamped = Math.max(-100, Math.min(100, value));
    const normalized = clamped / 100;
    const distanceFromNewest = sampleCount - 1 - i;
    return {
      x: rect.x + distanceFromNewest * colWidth + colWidth / 2,
      y: centerY - normalized * halfHeight,
    };
  };

  const hasMatchData = matchStatus && matchStatus.length > 0;

  if (!hasMatchData) {
    // No match data — draw all as dashed default color
    ctx.save();
    ctx.strokeStyle = tokens.colorTarget;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.7;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    for (let i = 0; i < sampleCount; i++) {
      const { x, y } = samplePos(i);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
    return;
  }

  // With match data: draw segments colored by match status.
  // Matching segments are solid green, non-matching are dashed default.
  ctx.save();
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = 0.7;

  for (let i = 1; i < sampleCount; i++) {
    const prevMatch = i - 1 < matchStatus!.length && matchStatus![i - 1];
    const currMatch = i < matchStatus!.length && matchStatus![i];
    const segMatch = prevMatch && currMatch;

    const p0 = samplePos(i - 1);
    const p1 = samplePos(i);

    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);

    if (segMatch) {
      ctx.strokeStyle = tokens.colorValidationMatch;
      ctx.setLineDash([]);
    } else {
      ctx.strokeStyle = tokens.colorTarget;
      ctx.setLineDash([4, 3]);
    }
    ctx.stroke();
  }

  ctx.restore();
}

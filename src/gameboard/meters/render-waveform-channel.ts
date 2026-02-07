import type { ThemeTokens } from '../../shared/tokens/token-types.ts';
import type { PixelRect } from '../../shared/grid/types.ts';
import type { MeterCircularBuffer } from './circular-buffer.ts';
import { METER_BUFFER_CAPACITY, VERTICAL_HEIGHT_RATIO } from './meter-types.ts';
import { getDevOverrides } from '../../dev/index.ts';

/**
 * Draw the scrolling waveform channel.
 *
 * Each sample maps to a vertical column with fixed width based on buffer capacity.
 * The waveform scrolls at a constant rate - no compression as samples fill in.
 *
 * Newest samples are drawn at the left edge of the waveform rect, scrolling
 * rightward as they age. Due to meter layout mirroring:
 * - Output meters: left edge is near needle/CP → shows recent output
 * - Input meters: left edge is far from needle/CP → shows upcoming input
 */
export function drawWaveformChannel(
  ctx: CanvasRenderingContext2D,
  tokens: ThemeTokens,
  buffer: MeterCircularBuffer,
  rect: PixelRect,
  matchStatus?: boolean[] | null,
): void {
  const sampleCount = buffer.count;
  if (sampleCount === 0) return;

  const devOverrides = getDevOverrides();
  const useOverrides = devOverrides.enabled;
  const verticalHeightRatio = useOverrides ? devOverrides.meterStyle.verticalHeightRatio : VERTICAL_HEIGHT_RATIO;
  const positiveColor = useOverrides ? devOverrides.colors.signalPositive : tokens.signalPositive;
  const negativeColor = useOverrides ? devOverrides.colors.signalNegative : tokens.signalNegative;

  const centerY = rect.y + rect.height / 2;
  const halfHeight = (rect.height * verticalHeightRatio) / 2;
  // Fixed column width based on buffer capacity - no compression as samples fill in
  const colWidth = rect.width / METER_BUFFER_CAPACITY;

  ctx.save();

  for (let i = 0; i < sampleCount; i++) {
    const value = buffer.at(i);
    if (Math.abs(value) < 0.5) continue; // skip near-zero

    // Constant opacity for all samples (no fade effect)
    const alpha = 0.9;

    // X position: newest samples always at left edge of waveform rect
    // i=0 is oldest, i=sampleCount-1 is newest
    // Samples scroll rightward as they age (increasing xIndex)
    //
    // Due to meter layout mirroring:
    // - Output meters: waveform rect is on RIGHT of meter, so left edge is near needle/CP
    //   → newest near CP, scrolling away (shows past output)
    // - Input meters: waveform rect is on LEFT of meter, so left edge is far from needle/CP
    //   → newest far from CP, scrolling toward CP (shows upcoming input)
    const distanceFromNewest = sampleCount - 1 - i;
    const xIndex = distanceFromNewest;
    const x = rect.x + xIndex * colWidth;

    // Signal to pixel: clamp -100..+100
    const clamped = Math.max(-100, Math.min(100, value));
    const barHeight = (Math.abs(clamped) / 100) * halfHeight;

    ctx.globalAlpha = alpha;
    const isMatch = matchStatus && i < matchStatus.length && matchStatus[i];
    ctx.fillStyle = isMatch ? tokens.colorValidationMatch : (clamped >= 0 ? positiveColor : negativeColor);

    if (clamped >= 0) {
      ctx.fillRect(x, centerY - barHeight, colWidth, barHeight);
    } else {
      ctx.fillRect(x, centerY, colWidth, barHeight);
    }
  }

  ctx.restore();
}

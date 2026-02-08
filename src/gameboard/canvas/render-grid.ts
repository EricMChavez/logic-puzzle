import type { ThemeTokens } from '../../shared/tokens/index.ts';
import type { RenderGridState } from './render-types.ts';
import {
  GRID_ROWS,
  METER_LEFT_START,
  METER_LEFT_END,
  PLAYABLE_START,
  PLAYABLE_END,
  METER_RIGHT_START,
  METER_RIGHT_END,
} from '../../shared/grid/index.ts';
import { getDevOverrides } from '../../dev/index.ts';

/**
 * Draw the gameboard grid zones and grid lines.
 * Called first in the render loop (lowest z-order).
 *
 * Zones:
 * - Left meter zone (cols 0-2): tokens.meterHousing background
 * - Playable area (cols 3-28): tokens.gridArea background + grid lines
 * - Right meter zone (cols 29-31): tokens.meterHousing background
 */
export function drawGrid(
  ctx: CanvasRenderingContext2D,
  tokens: ThemeTokens,
  state: RenderGridState,
  cellSize: number,
): void {
  const devOverrides = getDevOverrides();
  const useOverrides = devOverrides.enabled;

  // Get style values (use dev overrides if enabled)
  const gridAreaColor = useOverrides ? devOverrides.colors.gridArea : tokens.gridArea;
  const meterHousingColor = useOverrides ? devOverrides.colors.meterHousing : tokens.meterHousing;
  const gridLineColor = useOverrides ? devOverrides.colors.gridLine : tokens.gridLine;
  const lineOpacity = useOverrides ? devOverrides.gridStyle.lineOpacity : 1.0;
  const insetDepthTop = useOverrides ? devOverrides.gridStyle.insetDepthTop : 0.4;
  const insetDepthSide = useOverrides ? devOverrides.gridStyle.insetDepthSide : 0.3;

  const prevAlpha = ctx.globalAlpha;
  if (state.gridOpacity !== undefined) {
    ctx.globalAlpha = state.gridOpacity;
  }

  const totalHeight = GRID_ROWS * cellSize;

  // 1. Playable area background
  const playableX = PLAYABLE_START * cellSize;
  const playableCols = PLAYABLE_END - PLAYABLE_START + 1;
  ctx.fillStyle = gridAreaColor;
  ctx.fillRect(playableX, 0, playableCols * cellSize, totalHeight);

  // 2. Left meter zone background (cols 0-2)
  const leftMeterCols = METER_LEFT_END - METER_LEFT_START + 1;
  ctx.fillStyle = meterHousingColor;
  ctx.fillRect(METER_LEFT_START * cellSize, 0, leftMeterCols * cellSize, totalHeight);

  // 3. Right meter zone background (cols 29-31)
  const rightMeterX = METER_RIGHT_START * cellSize;
  const rightMeterCols = METER_RIGHT_END - METER_RIGHT_START + 1;
  ctx.fillRect(rightMeterX, 0, rightMeterCols * cellSize, totalHeight);

  // 4. Recessed depth effect for grid area (inset shadow)
  const gridX = PLAYABLE_START * cellSize;
  const gridWidth = playableCols * cellSize;
  ctx.save();
  // Top shadow (darker, stronger)
  const topGradient = ctx.createLinearGradient(0, 0, 0, cellSize * 1.5);
  topGradient.addColorStop(0, `rgba(0, 0, 0, ${insetDepthTop})`);
  topGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = topGradient;
  ctx.fillRect(gridX, 0, gridWidth, cellSize * 1.5);

  // Bottom shadow (lighter highlight)
  const bottomGradient = ctx.createLinearGradient(0, totalHeight - cellSize, 0, totalHeight);
  bottomGradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
  bottomGradient.addColorStop(1, `rgba(0, 0, 0, ${insetDepthTop * 0.625})`);
  ctx.fillStyle = bottomGradient;
  ctx.fillRect(gridX, totalHeight - cellSize, gridWidth, cellSize);

  // Left edge shadow
  const leftGradient = ctx.createLinearGradient(gridX, 0, gridX + cellSize, 0);
  leftGradient.addColorStop(0, `rgba(0, 0, 0, ${insetDepthSide})`);
  leftGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = leftGradient;
  ctx.fillRect(gridX, 0, cellSize, totalHeight);

  // Right edge shadow
  const rightGradient = ctx.createLinearGradient(gridX + gridWidth - cellSize, 0, gridX + gridWidth, 0);
  rightGradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
  rightGradient.addColorStop(1, `rgba(0, 0, 0, ${insetDepthSide})`);
  ctx.fillStyle = rightGradient;
  ctx.fillRect(gridX + gridWidth - cellSize, 0, cellSize, totalHeight);
  ctx.restore();

  // 5. Dot matrix at grid intersections in the playable area
  ctx.save();
  if (lineOpacity !== 1.0) {
    ctx.globalAlpha = ctx.globalAlpha * lineOpacity;
  }
  ctx.fillStyle = gridLineColor;

  const dotRadius = Math.max(1, cellSize * 0.06);

  ctx.beginPath();
  for (let col = PLAYABLE_START + 1; col <= PLAYABLE_END; col++) {
    const x = col * cellSize;
    for (let row = 1; row < GRID_ROWS; row++) {
      const y = row * cellSize;
      ctx.moveTo(x + dotRadius, y);
      ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
    }
  }
  ctx.fill();
  ctx.restore();

  // Restore alpha
  if (state.gridOpacity !== undefined) {
    ctx.globalAlpha = prevAlpha;
  }
}

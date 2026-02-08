import { CONNECTION_POINT_CONFIG } from '../../shared/constants/index.ts';
import type { ThemeTokens } from '../../shared/tokens/token-types.ts';
import type { RenderConnectionPointsState } from './render-types.ts';
import { getConnectionPointPosition } from './port-positions.ts';
import { buildConnectionPointConfig, buildCustomNodeConnectionPointConfig } from '../../puzzle/types.ts';

/** Draw the gameboard's input and output connection points. */
export function renderConnectionPoints(
  ctx: CanvasRenderingContext2D,
  tokens: ThemeTokens,
  state: RenderConnectionPointsState,
  cellSize: number,
): void {
  const { RADIUS } = CONNECTION_POINT_CONFIG;

  const cpConfig = state.editingUtilityId
    ? buildCustomNodeConnectionPointConfig()
    : state.activePuzzle?.connectionPoints
      ?? buildConnectionPointConfig(
        state.activePuzzle?.activeInputs ?? CONNECTION_POINT_CONFIG.INPUT_COUNT,
        state.activePuzzle?.activeOutputs ?? CONNECTION_POINT_CONFIG.OUTPUT_COUNT,
      );

  const showValidation = state.isSimRunning && state.activePuzzle !== null;

  // Left-side connection points
  for (let i = 0; i < cpConfig.left.length; i++) {
    const slot = cpConfig.left[i];
    if (!slot.active) continue;
    const pos = getConnectionPointPosition('left', i, cellSize);
    // Output CPs get validation glow
    const matchState = showValidation && slot.direction === 'output' && slot.cpIndex !== undefined
      && slot.cpIndex < state.perPortMatch.length
      ? state.perPortMatch[slot.cpIndex]
      : undefined;
    drawConnectionPoint(ctx, tokens, pos.x, pos.y, RADIUS, matchState);
  }

  // Right-side connection points
  for (let i = 0; i < cpConfig.right.length; i++) {
    const slot = cpConfig.right[i];
    if (!slot.active) continue;
    const pos = getConnectionPointPosition('right', i, cellSize);
    const matchState = showValidation && slot.direction === 'output' && slot.cpIndex !== undefined
      && slot.cpIndex < state.perPortMatch.length
      ? state.perPortMatch[slot.cpIndex]
      : undefined;
    drawConnectionPoint(ctx, tokens, pos.x, pos.y, RADIUS, matchState);
  }
}

function drawConnectionPoint(
  ctx: CanvasRenderingContext2D,
  tokens: ThemeTokens,
  x: number,
  y: number,
  radius: number,
  matchState?: boolean,
): void {
  // Validation glow ring for output CPs
  if (matchState !== undefined) {
    const glowColor = matchState ? tokens.signalPositive : tokens.signalNegative;
    ctx.save();
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 12;
    ctx.strokeStyle = glowColor;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, radius + 3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Circle
  ctx.fillStyle = tokens.colorNeutral;
  ctx.strokeStyle = tokens.depthRaised;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

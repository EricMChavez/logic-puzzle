import { CONNECTION_POINT_CONFIG } from '../../shared/constants/index.ts';
import type { ThemeTokens } from '../../shared/tokens/token-types.ts';
import type { RenderConnectionPointsState } from './render-types.ts';
import { getConnectionPointPosition } from './port-positions.ts';

/** Draw the gameboard's input and output connection points. */
export function renderConnectionPoints(
  ctx: CanvasRenderingContext2D,
  tokens: ThemeTokens,
  state: RenderConnectionPointsState,
  cellSize: number,
): void {
  const { INPUT_COUNT, OUTPUT_COUNT, RADIUS } = CONNECTION_POINT_CONFIG;

  // Determine active CP counts from puzzle config
  const activeInputs = state.activePuzzle?.activeInputs ?? INPUT_COUNT;
  const activeOutputs = state.activePuzzle?.activeOutputs ?? OUTPUT_COUNT;

  // Input connection points (left side)
  for (let i = 0; i < activeInputs; i++) {
    const pos = getConnectionPointPosition('input', i, cellSize);
    drawConnectionPoint(ctx, tokens, pos.x, pos.y, RADIUS);
  }

  // Get validation state for output glow indicators
  const showValidation = state.isSimRunning && state.activePuzzle !== null;

  // Output connection points (right side)
  for (let i = 0; i < activeOutputs; i++) {
    const pos = getConnectionPointPosition('output', i, cellSize);
    const matchState = showValidation && i < state.perPortMatch.length
      ? state.perPortMatch[i]
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

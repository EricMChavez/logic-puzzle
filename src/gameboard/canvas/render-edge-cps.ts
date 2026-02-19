import type { ThemeTokens } from '../../shared/tokens/token-types.ts';
import type { MotherboardEdgeCP } from '../../store/motherboard-types.ts';
import { NODE_STYLE } from '../../shared/constants/index.ts';
import { signalToColor, signalToGlow } from './render-wires.ts';
import { drawPort } from './render-nodes.ts';

/**
 * Draw animated edge connection points at section boundaries.
 * Each visible edge CP is rendered as a proper port (plug/socket matching direction)
 * with a horizontal wire segment connecting it to the puzzle chip's port.
 */
export function drawEdgeCPs(
  ctx: CanvasRenderingContext2D,
  tokens: ThemeTokens,
  edgeCPs: readonly MotherboardEdgeCP[],
  playpoint: number,
  cellSize: number,
): void {
  const portRadius = NODE_STYLE.PORT_RADIUS_RATIO * cellSize;
  const wireWidth = Number(tokens.wireWidthBase) || 6;

  for (const cp of edgeCPs) {
    if (!cp.visible) continue;

    const edgeX = cp.gridPosition.col * cellSize;
    const edgeY = cp.gridPosition.row * cellSize;

    // Signal value: use samples when connected, neutral (no signal) when not
    const value = cp.connected ? (cp.samples[playpoint] ?? 0) : 0;
    const color = cp.connected ? signalToColor(value, tokens) : tokens.colorNeutral;
    const glow = cp.connected ? signalToGlow(value) : 0;
    const portColorOverride = cp.connected ? undefined : tokens.colorNeutral;

    const portX = cp.portGridPosition.col * cellSize;
    const portY = cp.portGridPosition.row * cellSize;

    // --- Draw horizontal wire from edge CP to chip port ---
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = wireWidth;
    ctx.lineCap = 'round';
    if (glow > 0) {
      ctx.shadowColor = color;
      ctx.shadowBlur = glow;
    }
    ctx.beginPath();
    ctx.moveTo(edgeX, edgeY);
    ctx.lineTo(portX, portY);
    ctx.stroke();
    ctx.restore();

    // Edge CP direction determines visual: source (output) = socket, destination (input) = seated
    const edgeOpenDir = cp.side === 'left' ? 'right' : 'left';
    const chipOpenDir = cp.side === 'left' ? 'left' : 'right';
    if (cp.direction === 'output') {
      // Left-side: edge CP is source → empty socket, chip port receives → seated plug
      drawPort(ctx, tokens, edgeX, edgeY, portRadius, value, { type: 'socket', openingDirection: edgeOpenDir, connected: true }, portColorOverride);
      drawPort(ctx, tokens, portX, portY, portRadius, value, { type: 'seated', openingDirection: chipOpenDir }, portColorOverride);
    } else {
      // Right-side: chip port is source → empty socket, edge CP receives → seated plug
      drawPort(ctx, tokens, portX, portY, portRadius, value, { type: 'socket', openingDirection: chipOpenDir, connected: true }, portColorOverride);
      drawPort(ctx, tokens, edgeX, edgeY, portRadius, value, { type: 'seated', openingDirection: edgeOpenDir }, portColorOverride);
    }
  }
}

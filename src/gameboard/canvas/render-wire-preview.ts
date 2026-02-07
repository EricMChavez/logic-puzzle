import type { Vec2 } from '../../shared/types/index.ts';
import type { GridPoint } from '../../shared/grid/types.ts';
import type { ThemeTokens } from '../../shared/tokens/token-types.ts';

/**
 * Draw a preview wire along an A*-routed grid path.
 * Falls back to a simple dashed line if no path is available.
 */
export function renderWirePreview(
  ctx: CanvasRenderingContext2D,
  tokens: ThemeTokens,
  sourcePos: Vec2,
  targetPos: Vec2,
  path: GridPoint[] | null,
  cellSize: number,
): void {
  ctx.strokeStyle = tokens.colorNeutral;
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  ctx.globalAlpha = 0.7;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();

  if (path && path.length > 0) {
    // Draw along the A* grid path
    ctx.moveTo(sourcePos.x, sourcePos.y);
    for (const pt of path) {
      ctx.lineTo(pt.col * cellSize, pt.row * cellSize);
    }
    ctx.lineTo(targetPos.x, targetPos.y);
  } else {
    // Fallback: simple dashed line
    ctx.moveTo(sourcePos.x, sourcePos.y);
    ctx.lineTo(targetPos.x, targetPos.y);
  }

  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
}

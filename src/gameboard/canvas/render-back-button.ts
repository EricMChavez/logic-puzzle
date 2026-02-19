import type { ThemeTokens } from '../../shared/tokens/token-types.ts';
import { BACK_BUTTON } from '../../shared/constants/index.ts';

// --- Module-level hover state (singleton pattern like render-playback-bar.ts) ---

let _hovered = false;

export function getHoveredBackButton(): boolean {
  return _hovered;
}

export function setHoveredBackButton(hovered: boolean): void {
  _hovered = hovered;
}

// --- Geometry helpers ---

function getButtonRect(cellSize: number) {
  const left = BACK_BUTTON.COL_START * cellSize;
  const top = BACK_BUTTON.ROW_START * cellSize;
  const width = (BACK_BUTTON.COL_END - BACK_BUTTON.COL_START + 1) * cellSize;
  const height = (BACK_BUTTON.ROW_END - BACK_BUTTON.ROW_START + 1) * cellSize;
  return { left, top, width, height };
}

// --- Hit testing ---

export function hitTestBackButton(x: number, y: number, cellSize: number): boolean {
  const r = getButtonRect(cellSize);
  return x >= r.left && x <= r.left + r.width && y >= r.top && y <= r.top + r.height;
}

// --- Drawing ---

export interface BackButtonRenderState {
  hovered: boolean;
  pulsing: boolean;
}

/** Inset padding ratio (fraction of cell size) */
const PAD_RATIO = 0.35;
/** Corner radius ratio (fraction of button height) */
const CORNER_RADIUS_RATIO = 0.15;

/**
 * Draw the D1 back button: a subtle rounded-rect container with a
 * perspective trapezoid + upward arrow icon inside.
 */
export function drawBackButton(
  ctx: CanvasRenderingContext2D,
  tokens: ThemeTokens,
  state: BackButtonRenderState,
  cellSize: number,
): void {
  const r = getButtonRect(cellSize);
  const pad = cellSize * PAD_RATIO;

  // Inset container rect (smaller than hit area)
  const bx = r.left + pad;
  const by = r.top + pad;
  const bw = r.width - pad * 2;
  const bh = r.height - pad * 2;
  const cr = Math.round(bh * CORNER_RADIUS_RATIO);

  // Pulsing green glow when puzzle is solved
  const pulse = state.pulsing
    ? 0.5 + 0.5 * Math.sin((performance.now() / 1200) * Math.PI * 2)
    : 0;

  const borderColor = state.pulsing ? `rgba(80, 200, 120, ${0.6 + 0.4 * pulse})` : tokens.meterBorder;
  const iconColor = state.pulsing
    ? `rgba(80, 200, 120, ${0.7 + 0.3 * pulse})`
    : state.hovered ? tokens.textPrimary : tokens.meterBorder;

  ctx.save();

  // Green glow pass when pulsing
  if (state.pulsing) {
    ctx.save();
    ctx.shadowColor = `rgba(80, 200, 120, ${0.5 + 0.5 * pulse})`;
    ctx.shadowBlur = cellSize * (0.8 + 1.0 * pulse);
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, cr);
    ctx.fillStyle = `rgba(80, 200, 120, ${0.06 + 0.09 * pulse})`;
    ctx.fill();
    ctx.restore();
  }

  // Container background — very subtle fill, just enough to read as a surface
  ctx.fillStyle = state.pulsing
    ? `rgba(80, 200, 120, ${0.06 + 0.08 * pulse})`
    : state.hovered ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.02)';
  ctx.beginPath();
  ctx.roundRect(bx, by, bw, bh, cr);
  ctx.fill();

  // Container border — thin, matching meter border color
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = state.pulsing ? 1.5 : state.hovered ? 1.5 : 1;
  ctx.globalAlpha = state.pulsing ? 1 : state.hovered ? 0.9 : 0.5;
  ctx.beginPath();
  ctx.roundRect(bx, by, bw, bh, cr);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // --- Icon: perspective trapezoid + upward arrow ---
  const iconCx = bx + bw / 2;
  const iconCy = by + bh / 2;
  const iconSize = Math.min(bw, bh) * 0.6;
  const lineWidth = Math.max(1.5, cellSize * 0.07);

  ctx.strokeStyle = iconColor;
  ctx.fillStyle = iconColor;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Trapezoid: wide bottom, narrow top — pushed low in the icon frame
  const trapH = iconSize * 0.35;
  const trapBottomW = iconSize * 0.75;
  const trapTopW = iconSize * 0.42;
  const trapBottom = iconCy + iconSize * 0.42;
  const trapTop = trapBottom - trapH;

  ctx.beginPath();
  ctx.moveTo(iconCx - trapBottomW / 2, trapBottom);
  ctx.lineTo(iconCx - trapTopW / 2, trapTop);
  ctx.lineTo(iconCx + trapTopW / 2, trapTop);
  ctx.lineTo(iconCx + trapBottomW / 2, trapBottom);
  ctx.closePath();
  ctx.stroke();

  // Arrow shaft rising from trapezoid top
  const arrowBottom = trapTop - lineWidth;
  const arrowTop = iconCy - iconSize * 0.42;
  const arrowHeadSize = iconSize * 0.2;

  ctx.beginPath();
  ctx.moveTo(iconCx, arrowBottom);
  ctx.lineTo(iconCx, arrowTop);
  ctx.stroke();

  // Arrowhead (filled triangle)
  ctx.beginPath();
  ctx.moveTo(iconCx, arrowTop - arrowHeadSize * 0.3);
  ctx.lineTo(iconCx - arrowHeadSize, arrowTop + arrowHeadSize * 0.5);
  ctx.lineTo(iconCx + arrowHeadSize, arrowTop + arrowHeadSize * 0.5);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

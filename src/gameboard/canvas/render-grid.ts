import type { ThemeTokens } from '../../shared/tokens/index.ts';
import type { RenderGridState } from './render-types.ts';
import {
  GRID_COLS,
  GRID_ROWS,
  METER_LEFT_START,
  METER_LEFT_END,
  PLAYABLE_START,
  PLAYABLE_END,
  METER_RIGHT_START,
  METER_RIGHT_END,
} from '../../shared/grid/index.ts';
import { getDevOverrides } from '../../dev/index.ts';
import { GAMEBOARD_STYLE, HIGHLIGHT_STREAK, DEPTH, PLAYBACK_BAR } from '../../shared/constants/index.ts';
import { drawHighlightStreak, getLightDirection } from './render-highlight-streak.ts';
import { drawBoardMessageCard } from './render-board-message-card.ts';
import { drawNoiseGrain } from './render-noise-grain.ts';

// --- Grid dot matrix OffscreenCanvas cache ---
let _dotCache: OffscreenCanvas | null = null;
let _dotCacheCellSize = 0;
let _dotCacheColor = '';
let _dotCacheOpacity = 0;

/** Invalidate the dot matrix cache (used in tests). */
export function invalidateGridDotCache(): void {
  _dotCache = null;
  _dotCacheCellSize = 0;
  _dotCacheColor = '';
  _dotCacheOpacity = 0;
}

/**
 * Draw the gameboard grid zones and grid lines.
 * Called first in the render loop (lowest z-order).
 *
 * Layer order within this function:
 * 1. Flat background fill
 * 2. Inset shadow (sunken depth)
 * 3. Tutorial text (engraved appearance, under dots)
 * 4. Dot matrix at grid intersections
 * 5. Noise grain (integrates text/dots into surface)
 * 6. Highlight streak (diagonal light band, on top of everything)
 * 7. Debug grid labels (dev only)
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
  const gridLineColor = useOverrides ? devOverrides.colors.gridLine : tokens.gridLine;
  const lineOpacity = useOverrides ? devOverrides.gridStyle.lineOpacity : 0.3;

  const prevAlpha = ctx.globalAlpha;
  if (state.gridOpacity !== undefined) {
    ctx.globalAlpha = state.gridOpacity;
  }

  const totalHeight = GRID_ROWS * cellSize;
  const cornerRadius = cellSize * GAMEBOARD_STYLE.CORNER_RADIUS_RATIO;

  // 1. Playable area flat background
  const playableX = PLAYABLE_START * cellSize;
  const playableCols = PLAYABLE_END - PLAYABLE_START + 1;
  const playableWidth = playableCols * cellSize;
  ctx.fillStyle = useOverrides ? devOverrides.colors.gameboardBackground : tokens.gridArea;
  ctx.beginPath();
  ctx.roundRect(playableX, 0, playableWidth, totalHeight, cornerRadius);
  ctx.fill();

  // Meter zones are transparent — each meter draws its own opaque backing

  // 2. Inset shadow (gameboard appears recessed)
  const playableRect = { x: playableX, y: 0, width: playableWidth, height: totalHeight };
  const insetEnabled = useOverrides ? devOverrides.depthStyle.gameboardInsetEnabled : true;
  if (insetEnabled) {
    drawInsetShadow(ctx, playableRect, cornerRadius);
  }

  // 3. Board message card (under dots and streak, over flat fill)
  if (state.tutorialTitle || state.tutorialMessage) {
    drawBoardMessageCard(ctx, tokens, state.tutorialTitle, state.tutorialMessage, cellSize);
  }

  // 4. Dot matrix at grid intersections in the playable area (OffscreenCanvas cached)
  const dotCanvas = getDotMatrixCache(cellSize, gridLineColor, lineOpacity);
  if (dotCanvas) {
    ctx.save();
    // Clip to rounded rect so dots don't appear in corners
    ctx.beginPath();
    ctx.roundRect(playableX, 0, playableCols * cellSize, totalHeight, cornerRadius);
    ctx.clip();

    const dotAlpha = lineOpacity !== 1.0 ? ctx.globalAlpha * lineOpacity : ctx.globalAlpha;
    ctx.globalAlpha = dotAlpha;
    ctx.drawImage(dotCanvas, playableX, 0);
    ctx.restore();
  }

  // 5. Noise grain (integrates text/dots into surface texture)
  const noiseOpacity = useOverrides ? devOverrides.gridStyle.noiseOpacity : 0.045;
  const noiseTileSize = useOverrides ? devOverrides.gridStyle.noiseTileSize : 2;
  if (noiseOpacity > 0) {
    drawNoiseGrain(ctx, playableRect, noiseOpacity, noiseTileSize);
  }

  // 6. Highlight streak across playable area (on top of everything)
  const boardHard = useOverrides ? devOverrides.highlightStyle.gameboardHard : HIGHLIGHT_STREAK.HARD_OPACITY;
  const boardSoft = useOverrides ? devOverrides.highlightStyle.gameboardSoft : HIGHLIGHT_STREAK.SOFT_OPACITY;
  const boardFade = useOverrides ? devOverrides.highlightStyle.verticalFadeRatio : HIGHLIGHT_STREAK.VERTICAL_FADE_RATIO;
  drawHighlightStreak(ctx, playableRect, boardHard, boardSoft, boardFade);

  // 7. Debug grid labels (dev override only)
  const showLabels = devOverrides.enabled && devOverrides.gridStyle.showGridLabels;
  if (showLabels) {
    ctx.save();
    const fontSize = Math.max(8, Math.floor(cellSize * 0.35));
    ctx.font = `${fontSize}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let col = 0; col < GRID_COLS; col++) {
      for (let row = 0; row < GRID_ROWS; row++) {
        // Show every 5th intersection, plus edges
        const isEdgeCol = col === 0 || col === GRID_COLS - 1 || col === PLAYABLE_START || col === PLAYABLE_END;
        const isEdgeRow = row === 0 || row === GRID_ROWS - 1;
        const isFifth = col % 5 === 0 && row % 5 === 0;

        if (!isFifth && !isEdgeCol && !isEdgeRow) continue;

        const x = col * cellSize + cellSize / 2;
        const y = row * cellSize + cellSize / 2;
        const label = `${col},${row}`;

        // Background pill for readability
        const metrics = ctx.measureText(label);
        const padX = 2;
        const padY = 1;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(
          x - metrics.width / 2 - padX,
          y - fontSize / 2 - padY,
          metrics.width + padX * 2,
          fontSize + padY * 2,
        );

        // Zone coloring: playable = green, meter = cyan, other = white
        if (col >= PLAYABLE_START && col <= PLAYABLE_END) {
          ctx.fillStyle = '#88ff88';
        } else if (
          (col >= METER_LEFT_START && col <= METER_LEFT_END) ||
          (col >= METER_RIGHT_START && col <= METER_RIGHT_END)
        ) {
          ctx.fillStyle = '#88ffff';
        } else {
          ctx.fillStyle = '#ffffff';
        }

        ctx.fillText(label, x, y);
      }
    }
    ctx.restore();
  }

  // Restore alpha
  if (state.gridOpacity !== undefined) {
    ctx.globalAlpha = prevAlpha;
  }
}

/**
 * Get or regenerate the dot matrix OffscreenCanvas cache.
 * Only redraws when cellSize or grid line color changes.
 */
function getDotMatrixCache(cellSize: number, color: string, opacity: number): OffscreenCanvas | null {
  if (_dotCache && _dotCacheCellSize === cellSize && _dotCacheColor === color && _dotCacheOpacity === opacity) {
    return _dotCache;
  }

  if (typeof OffscreenCanvas === 'undefined') return null;

  const playableCols = PLAYABLE_END - PLAYABLE_START + 1;
  const width = playableCols * cellSize;
  const height = GRID_ROWS * cellSize;

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = color;
  const dotRadius = Math.max(1, cellSize * 0.06);

  ctx.beginPath();
  for (let col = PLAYABLE_START + 1; col <= PLAYABLE_END; col++) {
    // Offset relative to playable start since canvas starts at playableX
    const x = (col - PLAYABLE_START) * cellSize;
    for (let row = 1; row < GRID_ROWS; row++) {
      // Skip dots inside the playback bar trapezoid (bottom edge inset by 2 cols each side)
      if (row >= PLAYBACK_BAR.ROW_START && row <= PLAYBACK_BAR.ROW_END) {
        // t: 0 at top (wider), 1 at bottom (narrower) — matches getTrapezoidPoints() inset
        const t = (row - PLAYBACK_BAR.ROW_START) / (PLAYBACK_BAR.ROW_END + 1 - PLAYBACK_BAR.ROW_START);
        const leftEdge = PLAYBACK_BAR.COL_START + t * 2;
        const rightEdge = PLAYBACK_BAR.COL_END + 1 - t * 2;
        if (col >= leftEdge && col <= rightEdge) continue;
      }
      const y = row * cellSize;
      ctx.moveTo(x + dotRadius, y);
      ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
    }
  }
  ctx.fill();

  _dotCache = canvas;
  _dotCacheCellSize = cellSize;
  _dotCacheColor = color;
  _dotCacheOpacity = opacity;
  return canvas;
}

/**
 * Draw an inset shadow inside the gameboard rect using the clip-and-overdraw technique.
 *
 * Two passes:
 * - Dark pass: shadow toward lower-right (away from light) — recessed bottom/right edges
 * - Light pass: shadow toward upper-left (toward light) — subtle light-catch on top/left edges
 */
function drawInsetShadow(
  ctx: CanvasRenderingContext2D,
  rect: { x: number; y: number; width: number; height: number },
  cornerRadius: number,
): void {
  const devOverrides = getDevOverrides();
  const useOverrides = devOverrides.enabled;

  const darkBlur = useOverrides ? devOverrides.depthStyle.darkBlur : DEPTH.INSET.DARK_BLUR;
  const darkOffset = useOverrides ? devOverrides.depthStyle.darkOffset : DEPTH.INSET.DARK_OFFSET;
  const darkColor = useOverrides ? devOverrides.depthStyle.darkColor : DEPTH.INSET.DARK_COLOR;
  const lightBlur = useOverrides ? devOverrides.depthStyle.lightBlur : DEPTH.INSET.LIGHT_BLUR;
  const lightOffset = useOverrides ? devOverrides.depthStyle.lightOffset : DEPTH.INSET.LIGHT_OFFSET;
  const lightOpacity = useOverrides ? devOverrides.depthStyle.lightOpacity : DEPTH.INSET.LIGHT_OPACITY;

  // Light direction for consistent shadow placement
  const light = getLightDirection();
  // Outer frame margin — must be larger than blur + offset to contain the shadow
  const margin = Math.max(darkBlur, lightBlur) + Math.max(darkOffset, lightOffset) + 20;

  // --- Dark pass (shadow falls away from light → lower-right) ---
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(rect.x, rect.y, rect.width, rect.height, cornerRadius);
  ctx.clip();

  ctx.shadowColor = darkColor;
  ctx.shadowBlur = darkBlur;
  ctx.shadowOffsetX = -light.x * darkOffset;
  ctx.shadowOffsetY = -light.y * darkOffset;
  ctx.fillStyle = 'rgba(0,0,0,1)';

  // Draw outer frame with evenodd so only the shadow leaks inside the clip
  ctx.beginPath();
  ctx.rect(rect.x - margin, rect.y - margin, rect.width + margin * 2, rect.height + margin * 2);
  ctx.roundRect(rect.x, rect.y, rect.width, rect.height, cornerRadius);
  ctx.fill('evenodd');
  ctx.restore();

  // --- Light pass (light catch on upper-left edges) ---
  const warmTint = HIGHLIGHT_STREAK.WARM_TINT;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(rect.x, rect.y, rect.width, rect.height, cornerRadius);
  ctx.clip();

  ctx.shadowColor = `rgba(${warmTint.r},${warmTint.g},${warmTint.b},${lightOpacity})`;
  ctx.shadowBlur = lightBlur;
  ctx.shadowOffsetX = light.x * lightOffset;
  ctx.shadowOffsetY = light.y * lightOffset;
  ctx.fillStyle = 'rgba(0,0,0,1)';

  ctx.beginPath();
  ctx.rect(rect.x - margin, rect.y - margin, rect.width + margin * 2, rect.height + margin * 2);
  ctx.roundRect(rect.x, rect.y, rect.width, rect.height, cornerRadius);
  ctx.fill('evenodd');
  ctx.restore();
}

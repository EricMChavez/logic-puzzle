import type { ThemeTokens } from '../../shared/tokens/token-types.ts';
import { PLAYBACK_BAR, RETRO_PANEL, RETRO_SCREW } from '../../shared/constants/index.ts';

// --- Types ---

export type PlaybackButton = 'prev' | 'play' | 'stop' | 'next';

export interface PlaybackBarRenderState {
  playMode: 'playing' | 'paused';
  hoveredButton: PlaybackButton | null;
  pressedButton: PlaybackButton | null;
  indicatorState: 'neutral' | 'matched' | 'mismatched';
  /** Y coordinate of the viewport top edge in grid-translated coordinates (i.e. -offsetY). */
  viewportTopY: number;
}

export interface PlaybackBarHit {
  button: PlaybackButton;
}

// --- Module-level hover state (singleton pattern like keyboard-focus.ts) ---

let _hoveredButton: PlaybackButton | null = null;

export function getHoveredPlaybackButton(): PlaybackButton | null {
  return _hoveredButton;
}

export function setHoveredPlaybackButton(button: PlaybackButton | null): void {
  _hoveredButton = button;
}

let _pressedButton: PlaybackButton | null = null;

export function getPressedPlaybackButton(): PlaybackButton | null {
  return _pressedButton;
}

export function setPressedPlaybackButton(button: PlaybackButton | null): void {
  _pressedButton = button;
}

// --- Geometry constants ---

/** Top padding in tray — dark cavity visible above buttons */
const BUTTON_TOP_INSET_PX = 4;
/** Button height as ratio of bar height (protrudes below housing) */
const BUTTON_HEIGHT_RATIO = 1.125;
/** Pixel gap between buttons */
const BUTTON_GAP_PX = 2;
/** Side panel width as a fraction of cellSize */
const SIDE_PANEL_RATIO = 0.8;
/** Bottom corner rounding on side panels */
const SIDE_PANEL_CORNER_RADIUS = 8;
/** Screw circle radius */
const SCREW_RADIUS = 5;
/** How far a depressed button shifts down */
const DEPRESSED_OFFSET_PX = 8;
/** Fixed icon size in pixels */
const ICON_SIZE_PX = 16;
/** Pulse period for paused play icon glow — matches full 256-cycle sweep at 16/sec */
const PULSE_PERIOD_MS = (256 / 16) * 1000; // 16 000 ms

// --- Hardcoded colors (physical device aesthetic — theme-independent) ---

// Tray
const TRAY_BG = '#121214';

// Side panels (from shared retro-plastic constants)
const PANEL_GRAD_TOP = RETRO_PANEL.GRAD_TOP;
const PANEL_GRAD_MID = RETRO_PANEL.GRAD_MID;
const PANEL_GRAD_BOT = RETRO_PANEL.GRAD_BOT;

// Screws (from shared retro-plastic constants)
const SCREW_GRAD_LIGHT = RETRO_SCREW.GRAD_LIGHT;
const SCREW_GRAD_DARK = RETRO_SCREW.GRAD_DARK;

// Buttons (Jet Black)
const BTN_REST_TOP = '#3a3a3e';
const BTN_REST_MID = '#2e2e32';
const BTN_REST_BOT = '#26262a';
const BTN_HOVER_TOP = '#424248';
const BTN_HOVER_MID = '#36363c';
const BTN_HOVER_BOT = '#2e2e34';

// Icons
const ICON_REST = '#7a7a88';
const ICON_HOVER = '#b0b0c0';
const ICON_ACTIVE = '#ffffff';
const ICON_DISABLED = '#50505a';

// --- Color helpers ---

/** Linearly interpolate between two hex colors (#rrggbb). */
function lerpColor(a: string, b: string, t: number): string {
  const ar = parseInt(a.slice(1, 3), 16), ag = parseInt(a.slice(3, 5), 16), ab = parseInt(a.slice(5, 7), 16);
  const br = parseInt(b.slice(1, 3), 16), bg = parseInt(b.slice(3, 5), 16), bb = parseInt(b.slice(5, 7), 16);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${bl.toString(16).padStart(2, '0')}`;
}

// --- Geometry helpers ---

/** Compute the overall bar bounds in pixel coordinates. */
function getBarRect(cellSize: number) {
  const left = PLAYBACK_BAR.COL_START * cellSize;
  const right = (PLAYBACK_BAR.COL_END + 1) * cellSize;
  const top = PLAYBACK_BAR.ROW_START * cellSize;
  const height = PLAYBACK_BAR.HEIGHT_CELLS * cellSize;
  const bottom = top + height;
  const width = right - left;
  const sideWidth = cellSize * SIDE_PANEL_RATIO;
  const trayLeft = left + sideWidth;
  const trayRight = right - sideWidth;
  const buttonHeight = height * BUTTON_HEIGHT_RATIO;
  const buttonBottom = top + BUTTON_TOP_INSET_PX + buttonHeight;

  return { left, right, top, bottom, width, height, sideWidth, trayLeft, trayRight, buttonBottom };
}

/** Get the 4 button key rectangles (between side panels). */
function getButtonKeyRects(cellSize: number) {
  const bar = getBarRect(cellSize);
  const trayWidth = bar.trayRight - bar.trayLeft;
  const btnWidth = (trayWidth - BUTTON_GAP_PX * 3) / 4;
  const btnTop = bar.top + BUTTON_TOP_INSET_PX;
  const btnHeight = bar.height * BUTTON_HEIGHT_RATIO;

  const buttons: PlaybackButton[] = ['prev', 'play', 'stop', 'next'];
  const rects = {} as Record<PlaybackButton, {
    left: number; top: number; width: number; height: number;
    centerX: number; centerY: number;
  }>;

  for (let i = 0; i < 4; i++) {
    const left = bar.trayLeft + i * (btnWidth + BUTTON_GAP_PX);
    rects[buttons[i]] = {
      left,
      top: btnTop,
      width: btnWidth,
      height: btnHeight,
      centerX: left + btnWidth / 2,
      centerY: btnTop + btnHeight / 2,
    };
  }

  return rects;
}

// --- Hit testing ---

/**
 * Hit test the playback bar at canvas pixel coordinates.
 * Returns which button was hit, or null if outside the bar or on a side panel.
 */
export function hitTestPlaybackBar(
  x: number,
  y: number,
  cellSize: number,
): PlaybackBarHit | null {
  const bar = getBarRect(cellSize);

  // Quick bounds check — extended to button protrusion area
  if (y < bar.top || y > bar.buttonBottom || x < bar.left || x > bar.right) {
    return null;
  }

  // Exclude side panel clicks (screw area = no button)
  if (x < bar.trayLeft || x > bar.trayRight) {
    return null;
  }

  // Divide tray width into 4 equal quarters
  const relX = x - bar.trayLeft;
  const trayWidth = bar.trayRight - bar.trayLeft;
  const quarter = trayWidth / 4;

  if (relX < quarter) return { button: 'prev' };
  if (relX < quarter * 2) return { button: 'play' };
  if (relX < quarter * 3) return { button: 'stop' };
  return { button: 'next' };
}

// --- Occupancy blocking ---

/**
 * Check if a node placement rectangle overlaps the playback bar grid region.
 * Uses AABB rectangle intersection with the bar's grid constants.
 */
export function isOverlappingPlaybackBar(
  col: number,
  row: number,
  cols: number,
  rows: number,
): boolean {
  const nodeRight = col + cols - 1;
  const nodeBottom = row + rows - 1;

  return (
    col <= PLAYBACK_BAR.COL_END &&
    nodeRight >= PLAYBACK_BAR.COL_START &&
    row <= PLAYBACK_BAR.ROW_END &&
    nodeBottom >= PLAYBACK_BAR.ROW_START
  );
}

// --- Drawing helpers ---

/** Draw a beige side panel with gradient, sheen, highlights, and border. */
function drawSidePanel(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, width: number, height: number,
  side: 'left' | 'right',
): void {
  const cr = SIDE_PANEL_CORNER_RADIUS;
  const radii: [number, number, number, number] = side === 'left'
    ? [0, 0, 0, cr]
    : [0, 0, cr, 0];

  // Base gradient fill
  const grad = ctx.createLinearGradient(0, y, 0, y + height);
  grad.addColorStop(0, PANEL_GRAD_TOP);
  grad.addColorStop(0.4, PANEL_GRAD_MID);
  grad.addColorStop(1, PANEL_GRAD_BOT);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radii);
  ctx.fill();

  // Radial sheen (light spot near top)
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radii);
  ctx.clip();
  const sheen = ctx.createRadialGradient(
    x + width / 2, y + height * 0.2, 0,
    x + width / 2, y + height * 0.2, Math.max(width, height) * 0.7,
  );
  sheen.addColorStop(0, 'rgba(255,255,255,0.15)');
  sheen.addColorStop(1, 'transparent');
  ctx.fillStyle = sheen;
  ctx.fillRect(x, y, width, height);
  ctx.restore();

  // Top highlight (1px white line)
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(x, y, width, 1);

  // Bottom shadow (1px dark line)
  ctx.fillStyle = 'rgba(0,0,0,0.06)';
  ctx.fillRect(x, y + height - 1, width, 1);

  // Outside border (1px on outer edge)
  const borderX = side === 'left' ? x : x + width - 1;
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.fillRect(borderX, y, 1, height);
}

/** Draw a screw with radial gradient, drop shadow, highlights, and cross mark. */
function drawScrew(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
  const r = SCREW_RADIUS;

  // Drop shadow + radial gradient fill
  ctx.save();
  ctx.shadowBlur = 2;
  ctx.shadowOffsetY = 1;
  ctx.shadowColor = 'rgba(0,0,0,0.15)';

  const grad = ctx.createRadialGradient(cx - 1, cy - 1, 0, cx, cy, r);
  grad.addColorStop(0, SCREW_GRAD_LIGHT);
  grad.addColorStop(1, SCREW_GRAD_DARK);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Inner highlight/shadow (clipped to screw circle)
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.fillRect(cx - r, cy - r, r * 2, 1);
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.fillRect(cx - r, cy + r - 1, r * 2, 1);
  ctx.restore();

  // Cross mark (+)
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 1;
  const markLen = r * 0.7;
  ctx.beginPath();
  ctx.moveTo(cx - markLen, cy);
  ctx.lineTo(cx + markLen, cy);
  ctx.moveTo(cx, cy - markLen);
  ctx.lineTo(cx, cy + markLen);
  ctx.stroke();
}

// --- Icon drawing ---

/** Draw a play triangle (right-pointing) */
function drawPlayIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, color: string): void {
  const half = size / 2;
  ctx.beginPath();
  ctx.moveTo(cx - half * 0.6, cy - half);
  ctx.lineTo(cx + half, cy);
  ctx.lineTo(cx - half * 0.6, cy + half);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

/** Draw a stop square (filled) */
function drawStopIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, color: string): void {
  const half = size * 0.4;
  ctx.fillStyle = color;
  ctx.fillRect(cx - half, cy - half, half * 2, half * 2);
}

/** Draw prev icon: vertical bar + left triangle */
function drawPrevIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, color: string): void {
  const half = size / 2;
  const barW = size * 0.15;
  ctx.fillStyle = color;
  ctx.fillRect(cx - half * 0.8, cy - half, barW, size);
  ctx.beginPath();
  ctx.moveTo(cx + half * 0.8, cy - half * 0.85);
  ctx.lineTo(cx - half * 0.4, cy);
  ctx.lineTo(cx + half * 0.8, cy + half * 0.85);
  ctx.closePath();
  ctx.fill();
}

/** Draw next icon: right triangle + vertical bar */
function drawNextIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, color: string): void {
  const half = size / 2;
  const barW = size * 0.15;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx - half * 0.8, cy - half * 0.85);
  ctx.lineTo(cx + half * 0.4, cy);
  ctx.lineTo(cx - half * 0.8, cy + half * 0.85);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(cx + half * 0.8 - barW, cy - half, barW, size);
}

// --- Indicator light ---

/** Indicator pill width as fraction of tray width */
const INDICATOR_WIDTH_RATIO = 0.35;
/** Indicator pill height in pixels */
const INDICATOR_HEIGHT = 10;
/** Bezel ring width */
const INDICATOR_BEZEL = 1.5;

/** Draw a wide pill-shaped LED indicator centered between the viewport top and the playback bar. */
function drawIndicatorLight(
  ctx: CanvasRenderingContext2D,
  tokens: ThemeTokens,
  indicatorState: 'neutral' | 'matched' | 'mismatched',
  bar: ReturnType<typeof getBarRect>,
  viewportTopY: number,
): void {
  const trayWidth = bar.trayRight - bar.trayLeft;
  const w = trayWidth * INDICATOR_WIDTH_RATIO;
  const h = INDICATOR_HEIGHT;
  const cx = (bar.trayLeft + bar.trayRight) / 2;
  const cy = (viewportTopY + bar.top) / 2;
  const left = cx - w / 2;
  const top = cy - h / 2;
  const cornerRadius = h / 2; // pill shape

  const color = indicatorState === 'matched'
    ? tokens.meterBorderMatch
    : indicatorState === 'mismatched'
      ? tokens.meterBorderMismatch
      : tokens.meterBorder;

  ctx.save();

  // Glow for active states
  if (indicatorState !== 'neutral') {
    ctx.shadowBlur = 10;
    ctx.shadowColor = color;
  }

  // Bezel ring
  ctx.beginPath();
  ctx.roundRect(
    left - INDICATOR_BEZEL, top - INDICATOR_BEZEL,
    w + INDICATOR_BEZEL * 2, h + INDICATOR_BEZEL * 2,
    cornerRadius + INDICATOR_BEZEL,
  );
  ctx.fillStyle = '#1a1a1e';
  ctx.fill();

  // Lens: linear gradient (lighter center → full color at edges) for wide pill
  const grad = ctx.createLinearGradient(cx, top, cx, top + h);
  grad.addColorStop(0, lerpColor(color, '#ffffff', 0.35));
  grad.addColorStop(0.4, lerpColor(color, '#ffffff', 0.2));
  grad.addColorStop(1, color);
  ctx.beginPath();
  ctx.roundRect(left, top, w, h, cornerRadius);
  ctx.fillStyle = grad;
  ctx.fill();

  // Specular highlight (thin bright line near top)
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(left, top, w, h, cornerRadius);
  ctx.clip();
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(left + w * 0.15, top + 1, w * 0.7, 2);
  ctx.restore();

  ctx.restore();
}

// --- Main draw function ---

/**
 * Draw the playback button bar (cassette-recorder transport style).
 * Dark tray with beige side panels + screws, 4 jet-black buttons between them.
 * Play button stays physically "depressed" while playing.
 */
export function drawPlaybackBar(
  ctx: CanvasRenderingContext2D,
  tokens: ThemeTokens,
  state: PlaybackBarRenderState,
  cellSize: number,
): void {
  ctx.save();

  const bar = getBarRect(cellSize);
  const isPlaying = state.playMode === 'playing';

  // 0. Indicator light (centered between viewport top and tray top)
  drawIndicatorLight(ctx, tokens, state.indicatorState, bar, state.viewportTopY);

  // 1. Tray: dark recessed channel behind buttons
  ctx.fillStyle = TRAY_BG;
  ctx.fillRect(bar.trayLeft, bar.top, bar.trayRight - bar.trayLeft, bar.height);

  // Tray inset shadow (gradient darkening at top)
  const trayShadow = ctx.createLinearGradient(0, bar.top, 0, bar.top + 10);
  trayShadow.addColorStop(0, 'rgba(0,0,0,0.8)');
  trayShadow.addColorStop(1, 'transparent');
  ctx.fillStyle = trayShadow;
  ctx.fillRect(bar.trayLeft, bar.top, bar.trayRight - bar.trayLeft, 10);

  // 2. Side panels (beige with rounded bottom corners)
  drawSidePanel(ctx, bar.left, bar.top, bar.sideWidth, bar.height, 'left');
  drawSidePanel(ctx, bar.right - bar.sideWidth, bar.top, bar.sideWidth, bar.height, 'right');

  // 3. Screws (centered in panels, aligned with button icon centers)
  const screwY = bar.top + BUTTON_TOP_INSET_PX + bar.height * BUTTON_HEIGHT_RATIO / 2;
  drawScrew(ctx, bar.left + bar.sideWidth / 2, screwY);
  drawScrew(ctx, bar.right - bar.sideWidth / 2, screwY);

  // 4. Buttons (4 jet-black keys between panels)
  const keyRects = getButtonKeyRects(cellSize);
  const buttons: PlaybackButton[] = ['prev', 'play', 'stop', 'next'];

  for (const btn of buttons) {
    const key = keyRects[btn];
    const isHovered = state.hoveredButton === btn;
    const isDisabled = (btn === 'prev' || btn === 'next') && isPlaying;
    const isPressed = state.pressedButton === btn && !isDisabled;
    const isDepressed = (btn === 'play' && isPlaying) || isPressed;

    const btnTop = isDepressed ? key.top + DEPRESSED_OFFSET_PX : key.top;

    // Button gradient fill
    const useHover = isHovered && !isDisabled && !isDepressed;
    const grad = ctx.createLinearGradient(0, btnTop, 0, btnTop + key.height);
    grad.addColorStop(0, useHover ? BTN_HOVER_TOP : BTN_REST_TOP);
    grad.addColorStop(0.6, useHover ? BTN_HOVER_MID : BTN_REST_MID);
    grad.addColorStop(1, useHover ? BTN_HOVER_BOT : BTN_REST_BOT);
    ctx.fillStyle = grad;
    ctx.fillRect(key.left, btnTop, key.width, key.height);

    // Top highlight (subtle light catch, not on depressed)
    if (!isDepressed) {
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(key.left, btnTop, key.width, 1);
    }

    // Depressed darkening overlay
    if (isDepressed) {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(key.left, btnTop, key.width, key.height);
    }

    // 5. Icon
    let color: string;
    if (isDisabled) {
      color = ICON_DISABLED;
    } else if (isDepressed) {
      color = ICON_ACTIVE;
    } else if (isHovered) {
      color = ICON_HOVER;
    } else {
      color = ICON_REST;
    }

    const iconCY = isDepressed ? key.centerY + DEPRESSED_OFFSET_PX : key.centerY;

    // Active glow (white shadow behind icon)
    const isPausedPlay = btn === 'play' && !isPlaying && !isPressed;
    if (isDepressed) {
      ctx.shadowBlur = 5;
      ctx.shadowColor = 'rgba(255,255,255,0.9)';
    } else if (isPausedPlay) {
      // Gentle pulsing glow when paused — period matches the 256-cycle sweep
      const pulse = (Math.sin(performance.now() / PULSE_PERIOD_MS * Math.PI * 2) + 1) / 2;
      ctx.shadowBlur = 2 + pulse * 4;
      ctx.shadowColor = `rgba(255,255,255,${(0.15 + pulse * 0.45).toFixed(2)})`;
      color = lerpColor(ICON_REST, ICON_ACTIVE, pulse * 0.5);
    }

    if (btn === 'prev') {
      drawPrevIcon(ctx, key.centerX, iconCY, ICON_SIZE_PX, color);
    } else if (btn === 'next') {
      drawNextIcon(ctx, key.centerX, iconCY, ICON_SIZE_PX, color);
    } else if (btn === 'play') {
      drawPlayIcon(ctx, key.centerX, iconCY, ICON_SIZE_PX, color);
    } else {
      drawStopIcon(ctx, key.centerX, iconCY, ICON_SIZE_PX, color);
    }

    // Clear glow
    if (isDepressed || isPausedPlay) {
      ctx.shadowBlur = 0;
      ctx.shadowColor = 'transparent';
    }
  }

  ctx.restore();
}

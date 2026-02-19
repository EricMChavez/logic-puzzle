import type { ChipState } from '../../shared/types/index.ts';
import type { ThemeTokens } from '../../shared/tokens/token-types.ts';
import type { RenderNodesState } from './render-types.ts';
import type { PixelRect } from '../../shared/grid/types.ts';
import { NODE_STYLE, NODE_TYPE_LABELS, HIGHLIGHT_STREAK } from '../../shared/constants/index.ts';
import { CARD_BODY_FONT } from '../../shared/fonts/font-ready.ts';
import { getKnobConfig } from '../../engine/nodes/framework.ts';
import { getChipDefinition } from '../../engine/nodes/registry.ts';
import { getNodePortPosition, getNodeBodyPixelRect, getPortPhysicalSide } from './port-positions.ts';
import { isConnectionPointNode } from '../../puzzle/connection-point-nodes.ts';
import { PUZZLE_MENU_GRID_ROWS } from '../../shared/grid/index.ts';
import { getDevOverrides } from '../../dev/index.ts';
import { drawKnob } from './render-knob.ts';
import { signalToColor, signalToGlow } from './render-wires.ts';
import { drawHighlightStreakRounded } from './render-highlight-streak.ts';

// ---------------------------------------------------------------------------
// Color utilities
// ---------------------------------------------------------------------------

type RGB = [number, number, number];

const _hexToRgbCache = new Map<string, RGB>();

function hexToRgb(hex: string): RGB {
  let cached = _hexToRgbCache.get(hex);
  if (cached) return cached;
  let h = hex.replace('#', '');
  if (h.length === 3) {
    h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  }
  cached = [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
  _hexToRgbCache.set(hex, cached);
  return cached;
}

function lerpColor(a: RGB, b: RGB, t: number): string {
  const r = Math.round(a[0] + (b[0] - a[0]) * t);
  const g = Math.round(a[1] + (b[1] - a[1]) * t);
  const bl = Math.round(a[2] + (b[2] - a[2]) * t);
  return `rgb(${r},${g},${bl})`;
}

const EMPTY_PORT_SIGNALS: ReadonlyMap<string, number> = new Map();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Compute the pixel rect for a node's body based on its grid position and size.
 * The body is offset by half a cell so ports sit on grid lines.
 */
export function getNodePixelRect(node: ChipState, cellSize: number): PixelRect {
  return getNodeBodyPixelRect(node, cellSize);
}

type NodeVisualState = 'default' | 'hover' | 'selected';

function getNodeVisualState(chipId: string, state: RenderNodesState): NodeVisualState {
  if (state.selectedChipId === chipId) return 'selected';
  if (state.hoveredChipId === chipId) return 'hover';
  return 'default';
}

function getParamDisplay(node: ChipState): string {
  const def = getChipDefinition(node.type);
  if (!def) return '';

  // Knob nodes show nothing — the visual knob suffices
  if (getKnobConfig(def)) return '';

  // Non-knob parameterized nodes: show first param value
  const firstParam = def.params?.[0];
  if (firstParam) {
    return String(node.params[firstParam.key] ?? firstParam.default);
  }

  return '';
}

// ---------------------------------------------------------------------------
// Socket / plug helpers
// ---------------------------------------------------------------------------

export type PortShape =
  | { type: 'plug' }
  | { type: 'socket'; openingDirection: 'left' | 'right' | 'top' | 'bottom'; connected?: boolean }
  | { type: 'seated'; openingDirection: 'left' | 'right' | 'top' | 'bottom' };

/** Map a physical side direction to the angle (in radians) for the C-shape gap center. */
function directionToAngle(dir: 'left' | 'right' | 'top' | 'bottom'): number {
  switch (dir) {
    case 'right': return 0;
    case 'bottom': return Math.PI / 2;
    case 'left': return Math.PI;
    case 'top': return -Math.PI / 2;
  }
}

// ---------------------------------------------------------------------------
// Draw functions
// ---------------------------------------------------------------------------

/** Draw all non-connection-point nodes with gradient fills, shadows, and visual states. */
export function drawNodes(
  ctx: CanvasRenderingContext2D,
  tokens: ThemeTokens,
  state: RenderNodesState,
  cellSize: number,
): void {
  // First pass: draw all node bodies + ports (default, hover states)
  for (const node of state.chips.values()) {
    if (isConnectionPointNode(node.id)) continue;
    drawNodeBody(ctx, tokens, state, node, cellSize);

    // Puzzle menu chips render port indicators from slot params instead of real ports
    if (node.params?.isPuzzleChip) {
      drawMenuChipPorts(ctx, tokens, node, cellSize);
    } else {
      const isLive = state.liveChipIds.has(node.id);
      drawNodePorts(ctx, tokens, node, cellSize, isLive ? state.portSignals : EMPTY_PORT_SIGNALS, state.connectedSocketPorts, state.connectedPlugPorts, isLive);
    }
  }

  // Second pass: draw selection highlight on top of all nodes
  if (state.selectedChipId) {
    const selectedNode = state.chips.get(state.selectedChipId);
    if (selectedNode && !isConnectionPointNode(selectedNode.id)) {
      drawSelectionHighlight(ctx, tokens, selectedNode, cellSize);
    }
  }
}

function drawNodeBody(
  ctx: CanvasRenderingContext2D,
  tokens: ThemeTokens,
  state: RenderNodesState,
  node: ChipState,
  cellSize: number,
): void {
  const rect = getNodePixelRect(node, cellSize);
  const devOverrides = getDevOverrides();
  const useOverrides = devOverrides.enabled;

  // Get style values (use dev overrides if enabled)
  const borderRadiusRatio = useOverrides ? devOverrides.nodeStyle.borderRadius : NODE_STYLE.BORDER_RADIUS_RATIO;
  const shadowBlurRatio = useOverrides ? devOverrides.nodeStyle.shadowBlur : NODE_STYLE.SHADOW_BLUR_RATIO;
  const shadowOffsetYRatio = useOverrides ? devOverrides.nodeStyle.shadowOffsetY : NODE_STYLE.SHADOW_OFFSET_Y_RATIO;
  const borderWidth = useOverrides ? devOverrides.nodeStyle.borderWidth : 0;
  const hoverBrightness = useOverrides ? devOverrides.nodeStyle.hoverBrightness : 0.15;
  const gradientIntensity = useOverrides ? devOverrides.nodeStyle.gradientIntensity : 1.0;

  const borderRadius = borderRadiusRatio * cellSize;
  const visualState = getNodeVisualState(node.id, state);

  // Get colors (use dev overrides if enabled)
  const surfaceNodeColor = useOverrides ? devOverrides.colors.surfaceNode : tokens.surfaceNode;
  const surfaceNodeBottomColor = useOverrides ? devOverrides.colors.surfaceNodeBottom : tokens.surfaceNodeBottom;

  // --- Drop shadow ---
  ctx.save();
  ctx.shadowColor = tokens.depthRaised;
  ctx.shadowBlur = shadowBlurRatio * cellSize;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = shadowOffsetYRatio * cellSize;

  // --- Gradient fill ---
  const grad = ctx.createLinearGradient(rect.x, rect.y, rect.x, rect.y + rect.height);
  let topColor = surfaceNodeColor;
  let bottomColor = surfaceNodeBottomColor;

  // Apply gradient intensity (darken bottom more for stronger gradient)
  if (gradientIntensity !== 1.0) {
    const bottomRgb = hexToRgb(surfaceNodeBottomColor);
    const darkenFactor = 1 - (0.2 * (gradientIntensity - 1.0));
    bottomColor = `rgb(${Math.round(bottomRgb[0] * darkenFactor)},${Math.round(bottomRgb[1] * darkenFactor)},${Math.round(bottomRgb[2] * darkenFactor)})`;
  }

  if (visualState === 'hover') {
    // Lerp both stops toward white for hover brightness
    const white: RGB = [255, 255, 255];
    topColor = lerpColor(hexToRgb(surfaceNodeColor), white, hoverBrightness);
    bottomColor = lerpColor(hexToRgb(surfaceNodeBottomColor), white, hoverBrightness);
  }

  grad.addColorStop(0, topColor);
  grad.addColorStop(1, bottomColor);
  ctx.fillStyle = grad;

  ctx.beginPath();
  ctx.roundRect(rect.x, rect.y, rect.width, rect.height, borderRadius);
  ctx.fill();
  ctx.restore(); // restore shadow state

  // --- Border ---
  ctx.strokeStyle = tokens.depthRaised;
  ctx.lineWidth = borderWidth;
  ctx.beginPath();
  ctx.roundRect(rect.x, rect.y, rect.width, rect.height, borderRadius);
  ctx.stroke();

  // --- Highlight streak ---
  const nodeHard = useOverrides ? devOverrides.highlightStyle.nodeHard : 0.06;
  const nodeSoft = useOverrides ? devOverrides.highlightStyle.nodeSoft : 0.0375;
  const fadeRatio = useOverrides ? devOverrides.highlightStyle.verticalFadeRatio : HIGHLIGHT_STREAK.VERTICAL_FADE_RATIO;
  drawHighlightStreakRounded(ctx, rect, borderRadius, nodeHard, nodeSoft, fadeRatio);

  // --- Light edge (warm highlight along top inner edge) ---
  const lightEdgeOpacity = useOverrides ? devOverrides.nodeStyle.lightEdgeOpacity : 0.3;
  if (lightEdgeOpacity > 0) {
    const warmTint = HIGHLIGHT_STREAK.WARM_TINT;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(rect.x, rect.y, rect.width, rect.height, borderRadius);
    ctx.clip();
    ctx.strokeStyle = `rgba(${warmTint.r},${warmTint.g},${warmTint.b},${lightEdgeOpacity})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(rect.x + borderRadius, rect.y + 0.5);
    ctx.lineTo(rect.x + rect.width - borderRadius, rect.y + 0.5);
    ctx.stroke();
    ctx.restore();
  }

  // --- Label (rotated with node, aligned with output port 0) ---
  const labelFontSize = Math.round(NODE_STYLE.LABEL_FONT_RATIO * cellSize);

  let label = NODE_TYPE_LABELS[node.type] ?? node.type;
  if (node.type === 'custom-blank') {
    label = 'Custom';
  } else if (node.type.startsWith('puzzle:')) {
    const puzzleId = node.type.slice('puzzle:'.length);
    const entry = state.craftedPuzzles.get(puzzleId);
    if (entry) label = entry.title;
  } else if (node.type.startsWith('utility:')) {
    const utilityId = node.type.slice('utility:'.length);
    const entry = state.craftedUtilities.get(utilityId);
    if (entry) label = entry.title;
  } else if (node.type.startsWith('menu:')) {
    const menuKey = node.type.slice('menu:'.length);
    label = (node.params.label as string) ?? menuKey;
  }
  label = label.toUpperCase();

  const paramText = getParamDisplay(node);
  const rotation = node.rotation ?? 0;
  const rotationRad = (rotation * Math.PI) / 180;

  // Calculate center of node body for rotation pivot
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;

  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.rotate(rotationRad);

  ctx.fillStyle = tokens.textPrimary;
  ctx.font = `bold ${labelFontSize}px ${CARD_BODY_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.letterSpacing = `${Math.round(cellSize * NODE_STYLE.LABEL_LETTER_SPACING_RATIO)}px`;

  // If the node has a knob, keep label at top (aligned with top port row).
  // Otherwise, center the label vertically in the node body.
  const def = getChipDefinition(node.type);
  const hasKnob = !!getKnobConfig(def);
  const labelOffsetY = hasKnob
    ? node.position.row * cellSize - centerY
    : 0;
  ctx.fillText(label, 0, labelOffsetY);

  ctx.letterSpacing = '0px';

  // --- Parameter sublabel ---
  if (paramText) {
    const paramFontSize = Math.round(NODE_STYLE.PARAM_FONT_RATIO * cellSize);
    ctx.fillStyle = tokens.textSecondary;
    ctx.font = `${paramFontSize}px ${NODE_STYLE.PARAM_FONT_FAMILY}`;
    ctx.fillText(paramText, 0, labelOffsetY + labelFontSize * 0.9);
  }

  ctx.restore();

  // --- Knob (mixer, amp, etc.) ---
  if (state.knobValues.has(node.id)) {
    const knobInfo = state.knobValues.get(node.id);
    if (knobInfo) {
      const knobRadius = 1 * cellSize;
      // Place knob below the label
      const knobY = centerY + labelFontSize * 0.5;
      const isRejected = state.rejectedKnobChipId === node.id;
      drawKnob(ctx, tokens, centerX, knobY, knobRadius, knobInfo.value, knobInfo.isWired, isRejected);
    }
  }

  // --- Portal border for custom/menu nodes (zoom transition target area) ---
  const isMenuNode = node.type.startsWith('menu:');
  const showPortal = !isMenuNode || !node.params.locked;
  if (showPortal && (node.type.startsWith('puzzle:') || node.type.startsWith('utility:') || node.type === 'custom-blank' || isMenuNode)) {
    const TARGET_ASPECT = 16 / 9;
    const targetW = rect.height * TARGET_ASPECT;
    const bodyCenter = rect.x + rect.width / 2;
    const targetLeft = bodyCenter - targetW / 2;
    const targetRight = bodyCenter + targetW / 2;

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(rect.x, rect.y, rect.width, rect.height, borderRadius);
    ctx.clip();
    ctx.fillStyle = '#000000';
    const portalBorderW = 2;
    if (targetLeft > rect.x) {
      ctx.fillRect(targetLeft - portalBorderW / 2, rect.y, portalBorderW, rect.height);
    }
    if (targetRight < rect.x + rect.width) {
      ctx.fillRect(targetRight - portalBorderW / 2, rect.y, portalBorderW, rect.height);
    }
    ctx.restore();
  }

  // --- Modified indicator ---
  drawModifiedIndicator(ctx, tokens, state, node, rect);

  // --- Menu node locked overlay ---
  if (isMenuNode && node.params.locked) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(rect.x, rect.y, rect.width, rect.height, borderRadius);
    ctx.clip();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    ctx.restore();
  }

}

function drawModifiedIndicator(
  ctx: CanvasRenderingContext2D,
  tokens: ThemeTokens,
  state: RenderNodesState,
  node: ChipState,
  rect: PixelRect,
): void {
  if (!node.libraryVersionHash) return;

  let currentHash: string | undefined;
  if (node.type.startsWith('puzzle:')) {
    const puzzleId = node.type.slice('puzzle:'.length);
    currentHash = state.craftedPuzzles.get(puzzleId)?.versionHash;
  } else if (node.type.startsWith('utility:')) {
    const utilityId = node.type.slice('utility:'.length);
    currentHash = state.craftedUtilities.get(utilityId)?.versionHash;
  }
  if (currentHash && currentHash !== node.libraryVersionHash) {
    ctx.fillStyle = tokens.colorNeutral;
    ctx.beginPath();
    ctx.arc(rect.x + rect.width - 4, rect.y + 4, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawNodePorts(
  ctx: CanvasRenderingContext2D,
  tokens: ThemeTokens,
  node: ChipState,
  cellSize: number,
  portSignals: ReadonlyMap<string, number>,
  connectedSocketPorts: ReadonlySet<string>,
  connectedPlugPorts: ReadonlySet<string>,
  isLive: boolean,
): void {
  const devOverrides = getDevOverrides();
  const useOverrides = devOverrides.enabled;
  const portRadiusRatio = useOverrides ? devOverrides.nodeStyle.portRadius : NODE_STYLE.PORT_RADIUS_RATIO;
  const portRadius = portRadiusRatio * cellSize;
  // When the node is not live (no upstream signal), use colorNeutral so ports
  // match the neutral wire color instead of showing signalZero gray.
  const colorOverride = isLive ? undefined : tokens.colorNeutral;

  for (let i = 0; i < node.socketCount; i++) {
    const pos = getNodePortPosition(node, 'input', i, cellSize);
    const signalValue = portSignals.get(`${node.id}:socket:${i}`) ?? 0;

    // Unconnected socket ports show as sockets; connected sockets show as plugs
    const isConnected = connectedSocketPorts.has(`${node.id}:${i}`);
    let shape: PortShape;
    const physicalSide = getPortPhysicalSide(node, 'input', i);
    if (!isConnected) {
      shape = { type: 'socket', openingDirection: physicalSide };
    } else {
      shape = { type: 'seated', openingDirection: physicalSide };
    }

    drawPort(ctx, tokens, pos.x, pos.y, portRadius, signalValue, shape, colorOverride);
  }

  for (let i = 0; i < node.plugCount; i++) {
    const pos = getNodePortPosition(node, 'output', i, cellSize);
    const signalValue = portSignals.get(`${node.id}:plug:${i}`) ?? 0;

    // Connected plug ports show as sockets (plug has been "sent" along path)
    const isOutputConnected = connectedPlugPorts.has(`${node.id}:${i}`);
    if (isOutputConnected) {
      const physicalSide = getPortPhysicalSide(node, 'output', i);
      drawPort(ctx, tokens, pos.x, pos.y, portRadius, signalValue, { type: 'socket', openingDirection: physicalSide, connected: true }, colorOverride);
    } else {
      drawPort(ctx, tokens, pos.x, pos.y, portRadius, signalValue, { type: 'plug' }, colorOverride);
    }
  }
}

/**
 * Draw port indicators on a puzzle menu chip based on its slot params.
 * Slot params are stored as slot0..slot5: 0=inactive, 1=active input, 2=active output.
 * Input slots render as sockets, output slots render as plugs.
 * 3 positions per side (slots 0-2 left, 3-5 right), spaced evenly within the 6x4 body.
 */
function drawMenuChipPorts(
  ctx: CanvasRenderingContext2D,
  tokens: ThemeTokens,
  node: ChipState,
  cellSize: number,
): void {
  const portRadius = NODE_STYLE.PORT_RADIUS_RATIO * cellSize;
  const chipCols = 6; // PUZZLE_MENU_GRID_COLS
  const chipRows = PUZZLE_MENU_GRID_ROWS;

  for (let i = 0; i < 6; i++) {
    const slotVal = node.params[`slot${i}`] as number;
    if (!slotVal) continue; // 0 or undefined = inactive

    const isLeft = i < 3;
    const perSideIdx = isLeft ? i : i - 3;

    // Port position: edge of chip body, evenly spaced vertically
    const x = isLeft
      ? node.position.col * cellSize
      : (node.position.col + chipCols) * cellSize;
    const y = (node.position.row + Math.floor(perSideIdx * chipRows / 3)) * cellSize;

    if (slotVal === 1) {
      // Input ports show as sockets
      const openDir = isLeft ? 'left' : 'right';
      drawPort(ctx, tokens, x, y, portRadius, 0, { type: 'socket', openingDirection: openDir });
    } else {
      // Output ports show as sockets (edge CP draws the seated plug on top)
      const openDir = isLeft ? 'left' : 'right';
      drawPort(ctx, tokens, x, y, portRadius, 0, { type: 'socket', openingDirection: openDir, connected: true });
    }
  }
}

export function drawPort(
  ctx: CanvasRenderingContext2D,
  tokens: ThemeTokens,
  x: number,
  y: number,
  radius: number,
  signalValue: number,
  shape: PortShape = { type: 'plug' },
  colorOverride?: string,
): void {
  const color = colorOverride ?? signalToColor(signalValue, tokens);
  const glow = colorOverride ? 0 : signalToGlow(signalValue);

  if (shape.type === 'socket') {
    // Half-circle divot cut into the node body — dark recessed socket
    const gapCenter = directionToAngle(shape.openingDirection);
    const startAngle = gapCenter + Math.PI / 2;
    const endAngle = gapCenter - Math.PI / 2;

    ctx.beginPath();
    ctx.arc(x, y, radius, startAngle, endAngle, false);
    ctx.closePath();
    ctx.fillStyle = tokens.depthSunken;
    ctx.fill();

    ctx.strokeStyle = tokens.depthRaised;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Wire stub only when connected — draw signal-colored line through the opening
    // so the wire appears to exit through the C-shape gap, not behind the body
    if (shape.connected) {
      const wireWidth = Number(tokens.wireWidthBase) || 6;
      ctx.strokeStyle = color;
      ctx.lineWidth = wireWidth;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(gapCenter) * radius, y + Math.sin(gapCenter) * radius);
      ctx.stroke();
    }
  } else if (shape.type === 'seated') {
    // Socket with same-size plug seated inside
    const gapCenter = directionToAngle(shape.openingDirection);
    const startAngle = gapCenter + Math.PI / 2;
    const endAngle = gapCenter - Math.PI / 2;

    // Glow ring drawn FIRST — the socket shell then covers it on the closed side,
    // leaving the glow visible only on the opening side (natural occlusion, no cutoff).
    if (glow > 0) {
      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = glow;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, radius + 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Draw socket shell (covers glow ring on the closed side)
    ctx.beginPath();
    ctx.arc(x, y, radius, startAngle, endAngle, false);
    ctx.closePath();
    ctx.fillStyle = tokens.depthSunken;
    ctx.fill();

    ctx.strokeStyle = tokens.depthRaised;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Draw signal-colored plug filling the socket
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Standard filled circle (plug) — glow as full circle
    if (glow > 0) {
      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = glow;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, radius + 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    ctx.fillStyle = color;
    ctx.strokeStyle = tokens.depthRaised;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

/** Draw a single chip (body + ports) without selection highlight. Used by ghost preview. */
export function drawSingleNode(
  ctx: CanvasRenderingContext2D,
  tokens: ThemeTokens,
  node: ChipState,
  state: RenderNodesState,
  cellSize: number,
): void {
  drawNodeBody(ctx, tokens, state, node, cellSize);
  drawNodePorts(ctx, tokens, node, cellSize, state.portSignals, state.connectedSocketPorts, state.connectedPlugPorts, true);
}

function drawSelectionHighlight(
  ctx: CanvasRenderingContext2D,
  tokens: ThemeTokens,
  node: ChipState,
  cellSize: number,
): void {
  const rect = getNodePixelRect(node, cellSize);
  const borderRadius = NODE_STYLE.BORDER_RADIUS_RATIO * cellSize;
  const pad = NODE_STYLE.SELECTION_PAD;

  ctx.strokeStyle = tokens.colorSelection;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.roundRect(
    rect.x - pad,
    rect.y - pad,
    rect.width + pad * 2,
    rect.height + pad * 2,
    borderRadius + pad,
  );
  ctx.stroke();
}

import type { NodeState } from '../../shared/types/index.ts';
import type { ThemeTokens } from '../../shared/tokens/token-types.ts';
import type { RenderNodesState } from './render-types.ts';
import type { PixelRect } from '../../shared/grid/types.ts';
import { NODE_STYLE, NODE_TYPE_LABELS, KNOB_NODES } from '../../shared/constants/index.ts';
import { getNodePortPosition, getNodeBodyPixelRect } from './port-positions.ts';
import { isConnectionPointNode } from '../../puzzle/connection-point-nodes.ts';
import { gridToPixel, getNodeGridSize } from '../../shared/grid/index.ts';
import { getDevOverrides } from '../../dev/index.ts';
import { drawKnob } from './render-knob.ts';
import { signalToColor, signalToGlow } from './render-wires.ts';

// ---------------------------------------------------------------------------
// Color utilities
// ---------------------------------------------------------------------------

type RGB = [number, number, number];

function hexToRgb(hex: string): RGB {
  let h = hex.replace('#', '');
  if (h.length === 3) {
    h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  }
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function lerpColor(a: RGB, b: RGB, t: number): string {
  const r = Math.round(a[0] + (b[0] - a[0]) * t);
  const g = Math.round(a[1] + (b[1] - a[1]) * t);
  const bl = Math.round(a[2] + (b[2] - a[2]) * t);
  return `rgb(${r},${g},${bl})`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Compute the pixel rect for a node's body based on its grid position and size.
 * The body is offset by half a cell so ports sit on grid lines.
 */
export function getNodePixelRect(node: NodeState, cellSize: number): PixelRect {
  return getNodeBodyPixelRect(node, cellSize);
}

type NodeVisualState = 'default' | 'hover' | 'selected';

function getNodeVisualState(nodeId: string, state: RenderNodesState): NodeVisualState {
  if (state.selectedNodeId === nodeId) return 'selected';
  if (state.hoveredNodeId === nodeId) return 'hover';
  return 'default';
}

function getParamDisplay(node: NodeState): string {
  switch (node.type) {
    case 'mix':
      return String(node.params['mode'] ?? 'Add');
    case 'threshold':
      return `thr: ${node.params['threshold'] ?? 0}`;
    case 'delay':
      return `del: ${node.params['wts'] ?? 1} WTS`;
    case 'mixer':
    case 'amp':
    case 'diverter':
      return ''; // Knob renders the value visually
    default:
      return '';
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
  for (const node of state.nodes.values()) {
    if (isConnectionPointNode(node.id)) continue;
    drawNodeBody(ctx, tokens, state, node, cellSize);
    drawNodePorts(ctx, tokens, node, cellSize, state.portSignals);
  }

  // Second pass: draw selection highlight on top of all nodes
  if (state.selectedNodeId) {
    const selectedNode = state.nodes.get(state.selectedNodeId);
    if (selectedNode && !isConnectionPointNode(selectedNode.id)) {
      drawSelectionHighlight(ctx, tokens, selectedNode, cellSize);
    }
  }
}

function drawNodeBody(
  ctx: CanvasRenderingContext2D,
  tokens: ThemeTokens,
  state: RenderNodesState,
  node: NodeState,
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
  ctx.strokeStyle = visualState === 'selected' ? tokens.colorSelection : tokens.depthRaised;
  ctx.lineWidth = visualState === 'selected' ? 2.5 : borderWidth;
  ctx.beginPath();
  ctx.roundRect(rect.x, rect.y, rect.width, rect.height, borderRadius);
  ctx.stroke();

  // --- Label (rotated with node) ---
  const labelFontSize = Math.round(NODE_STYLE.LABEL_FONT_RATIO * cellSize);

  let label = NODE_TYPE_LABELS[node.type] ?? node.type;
  if (node.type === 'custom-blank') {
    label = 'Custom';
  } else if (node.type.startsWith('puzzle:')) {
    const puzzleId = node.type.slice('puzzle:'.length);
    const entry = state.puzzleNodes.get(puzzleId);
    if (entry) label = entry.title;
  } else if (node.type.startsWith('utility:')) {
    const utilityId = node.type.slice('utility:'.length);
    const entry = state.utilityNodes.get(utilityId);
    if (entry) label = entry.title;
  }

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
  ctx.font = `${labelFontSize}px ${NODE_STYLE.LABEL_FONT_FAMILY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Offset label up if there's a param sublabel or knob (relative to rotated center)
  const hasKnob = node.type in KNOB_NODES;
  const labelOffsetY = hasKnob ? -cellSize * 0.7 : paramText ? -labelFontSize * 0.4 : 0;
  ctx.fillText(label, 0, labelOffsetY);

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
      const knobRadius = 0.55 * cellSize;
      // Place knob below the label
      const knobY = centerY + labelFontSize * 0.5;
      const isRejected = state.rejectedKnobNodeId === node.id;
      drawKnob(ctx, tokens, centerX, knobY, knobRadius, knobInfo.value, knobInfo.isWired, isRejected);
    }
  }

  // --- Modified indicator ---
  drawModifiedIndicator(ctx, tokens, state, node, rect);
}

function drawModifiedIndicator(
  ctx: CanvasRenderingContext2D,
  tokens: ThemeTokens,
  state: RenderNodesState,
  node: NodeState,
  rect: PixelRect,
): void {
  if (!node.libraryVersionHash) return;

  let currentHash: string | undefined;
  if (node.type.startsWith('puzzle:')) {
    const puzzleId = node.type.slice('puzzle:'.length);
    currentHash = state.puzzleNodes.get(puzzleId)?.versionHash;
  } else if (node.type.startsWith('utility:')) {
    const utilityId = node.type.slice('utility:'.length);
    currentHash = state.utilityNodes.get(utilityId)?.versionHash;
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
  node: NodeState,
  cellSize: number,
  portSignals: ReadonlyMap<string, number>,
): void {
  const devOverrides = getDevOverrides();
  const useOverrides = devOverrides.enabled;
  const portRadiusRatio = useOverrides ? devOverrides.nodeStyle.portRadius : NODE_STYLE.PORT_RADIUS_RATIO;
  const portRadius = portRadiusRatio * cellSize;

  for (let i = 0; i < node.inputCount; i++) {
    const pos = getNodePortPosition(node, 'input', i, cellSize);
    const signalValue = portSignals.get(`${node.id}:input:${i}`) ?? 0;
    drawPort(ctx, tokens, pos.x, pos.y, portRadius, signalValue);
  }

  for (let i = 0; i < node.outputCount; i++) {
    const pos = getNodePortPosition(node, 'output', i, cellSize);
    const signalValue = portSignals.get(`${node.id}:output:${i}`) ?? 0;
    drawPort(ctx, tokens, pos.x, pos.y, portRadius, signalValue);
  }
}

function drawPort(
  ctx: CanvasRenderingContext2D,
  tokens: ThemeTokens,
  x: number,
  y: number,
  radius: number,
  signalValue: number,
): void {
  const color = signalToColor(signalValue, tokens);
  const glow = signalToGlow(signalValue);

  // Glow for strong signals (mirrors wire glow behavior)
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

function drawSelectionHighlight(
  ctx: CanvasRenderingContext2D,
  tokens: ThemeTokens,
  node: NodeState,
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

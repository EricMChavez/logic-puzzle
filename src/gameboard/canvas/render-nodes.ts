import type { NodeState } from '../../shared/types/index.ts';
import { NODE_CONFIG, COLORS, NODE_TYPE_LABELS } from '../../shared/constants/index.ts';
import { getNodePortPosition } from './port-positions.ts';
import { isConnectionPointNode } from '../../puzzle/connection-point-nodes.ts';

/** Draw all nodes on the canvas. */
export function renderNodes(
  ctx: CanvasRenderingContext2D,
  nodes: ReadonlyMap<string, NodeState>,
): void {
  for (const node of nodes.values()) {
    // Virtual CP nodes are drawn as connection point circles, not node boxes
    if (isConnectionPointNode(node.id)) continue;
    drawNodeBody(ctx, node);
    drawNodePorts(ctx, node);
  }
}

function drawNodeBody(ctx: CanvasRenderingContext2D, node: NodeState): void {
  const { x, y } = node.position;
  const { WIDTH, HEIGHT, BORDER_RADIUS } = NODE_CONFIG;

  // Body
  ctx.fillStyle = COLORS.NODE_FILL;
  ctx.strokeStyle = COLORS.NODE_STROKE;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x, y, WIDTH, HEIGHT, BORDER_RADIUS);
  ctx.fill();
  ctx.stroke();

  // Label
  ctx.fillStyle = COLORS.NODE_LABEL;
  ctx.font = NODE_CONFIG.LABEL_FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const label = NODE_TYPE_LABELS[node.type] ?? node.type;
  ctx.fillText(label, x + WIDTH / 2, y + HEIGHT / 2 - 7);

  // Parameter hint
  const paramText = getParamDisplay(node);
  if (paramText) {
    ctx.fillStyle = COLORS.NODE_PARAM;
    ctx.font = NODE_CONFIG.PARAM_FONT;
    ctx.fillText(paramText, x + WIDTH / 2, y + HEIGHT / 2 + 10);
  }
}

function drawNodePorts(ctx: CanvasRenderingContext2D, node: NodeState): void {
  const { PORT_RADIUS } = NODE_CONFIG;

  for (let i = 0; i < node.inputCount; i++) {
    const pos = getNodePortPosition(node, 'input', i);
    drawPort(ctx, pos.x, pos.y, PORT_RADIUS);
  }

  for (let i = 0; i < node.outputCount; i++) {
    const pos = getNodePortPosition(node, 'output', i);
    drawPort(ctx, pos.x, pos.y, PORT_RADIUS);
  }
}

function drawPort(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
): void {
  ctx.fillStyle = COLORS.PORT_FILL;
  ctx.strokeStyle = COLORS.PORT_STROKE;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

/** Draw a selection highlight around a node. */
export function renderSelectionHighlight(
  ctx: CanvasRenderingContext2D,
  node: NodeState,
): void {
  const { x, y } = node.position;
  const { WIDTH, HEIGHT, BORDER_RADIUS } = NODE_CONFIG;
  const pad = 3;
  ctx.strokeStyle = '#5a9bf5';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.roundRect(x - pad, y - pad, WIDTH + pad * 2, HEIGHT + pad * 2, BORDER_RADIUS + pad);
  ctx.stroke();
}

function getParamDisplay(node: NodeState): string {
  switch (node.type) {
    case 'mix':
      return String(node.params['mode'] ?? 'Add');
    case 'threshold':
      return `thr: ${node.params['threshold'] ?? 0}`;
    case 'delay':
      return `del: ${node.params['subdivisions'] ?? 0}`;
    default:
      return '';
  }
}

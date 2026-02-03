import type { NodeState, Wire, Vec2 } from '../../shared/types/index.ts';
import { COLORS } from '../../shared/constants/index.ts';
import { getNodePortPosition, getConnectionPointPosition } from './port-positions.ts';
import { isConnectionPointNode, isConnectionInputNode, getConnectionPointIndex } from '../../puzzle/connection-point-nodes.ts';

/** Compute bezier control points for a wire between two positions. */
function getWireBezierCP(from: Vec2, to: Vec2): { cp1: Vec2; cp2: Vec2 } {
  const dx = Math.abs(to.x - from.x);
  const cpOffset = Math.max(dx * 0.4, 30);
  return {
    cp1: { x: from.x + cpOffset, y: from.y },
    cp2: { x: to.x - cpOffset, y: to.y },
  };
}

/**
 * Evaluate a cubic bezier curve at parameter t (0–1).
 * B(t) = (1-t)^3*P0 + 3(1-t)^2*t*P1 + 3(1-t)*t^2*P2 + t^3*P3
 */
function cubicBezier(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number): Vec2 {
  const u = 1 - t;
  const uu = u * u;
  const uuu = uu * u;
  const tt = t * t;
  const ttt = tt * t;
  return {
    x: uuu * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + ttt * p3.x,
    y: uuu * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + ttt * p3.y,
  };
}

/**
 * Resolve the canvas position of a port on a wire endpoint.
 * For virtual CP nodes, uses getConnectionPointPosition.
 * For normal nodes, uses getNodePortPosition.
 */
function resolvePortPosition(
  nodeId: string,
  side: 'input' | 'output',
  portIndex: number,
  nodes: ReadonlyMap<string, NodeState>,
  canvasWidth: number,
  canvasHeight: number,
): Vec2 | null {
  if (isConnectionPointNode(nodeId)) {
    const cpIndex = getConnectionPointIndex(nodeId);
    const cpSide = isConnectionInputNode(nodeId) ? 'input' : 'output';
    return getConnectionPointPosition(cpSide, cpIndex, canvasWidth, canvasHeight);
  }
  const node = nodes.get(nodeId);
  if (!node) return null;
  return getNodePortPosition(node, side, portIndex);
}

/** Draw all wires on the canvas. */
export function renderWires(
  ctx: CanvasRenderingContext2D,
  wires: ReadonlyArray<Wire>,
  nodes: ReadonlyMap<string, NodeState>,
  canvasWidth: number,
  canvasHeight: number,
): void {
  for (const wire of wires) {
    const from = resolvePortPosition(wire.from.nodeId, 'output', wire.from.portIndex, nodes, canvasWidth, canvasHeight);
    const to = resolvePortPosition(wire.to.nodeId, 'input', wire.to.portIndex, nodes, canvasWidth, canvasHeight);
    if (!from || !to) continue;

    drawWire(ctx, from, to);
    drawWireSignals(ctx, from, to, wire);
  }
}

function drawWire(
  ctx: CanvasRenderingContext2D,
  from: Vec2,
  to: Vec2,
): void {
  ctx.strokeStyle = COLORS.WIRE;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);

  const { cp1, cp2 } = getWireBezierCP(from, to);
  ctx.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, to.x, to.y);
  ctx.stroke();
}

function drawWireSignals(
  ctx: CanvasRenderingContext2D,
  from: Vec2,
  to: Vec2,
  wire: Wire,
): void {
  if (wire.signals.length === 0 || wire.wtsDelay === 0) return;

  const { cp1, cp2 } = getWireBezierCP(from, to);

  for (const signal of wire.signals) {
    // Progress: 0 = just emitted, 1 = arrived
    const progress = 1 - signal.ticksRemaining / wire.wtsDelay;
    const t = Math.max(0, Math.min(1, progress));

    // Interpolate along the actual cubic bezier curve
    const pos = cubicBezier(from, cp1, cp2, to, t);

    // Scale dot radius and opacity by signal magnitude
    const magnitude = Math.abs(signal.value) / 100;
    const radius = 3 + magnitude * 3; // 3–6px
    const alpha = 0.5 + magnitude * 0.5; // 0.5–1.0

    // Color: green for positive, red-ish for negative
    ctx.fillStyle = signal.value >= 0 ? COLORS.WIRE_SIGNAL : '#e07050';
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

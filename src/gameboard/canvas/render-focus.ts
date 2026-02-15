/**
 * Render keyboard focus indicators on the canvas.
 *
 * Draws dashed outlines around the currently focused element
 * (node, port, connection point, or wire). During keyboard-wiring
 * mode, highlights valid targets and draws a preview line to the
 * active target.
 */

import type { ThemeTokens } from '../../shared/tokens/token-types.ts';
import type { KeyboardFocusTarget } from '../interaction/keyboard-focus.ts';
import type { NodeState, Wire, PortRef } from '../../shared/types/index.ts';
import { getNodePixelRect } from './render-nodes.ts';
import { getNodePortPosition, getConnectionPointPosition } from './port-positions.ts';
import { NODE_STYLE, CONNECTION_POINT_CONFIG } from '../../shared/constants/index.ts';
import { renderWirePreview } from './render-wire-preview.ts';
import type { SlotConfig } from '../../puzzle/types.ts';
import { slotSide, slotPerSideIndex } from '../../shared/grid/slot-helpers.ts';

export interface KeyboardWiringState {
  fromPort: PortRef;
  validTargets: PortRef[];
  targetIndex: number;
}

export function drawKeyboardFocus(
  ctx: CanvasRenderingContext2D,
  tokens: ThemeTokens,
  focusTarget: KeyboardFocusTarget | null,
  focusVisible: boolean,
  nodes: ReadonlyMap<string, NodeState>,
  wires: ReadonlyArray<Wire>,
  canvasW: number,
  canvasH: number,
  cellSize: number,
  wiringState: KeyboardWiringState | null,
  slotConfig?: SlotConfig,
): void {
  if (!focusVisible || !focusTarget) return;

  ctx.save();

  switch (focusTarget.type) {
    case 'node': {
      const node = nodes.get(focusTarget.chipId);
      if (!node) break;
      drawNodeFocusRing(ctx, tokens, node, cellSize);
      break;
    }
    case 'port': {
      const node = nodes.get(focusTarget.portRef.chipId);
      if (!node) break;
      const pos = getNodePortPosition(node, focusTarget.portRef.side, focusTarget.portRef.portIndex, cellSize);
      const portRadius = NODE_STYLE.PORT_RADIUS_RATIO * cellSize;
      drawCircleFocusRing(ctx, tokens, pos.x, pos.y, portRadius + 4);
      break;
    }
    case 'connection-point': {
      const side = slotSide(focusTarget.slotIndex);
      const perSideIdx = slotPerSideIndex(focusTarget.slotIndex);
      const pos = getConnectionPointPosition(side, perSideIdx, cellSize);
      drawCircleFocusRing(ctx, tokens, pos.x, pos.y, CONNECTION_POINT_CONFIG.RADIUS + 4);
      break;
    }
    case 'wire': {
      const wire = wires.find((w) => w.id === focusTarget.wireId);
      if (!wire || wire.route.length === 0) break;
      drawWireFocusRing(ctx, tokens, wire, cellSize);
      break;
    }
  }

  // Wiring target highlights
  if (wiringState && wiringState.validTargets.length > 0) {
    drawWiringTargetHighlights(ctx, tokens, wiringState, nodes, canvasW, canvasH, cellSize);
  }

  ctx.restore();
}

function drawNodeFocusRing(
  ctx: CanvasRenderingContext2D,
  tokens: ThemeTokens,
  node: NodeState,
  cellSize: number,
): void {
  const rect = getNodePixelRect(node, cellSize);
  const pad = 5;
  const borderRadius = NODE_STYLE.BORDER_RADIUS_RATIO * cellSize + pad;

  ctx.strokeStyle = tokens.colorSelection;
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.roundRect(rect.x - pad, rect.y - pad, rect.width + pad * 2, rect.height + pad * 2, borderRadius);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawCircleFocusRing(
  ctx: CanvasRenderingContext2D,
  tokens: ThemeTokens,
  x: number,
  y: number,
  radius: number,
): void {
  ctx.strokeStyle = tokens.colorSelection;
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawWireFocusRing(
  ctx: CanvasRenderingContext2D,
  tokens: ThemeTokens,
  wire: Wire,
  cellSize: number,
): void {
  const pts = wire.route.map((gp) => ({
    x: gp.col * cellSize + cellSize / 2,
    y: gp.row * cellSize + cellSize / 2,
  }));

  ctx.strokeStyle = tokens.colorSelection;
  ctx.lineWidth = 3;
  ctx.setLineDash([4, 3]);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) {
    ctx.lineTo(pts[i].x, pts[i].y);
  }
  ctx.stroke();
  ctx.setLineDash([]);
}

// findCpPhysicalPosition removed — slot index directly derives side via slotSide()/slotPerSideIndex()

function drawWiringTargetHighlights(
  ctx: CanvasRenderingContext2D,
  tokens: ThemeTokens,
  wiringState: KeyboardWiringState,
  nodes: ReadonlyMap<string, NodeState>,
  _canvasW: number,
  _canvasH: number,
  cellSize: number,
): void {
  const portRadius = NODE_STYLE.PORT_RADIUS_RATIO * cellSize;

  // Get source position for wire preview
  const sourceNode = nodes.get(wiringState.fromPort.chipId);
  let sourcePos = { x: 0, y: 0 };
  if (sourceNode) {
    sourcePos = getNodePortPosition(
      sourceNode,
      wiringState.fromPort.side,
      wiringState.fromPort.portIndex,
      cellSize,
    );
  }

  for (let i = 0; i < wiringState.validTargets.length; i++) {
    const target = wiringState.validTargets[i];
    const isActive = i === wiringState.targetIndex;
    const targetNode = nodes.get(target.chipId);
    if (!targetNode) continue;

    const pos = getNodePortPosition(targetNode, target.side, target.portIndex, cellSize);

    // Draw highlight ring
    ctx.save();
    ctx.globalAlpha = isActive ? 1.0 : 0.3;
    ctx.strokeStyle = tokens.colorSelection;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, portRadius + 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // Draw wire preview line from source to active target
    if (isActive) {
      ctx.save();
      renderWirePreview(ctx, tokens, sourcePos, pos);
      ctx.restore();
    }
  }
}

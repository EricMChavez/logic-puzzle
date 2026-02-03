import type { NodeId, NodeState, PortRef, Vec2 } from '../../shared/types/index.ts';
import { NODE_CONFIG, CONNECTION_POINT_CONFIG } from '../../shared/constants/index.ts';
import { getNodePortPosition, getConnectionPointPosition } from './port-positions.ts';
import { isConnectionPointNode } from '../../puzzle/connection-point-nodes.ts';

export type HitResult =
  | { type: 'port'; portRef: PortRef; position: Vec2 }
  | { type: 'connection-point'; side: 'input' | 'output'; index: number; position: Vec2 }
  | { type: 'node'; nodeId: NodeId }
  | { type: 'empty' };

const PORT_HIT_RADIUS = 12;
const CP_HIT_RADIUS = 14;

function dist(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Hit test at canvas coordinate (x, y).
 * Priority: ports > connection points > node body > empty.
 */
export function hitTest(
  x: number,
  y: number,
  nodes: ReadonlyMap<NodeId, NodeState>,
  canvasWidth: number,
  canvasHeight: number,
): HitResult {
  // 1. Check node ports (highest priority — skip virtual CP nodes)
  for (const node of nodes.values()) {
    if (isConnectionPointNode(node.id)) continue;
    for (let i = 0; i < node.outputCount; i++) {
      const pos = getNodePortPosition(node, 'output', i);
      if (dist(x, y, pos.x, pos.y) <= PORT_HIT_RADIUS) {
        return {
          type: 'port',
          portRef: { nodeId: node.id, portIndex: i, side: 'output' },
          position: pos,
        };
      }
    }
    for (let i = 0; i < node.inputCount; i++) {
      const pos = getNodePortPosition(node, 'input', i);
      if (dist(x, y, pos.x, pos.y) <= PORT_HIT_RADIUS) {
        return {
          type: 'port',
          portRef: { nodeId: node.id, portIndex: i, side: 'input' },
          position: pos,
        };
      }
    }
  }

  // 2. Check connection points
  for (let i = 0; i < CONNECTION_POINT_CONFIG.INPUT_COUNT; i++) {
    const pos = getConnectionPointPosition('input', i, canvasWidth, canvasHeight);
    if (dist(x, y, pos.x, pos.y) <= CP_HIT_RADIUS) {
      return { type: 'connection-point', side: 'input', index: i, position: pos };
    }
  }
  for (let i = 0; i < CONNECTION_POINT_CONFIG.OUTPUT_COUNT; i++) {
    const pos = getConnectionPointPosition('output', i, canvasWidth, canvasHeight);
    if (dist(x, y, pos.x, pos.y) <= CP_HIT_RADIUS) {
      return { type: 'connection-point', side: 'output', index: i, position: pos };
    }
  }

  // 3. Check node bodies
  const entries = Array.from(nodes.entries()).reverse();
  for (const [id, node] of entries) {
    if (
      x >= node.position.x &&
      x <= node.position.x + NODE_CONFIG.WIDTH &&
      y >= node.position.y &&
      y <= node.position.y + NODE_CONFIG.HEIGHT
    ) {
      return { type: 'node', nodeId: id };
    }
  }

  return { type: 'empty' };
}

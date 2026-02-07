/**
 * Keyboard focus tracking for canvas-based keyboard navigation.
 * Module-level singleton (same pattern as theme-manager.ts).
 */

import type { PortRef, NodeState, Wire } from '../../shared/types/index.ts';
import type { PuzzleDefinition } from '../../puzzle/types.ts';
import { isConnectionPointNode } from '../../puzzle/connection-point-nodes.ts';
import { CONNECTION_POINT_CONFIG } from '../../shared/constants/index.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type KeyboardFocusTarget =
  | { type: 'node'; nodeId: string }
  | { type: 'port'; portRef: PortRef }
  | { type: 'connection-point'; side: 'input' | 'output'; index: number }
  | { type: 'wire'; wireId: string };

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let focusTarget: KeyboardFocusTarget | null = null;
let focusVisible = false;

// ---------------------------------------------------------------------------
// Accessors
// ---------------------------------------------------------------------------

export function getFocusTarget(): KeyboardFocusTarget | null {
  return focusTarget;
}

export function setFocusTarget(target: KeyboardFocusTarget | null): void {
  focusTarget = target;
}

export function isFocusVisible(): boolean {
  return focusVisible;
}

export function setFocusVisible(visible: boolean): void {
  focusVisible = visible;
}

// ---------------------------------------------------------------------------
// Tab order computation
// ---------------------------------------------------------------------------

/**
 * Compute a deterministic Tab order for all focusable items on the gameboard.
 *
 * - Nodes sorted by (row, col), skipping connection-point virtual nodes
 * - When a node is the expanded node: splice its ports (input then output)
 *   and connected wires after it
 * - After all nodes: active connection points (inputs then outputs)
 */
export function computeTabOrder(
  nodes: ReadonlyMap<string, NodeState>,
  wires: ReadonlyArray<Wire>,
  expandedNodeId: string | null,
  activePuzzle: PuzzleDefinition | null,
): KeyboardFocusTarget[] {
  const order: KeyboardFocusTarget[] = [];

  // Sort real nodes by (row, col)
  const sortedNodes = Array.from(nodes.values())
    .filter((n) => !isConnectionPointNode(n.id))
    .sort((a, b) => a.position.row - b.position.row || a.position.col - b.position.col);

  for (const node of sortedNodes) {
    order.push({ type: 'node', nodeId: node.id });

    // If this is the expanded node, splice its ports and connected wires
    if (expandedNodeId === node.id) {
      // Input ports
      for (let i = 0; i < node.inputCount; i++) {
        order.push({ type: 'port', portRef: { nodeId: node.id, portIndex: i, side: 'input' } });
      }
      // Output ports
      for (let i = 0; i < node.outputCount; i++) {
        order.push({ type: 'port', portRef: { nodeId: node.id, portIndex: i, side: 'output' } });
      }
      // Wires connected to this node
      for (const wire of wires) {
        if (wire.source.nodeId === node.id || wire.target.nodeId === node.id) {
          order.push({ type: 'wire', wireId: wire.id });
        }
      }
    }
  }

  // Active connection points (inputs then outputs)
  if (activePuzzle) {
    for (let i = 0; i < Math.min(activePuzzle.activeInputs, CONNECTION_POINT_CONFIG.INPUT_COUNT); i++) {
      order.push({ type: 'connection-point', side: 'input', index: i });
    }
    for (let i = 0; i < Math.min(activePuzzle.activeOutputs, CONNECTION_POINT_CONFIG.OUTPUT_COUNT); i++) {
      order.push({ type: 'connection-point', side: 'output', index: i });
    }
  }

  return order;
}

// ---------------------------------------------------------------------------
// Valid wiring targets
// ---------------------------------------------------------------------------

/**
 * Compute valid wiring targets from a given port.
 * Returns all ports of opposite side, different node, not already connected to fromPort.
 * Includes connection-point virtual node ports.
 */
export function computeValidWiringTargets(
  fromPort: PortRef,
  nodes: ReadonlyMap<string, NodeState>,
  wires: ReadonlyArray<Wire>,
): PortRef[] {
  const targets: PortRef[] = [];
  const targetSide = fromPort.side === 'output' ? 'input' : 'output';

  // Build a set of already-connected port pairs
  const connectedPairs = new Set<string>();
  for (const wire of wires) {
    connectedPairs.add(`${wire.source.nodeId}:${wire.source.portIndex}:${wire.target.nodeId}:${wire.target.portIndex}`);
  }

  for (const node of nodes.values()) {
    if (node.id === fromPort.nodeId) continue;

    const portCount = targetSide === 'input' ? node.inputCount : node.outputCount;
    for (let i = 0; i < portCount; i++) {
      const candidate: PortRef = { nodeId: node.id, portIndex: i, side: targetSide };

      // Check if already connected
      const pairKey = fromPort.side === 'output'
        ? `${fromPort.nodeId}:${fromPort.portIndex}:${candidate.nodeId}:${candidate.portIndex}`
        : `${candidate.nodeId}:${candidate.portIndex}:${fromPort.nodeId}:${fromPort.portIndex}`;

      if (!connectedPairs.has(pairKey)) {
        targets.push(candidate);
      }
    }
  }

  return targets;
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

/**
 * Advance focus in the given direction.
 * direction: 1 = forward (Tab), -1 = backward (Shift+Tab)
 */
export function advanceFocus(
  direction: 1 | -1,
  nodes: ReadonlyMap<string, NodeState>,
  wires: ReadonlyArray<Wire>,
  expandedNodeId: string | null,
  activePuzzle: PuzzleDefinition | null,
): void {
  const order = computeTabOrder(nodes, wires, expandedNodeId, activePuzzle);
  if (order.length === 0) return;

  if (!focusTarget) {
    focusTarget = direction === 1 ? order[0] : order[order.length - 1];
    focusVisible = true;
    return;
  }

  const currentIndex = findFocusIndex(order, focusTarget);
  if (currentIndex === -1) {
    focusTarget = order[0];
    focusVisible = true;
    return;
  }

  const nextIndex = ((currentIndex + direction) % order.length + order.length) % order.length;
  focusTarget = order[nextIndex];
  focusVisible = true;
}

/**
 * Find the index of the current focus target in the tab order.
 */
function findFocusIndex(order: KeyboardFocusTarget[], target: KeyboardFocusTarget): number {
  return order.findIndex((item) => {
    if (item.type !== target.type) return false;
    switch (item.type) {
      case 'node':
        return item.nodeId === (target as { type: 'node'; nodeId: string }).nodeId;
      case 'port':
        return (
          item.portRef.nodeId === (target as { type: 'port'; portRef: PortRef }).portRef.nodeId &&
          item.portRef.portIndex === (target as { type: 'port'; portRef: PortRef }).portRef.portIndex &&
          item.portRef.side === (target as { type: 'port'; portRef: PortRef }).portRef.side
        );
      case 'connection-point':
        return (
          item.side === (target as { type: 'connection-point'; side: string; index: number }).side &&
          item.index === (target as { type: 'connection-point'; side: string; index: number }).index
        );
      case 'wire':
        return item.wireId === (target as { type: 'wire'; wireId: string }).wireId;
    }
  });
}

// ---------------------------------------------------------------------------
// Reset (for testing)
// ---------------------------------------------------------------------------

/** Reset module state (for testing only) */
export function _resetForTesting(): void {
  focusTarget = null;
  focusVisible = false;
}

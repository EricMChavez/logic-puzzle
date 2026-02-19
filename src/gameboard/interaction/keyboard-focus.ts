/**
 * Keyboard focus tracking for canvas-based keyboard navigation.
 * Module-level singleton (same pattern as theme-manager.ts).
 */

import type { PortRef, ChipState, Path } from '../../shared/types/index.ts';
import type { PuzzleDefinition, SlotConfig } from '../../puzzle/types.ts';
import { buildSlotConfig } from '../../puzzle/types.ts';
import { isConnectionPointNode } from '../../puzzle/connection-point-nodes.ts';
import { TOTAL_SLOTS } from '../../shared/grid/slot-helpers.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type KeyboardFocusTarget =
  | { type: 'node'; chipId: string }
  | { type: 'port'; portRef: PortRef }
  | { type: 'connection-point'; slotIndex: number }
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
  nodes: ReadonlyMap<string, ChipState>,
  wires: ReadonlyArray<Path>,
  expandedNodeId: string | null,
  activePuzzle: PuzzleDefinition | null,
): KeyboardFocusTarget[] {
  const order: KeyboardFocusTarget[] = [];

  // Sort real nodes by (row, col)
  const sortedNodes = Array.from(nodes.values())
    .filter((n) => !isConnectionPointNode(n.id))
    .sort((a, b) => a.position.row - b.position.row || a.position.col - b.position.col);

  for (const node of sortedNodes) {
    order.push({ type: 'node', chipId: node.id });

    // If this is the expanded node, splice its ports and connected wires
    if (expandedNodeId === node.id) {
      // Input ports
      for (let i = 0; i < node.socketCount; i++) {
        order.push({ type: 'port', portRef: { chipId: node.id, portIndex: i, side: 'socket' } });
      }
      // Output ports
      for (let i = 0; i < node.plugCount; i++) {
        order.push({ type: 'port', portRef: { chipId: node.id, portIndex: i, side: 'plug' } });
      }
      // Wires connected to this node
      for (const wire of wires) {
        if (wire.source.chipId === node.id || wire.target.chipId === node.id) {
          order.push({ type: 'wire', wireId: wire.id });
        }
      }
    }
  }

  // Active connection points (slots 0-5 in order)
  if (activePuzzle) {
    const config: SlotConfig = activePuzzle.slotConfig
      ?? buildSlotConfig(activePuzzle.activeInputs, activePuzzle.activeOutputs);

    for (let i = 0; i < TOTAL_SLOTS; i++) {
      if (config[i].active) {
        order.push({ type: 'connection-point', slotIndex: i });
      }
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
  nodes: ReadonlyMap<string, ChipState>,
  wires: ReadonlyArray<Path>,
): PortRef[] {
  const targets: PortRef[] = [];
  const targetSide: 'socket' | 'plug' = fromPort.side === 'plug' ? 'socket' : 'plug';

  // Build a set of occupied ports (each port can only have one path)
  const occupiedPorts = new Set<string>();
  for (const wire of wires) {
    occupiedPorts.add(`${wire.source.chipId}:${wire.source.portIndex}:plug`);
    occupiedPorts.add(`${wire.target.chipId}:${wire.target.portIndex}:socket`);
  }

  for (const node of nodes.values()) {
    if (node.id === fromPort.chipId) continue;

    const portCount = targetSide === 'socket' ? node.socketCount : node.plugCount;
    for (let i = 0; i < portCount; i++) {
      const candidate: PortRef = { chipId: node.id, portIndex: i, side: targetSide };

      // Skip if this port already has a wire
      if (occupiedPorts.has(`${candidate.chipId}:${candidate.portIndex}:${candidate.side}`)) continue;

      targets.push(candidate);
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
  nodes: ReadonlyMap<string, ChipState>,
  wires: ReadonlyArray<Path>,
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
        return item.chipId === (target as { type: 'node'; chipId: string }).chipId;
      case 'port':
        return (
          item.portRef.chipId === (target as { type: 'port'; portRef: PortRef }).portRef.chipId &&
          item.portRef.portIndex === (target as { type: 'port'; portRef: PortRef }).portRef.portIndex &&
          item.portRef.side === (target as { type: 'port'; portRef: PortRef }).portRef.side
        );
      case 'connection-point':
        return item.slotIndex === (target as { type: 'connection-point'; slotIndex: number }).slotIndex;
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

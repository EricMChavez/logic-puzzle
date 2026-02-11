/**
 * Pause-mode wire animation timing computation.
 *
 * When paused, signal "blips" travel along wires in topological evaluation order.
 * This module computes per-wire timing (depart/arrive phases) from the processing order.
 */

import type { NodeId, Wire } from '../../shared/types/index.ts';
import type { CycleResults } from '../../engine/evaluation/index.ts';
import { isConnectionPointNode } from '../../puzzle/connection-point-nodes.ts';

// =============================================================================
// Types
// =============================================================================

export interface WireBlipTiming {
  wireId: string;
  /** Phase (0-1) at which the blip departs the source end */
  departPhase: number;
  /** Phase (0-1) at which the blip arrives at the target end */
  arrivePhase: number;
  /** Signal value at the frozen playpoint */
  signalValue: number;
}

export interface WireAnimationCache {
  timings: ReadonlyMap<string, WireBlipTiming>;
}

// =============================================================================
// Computation
// =============================================================================

/**
 * Compute per-wire blip timing from cycle results and playpoint.
 *
 * Timing algorithm:
 * - CP source wires depart at phase 0
 * - Processing node source wires depart after that node's topo-index fires
 * - CP target wires arrive at phase 1
 * - Processing node target wires arrive when that node fires
 * - Cross-cycle feedback (arrive <= depart) wraps arrive to 1
 * - Minimum gap enforced for visibility
 */
export function computeWireAnimationCache(
  wires: ReadonlyArray<Wire>,
  nodes: ReadonlyMap<string, unknown>,
  cycleResults: CycleResults,
  playpoint: number,
): WireAnimationCache {
  const processingOrder = cycleResults.processingOrder;
  const denominator = processingOrder.length + 1;

  // Build topo-index map: nodeId → 0-based index in processing order
  const topoIndex = new Map<NodeId, number>();
  for (let i = 0; i < processingOrder.length; i++) {
    topoIndex.set(processingOrder[i], i);
  }

  const timings = new Map<string, WireBlipTiming>();

  for (const wire of wires) {
    const sourceNodeId = wire.source.nodeId;
    const targetNodeId = wire.target.nodeId;

    // Determine depart phase
    let departPhase: number;
    if (isConnectionPointNode(sourceNodeId)) {
      departPhase = 0;
    } else {
      const idx = topoIndex.get(sourceNodeId);
      departPhase = idx !== undefined ? (idx + 1) / denominator : 0;
    }

    // Determine arrive phase
    let arrivePhase: number;
    if (isConnectionPointNode(targetNodeId)) {
      arrivePhase = 1;
    } else {
      const idx = topoIndex.get(targetNodeId);
      arrivePhase = idx !== undefined ? (idx + 1) / denominator : 1;
    }

    // Cross-cycle feedback: if arrive <= depart, wrap to end
    if (arrivePhase <= departPhase) {
      arrivePhase = 1;
    }

    // Enforce minimum gap for visibility
    const minGap = 1 / denominator;
    if (arrivePhase - departPhase < minGap) {
      arrivePhase = Math.min(departPhase + minGap, 1);
    }

    const signalValue = cycleResults.wireValues.get(wire.id)?.[playpoint] ?? 0;

    timings.set(wire.id, {
      wireId: wire.id,
      departPhase,
      arrivePhase,
      signalValue,
    });
  }

  return { timings };
}

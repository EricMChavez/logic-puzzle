/**
 * Node liveness — forward-reachability from input sources.
 *
 * A node is "live" if it is reachable from any source node (input CP)
 * by following wires forward (source → target). Non-live nodes are inert:
 * they produce no signal and their wires render as neutral base only.
 */

import type { NodeId, Wire } from '../../shared/types/index.ts';

/**
 * Compute the set of live (forward-reachable) node IDs via BFS.
 *
 * @param wires        All wires (signal + parameter) on the board
 * @param sourceNodeIds  Set of source node IDs (input CPs, creative input slots)
 * @returns Set of all node IDs reachable from any source
 */
export function computeLiveNodes(
  wires: ReadonlyArray<Wire>,
  sourceNodeIds: ReadonlySet<NodeId>,
): Set<NodeId> {
  // Build adjacency list: chipId → set of downstream chipIds
  const adjacency = new Map<NodeId, Set<NodeId>>();
  for (const wire of wires) {
    const srcId = wire.source.chipId;
    const tgtId = wire.target.chipId;
    let neighbors = adjacency.get(srcId);
    if (!neighbors) {
      neighbors = new Set();
      adjacency.set(srcId, neighbors);
    }
    neighbors.add(tgtId);
  }

  // BFS from all source nodes
  const live = new Set<NodeId>();
  const queue: NodeId[] = [];

  for (const srcId of sourceNodeIds) {
    if (!live.has(srcId)) {
      live.add(srcId);
      queue.push(srcId);
    }
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    const neighbors = adjacency.get(current);
    if (!neighbors) continue;
    for (const neighbor of neighbors) {
      if (!live.has(neighbor)) {
        live.add(neighbor);
        queue.push(neighbor);
      }
    }
  }

  return live;
}

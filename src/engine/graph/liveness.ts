/**
 * Chip liveness — forward-reachability from input sources.
 *
 * A chip is "live" if it is reachable from any source chip (input CP)
 * by following paths forward (source → target). Non-live chips are inert:
 * they produce no signal and their paths render as neutral base only.
 */

import type { ChipId, Path } from '../../shared/types/index.ts';

/**
 * Compute the set of live (forward-reachable) chip IDs via BFS.
 *
 * @param paths        All paths (signal + parameter) on the board
 * @param sourceChipIds  Set of source chip IDs (input CPs, creative input slots)
 * @returns Set of all chip IDs reachable from any source
 */
export function computeLiveNodes(
  paths: ReadonlyArray<Path>,
  sourceChipIds: ReadonlySet<ChipId>,
): Set<ChipId> {
  // Build adjacency list: chipId → set of downstream chipIds
  const adjacency = new Map<ChipId, Set<ChipId>>();
  for (const path of paths) {
    const srcId = path.source.chipId;
    const tgtId = path.target.chipId;
    let neighbors = adjacency.get(srcId);
    if (!neighbors) {
      neighbors = new Set();
      adjacency.set(srcId, neighbors);
    }
    neighbors.add(tgtId);
  }

  // BFS from all source chips
  const live = new Set<ChipId>();
  const queue: ChipId[] = [];

  for (const srcId of sourceChipIds) {
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

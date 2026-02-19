import type { ChipId, Path } from '../../shared/types/index.ts';
import type { Result } from '../../shared/result/index.ts';
import { ok, err } from '../../shared/result/index.ts';

export interface CycleError {
  message: string;
  /** Chip IDs forming the cycle */
  cyclePath: ChipId[];
}

export interface TopologicalResult {
  order: ChipId[];
  /** Longest path from any root (zero in-degree chip) to each chip */
  depths: Map<ChipId, number>;
  /** Maximum depth across all chips */
  maxDepth: number;
}

/**
 * Topological sort using Kahn's algorithm.
 * Returns chips ordered so every chip evaluates after its dependencies,
 * or an error with the cycle path if a cycle exists.
 * Disconnected chips (no edges) are included in the output.
 */
export function topologicalSort(
  chipIds: ChipId[],
  paths: Path[],
): Result<ChipId[], CycleError> {
  // Build adjacency list and in-degree map
  const inDegree = new Map<ChipId, number>();
  const adjacency = new Map<ChipId, ChipId[]>();

  for (const id of chipIds) {
    inDegree.set(id, 0);
    adjacency.set(id, []);
  }

  for (const path of paths) {
    const from = path.source.chipId;
    const to = path.target.chipId;
    adjacency.get(from)!.push(to);
    inDegree.set(to, (inDegree.get(to) ?? 0) + 1);
  }

  // Seed queue with chips that have zero in-degree
  const queue: ChipId[] = [];
  for (const id of chipIds) {
    if (inDegree.get(id) === 0) {
      queue.push(id);
    }
  }

  const sorted: ChipId[] = [];

  while (queue.length > 0) {
    const chip = queue.shift()!;
    sorted.push(chip);

    for (const neighbor of adjacency.get(chip)!) {
      const deg = inDegree.get(neighbor)! - 1;
      inDegree.set(neighbor, deg);
      if (deg === 0) {
        queue.push(neighbor);
      }
    }
  }

  // If not all chips were processed, a cycle exists
  if (sorted.length !== chipIds.length) {
    const cyclePath = findCycle(chipIds, paths, sorted);
    return err({
      message: `Cycle detected: ${cyclePath.join(' → ')}`,
      cyclePath,
    });
  }

  return ok(sorted);
}

/**
 * Topological sort with depth tracking.
 *
 * Returns the same topological order as `topologicalSort`, plus a depth map
 * where depth = longest path from any root (zero in-degree chip) to each chip.
 * Chips with no predecessors have depth 0.
 */
export function topologicalSortWithDepths(
  chipIds: ChipId[],
  paths: Path[],
): Result<TopologicalResult, CycleError> {
  const sortResult = topologicalSort(chipIds, paths);
  if (!sortResult.ok) return sortResult;

  const order = sortResult.value;

  // Build reverse adjacency: for each chip, which chips feed into it
  const predecessors = new Map<ChipId, ChipId[]>();
  for (const id of chipIds) {
    predecessors.set(id, []);
  }
  for (const path of paths) {
    predecessors.get(path.target.chipId)!.push(path.source.chipId);
  }

  // Compute depths in topological order (predecessors already processed)
  const depths = new Map<ChipId, number>();
  let maxDepth = 0;

  for (const chipId of order) {
    const preds = predecessors.get(chipId)!;
    let depth = 0;
    for (const pred of preds) {
      const predDepth = depths.get(pred);
      if (predDepth !== undefined && predDepth + 1 > depth) {
        depth = predDepth + 1;
      }
    }
    depths.set(chipId, depth);
    if (depth > maxDepth) maxDepth = depth;
  }

  return ok({ order, depths, maxDepth });
}

/**
 * Find one cycle among the unprocessed chips using DFS.
 */
function findCycle(
  chipIds: ChipId[],
  paths: Path[],
  processed: ChipId[],
): ChipId[] {
  const processedSet = new Set(processed);
  const remaining = chipIds.filter((id) => !processedSet.has(id));

  // Build adjacency restricted to remaining chips
  const adjacency = new Map<ChipId, ChipId[]>();
  const remainingSet = new Set(remaining);
  for (const id of remaining) {
    adjacency.set(id, []);
  }
  for (const path of paths) {
    if (remainingSet.has(path.source.chipId) && remainingSet.has(path.target.chipId)) {
      adjacency.get(path.source.chipId)!.push(path.target.chipId);
    }
  }

  // DFS to find cycle
  const visited = new Set<ChipId>();
  const onStack = new Set<ChipId>();
  const parent = new Map<ChipId, ChipId>();

  for (const start of remaining) {
    if (visited.has(start)) continue;
    const cycle = dfs(start, adjacency, visited, onStack, parent);
    if (cycle) return cycle;
  }

  // Fallback: return remaining chips (should not happen if called correctly)
  return remaining;
}

function dfs(
  chip: ChipId,
  adjacency: Map<ChipId, ChipId[]>,
  visited: Set<ChipId>,
  onStack: Set<ChipId>,
  parent: Map<ChipId, ChipId>,
): ChipId[] | null {
  visited.add(chip);
  onStack.add(chip);

  for (const neighbor of adjacency.get(chip) ?? []) {
    if (!visited.has(neighbor)) {
      parent.set(neighbor, chip);
      const cycle = dfs(neighbor, adjacency, visited, onStack, parent);
      if (cycle) return cycle;
    } else if (onStack.has(neighbor)) {
      // Found cycle — reconstruct path
      const cyclePath: ChipId[] = [neighbor];
      let current = chip;
      while (current !== neighbor) {
        cyclePath.push(current);
        current = parent.get(current)!;
      }
      cyclePath.push(neighbor);
      cyclePath.reverse();
      return cyclePath;
    }
  }

  onStack.delete(chip);
  return null;
}

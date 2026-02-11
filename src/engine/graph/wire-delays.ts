import type { NodeId, Wire, NodeState } from '../../shared/types/index.ts';

export interface WireDelayResult {
  /** wireId → delay in ticks (min 1) */
  wireDelays: Map<string, number>;
  /** nodeId → topological depth (for debugging) */
  nodeDepths: Map<NodeId, number>;
  /** Max depth among output-reachable terminal nodes */
  outputMaxDepth: number;
}

/**
 * Computes per-wire delays so every path from any source to any output
 * connection point totals exactly `totalTicks`.
 *
 * Algorithm:
 * 1. Build adjacency maps from wires
 * 2. Forward pass in topo order: depth[node] = max(depth[pred] + 1)
 * 3. Backward BFS from outputs to mark "output-reachable" nodes
 * 4. For output-reachable wires: distribute totalTicks proportionally
 * 5. For dead-end subgraphs: use remaining budget after entry point
 * 6. All-dead-end: treat entire graph as one subgraph with full budget
 *
 * Rounding strategy: compute arrival times first, derive delays as
 * differences. This guarantees exact total = totalTicks along any path.
 */
export function computeWireDelays(
  topoOrder: ReadonlyArray<NodeId>,
  wires: ReadonlyArray<Wire>,
  nodes: ReadonlyMap<NodeId, NodeState>,
  totalTicks: number,
): WireDelayResult {
  const result: WireDelayResult = {
    wireDelays: new Map(),
    nodeDepths: new Map(),
    outputMaxDepth: 0,
  };

  if (wires.length === 0) {
    for (const nodeId of topoOrder) {
      result.nodeDepths.set(nodeId, 0);
    }
    return result;
  }

  // Build adjacency: incoming wires per node, outgoing wires per node
  const incomingWires = new Map<NodeId, Wire[]>();
  const outgoingWires = new Map<NodeId, Wire[]>();
  for (const nodeId of topoOrder) {
    incomingWires.set(nodeId, []);
    outgoingWires.set(nodeId, []);
  }
  for (const wire of wires) {
    const src = wire.source.nodeId;
    const tgt = wire.target.nodeId;
    outgoingWires.get(src)?.push(wire);
    incomingWires.get(tgt)?.push(wire);
  }

  // Forward pass: compute depth for each node in topo order
  const depth = new Map<NodeId, number>();
  for (const nodeId of topoOrder) {
    const incoming = incomingWires.get(nodeId) ?? [];
    if (incoming.length === 0) {
      depth.set(nodeId, 0);
    } else {
      let maxPredDepth = 0;
      for (const wire of incoming) {
        const predDepth = depth.get(wire.source.nodeId) ?? 0;
        maxPredDepth = Math.max(maxPredDepth, predDepth + 1);
      }
      depth.set(nodeId, maxPredDepth);
    }
  }

  // Copy depths to result
  for (const [nodeId, d] of depth) {
    result.nodeDepths.set(nodeId, d);
  }

  // Find terminal nodes: nodes with no outgoing wires (among wired nodes)
  const wiredNodes = new Set<NodeId>();
  for (const wire of wires) {
    wiredNodes.add(wire.source.nodeId);
    wiredNodes.add(wire.target.nodeId);
  }

  // Identify "output" nodes: nodes that are connection-output types
  // Connection outputs are nodes that represent gameboard output connection points.
  // We identify them as nodes that have no outgoing wires (terminal/sink nodes).
  const terminalNodes = new Set<NodeId>();
  for (const nodeId of wiredNodes) {
    const outgoing = outgoingWires.get(nodeId) ?? [];
    if (outgoing.length === 0) {
      terminalNodes.add(nodeId);
    }
  }

  // Backward BFS from terminal nodes to find all output-reachable nodes
  const outputReachable = new Set<NodeId>();
  const bfsQueue: NodeId[] = [...terminalNodes];
  for (const nodeId of bfsQueue) {
    if (outputReachable.has(nodeId)) continue;
    outputReachable.add(nodeId);
    for (const wire of incomingWires.get(nodeId) ?? []) {
      if (!outputReachable.has(wire.source.nodeId)) {
        bfsQueue.push(wire.source.nodeId);
      }
    }
  }

  // Compute outputMaxDepth among terminal nodes
  let outputMaxDepth = 0;
  for (const nodeId of terminalNodes) {
    outputMaxDepth = Math.max(outputMaxDepth, depth.get(nodeId) ?? 0);
  }
  result.outputMaxDepth = outputMaxDepth;

  // Compute arrival time for each node:
  // - Terminal nodes (sinks) always arrive at totalTicks
  // - Non-terminal nodes arrive proportionally based on depth
  function nodeArrivalTime(nodeId: NodeId): number {
    if (terminalNodes.has(nodeId)) return totalTicks;
    if (outputMaxDepth === 0) return 0;
    return Math.round((depth.get(nodeId)! * totalTicks) / outputMaxDepth);
  }

  // Check if any node is output-reachable
  const hasOutputReachable = outputReachable.size > 0;

  if (hasOutputReachable && outputMaxDepth > 0) {
    // Assign delays for output-reachable wires
    for (const wire of wires) {
      const src = wire.source.nodeId;
      const tgt = wire.target.nodeId;
      const srcReachable = outputReachable.has(src);
      const tgtReachable = outputReachable.has(tgt);

      if (srcReachable && tgtReachable) {
        const srcTime = nodeArrivalTime(src);
        const tgtTime = nodeArrivalTime(tgt);
        const delay = Math.max(1, tgtTime - srcTime);
        result.wireDelays.set(wire.id, delay);
      }
    }

    // Handle dead-end subgraphs: wires where target is NOT output-reachable
    // Find entry points: output-reachable nodes with outgoing wires to non-reachable nodes
    const deadEndWires: Wire[] = [];
    for (const wire of wires) {
      if (!result.wireDelays.has(wire.id)) {
        deadEndWires.push(wire);
      }
    }

    if (deadEndWires.length > 0) {
      assignDeadEndDelays(
        deadEndWires,
        depth,
        outputReachable,
        outputMaxDepth,
        totalTicks,
        incomingWires,
        result,
      );
    }
  } else if (outputMaxDepth === 0 && wires.length > 0) {
    // All nodes at same depth or all dead-end graph — each wire gets full budget
    // Special case: single-depth graph, just assign min delay of 1
    // or distribute totalTicks across the single-depth edges
    assignAllDeadEnd(wires, depth, totalTicks, incomingWires, topoOrder, result);
  }

  // Ensure all wires have at least delay 1
  for (const wire of wires) {
    if (!result.wireDelays.has(wire.id)) {
      result.wireDelays.set(wire.id, 1);
    }
  }

  return result;
}

/**
 * Assigns delays for dead-end subgraph wires.
 * Entry node is the output-reachable predecessor; remaining budget is
 * totalTicks - entryTime. Local depths within the dead-end subgraph
 * distribute the remaining budget.
 */
function assignDeadEndDelays(
  deadEndWires: Wire[],
  globalDepth: Map<NodeId, number>,
  outputReachable: Set<NodeId>,
  outputMaxDepth: number,
  totalTicks: number,
  incomingWires: Map<NodeId, Wire[]>,
  result: WireDelayResult,
): void {
  // Group dead-end wires by connected subgraph
  const deadEndNodes = new Set<NodeId>();
  for (const wire of deadEndWires) {
    deadEndNodes.add(wire.source.nodeId);
    deadEndNodes.add(wire.target.nodeId);
  }

  // For each dead-end subgraph, find entry node and compute local depths
  // Entry node: a node that is output-reachable (or has output-reachable predecessor)
  const visited = new Set<NodeId>();

  for (const wire of deadEndWires) {
    const src = wire.source.nodeId;
    if (visited.has(src) && visited.has(wire.target.nodeId)) continue;

    // Find the entry point: walk backwards from dead-end nodes to find
    // the first output-reachable node
    let entryNodeId: NodeId | null = null;
    let entryDepth = 0;

    // BFS backward from src to find entry
    const searchQueue: NodeId[] = [src];
    const searchVisited = new Set<NodeId>();
    while (searchQueue.length > 0) {
      const nodeId = searchQueue.shift()!;
      if (searchVisited.has(nodeId)) continue;
      searchVisited.add(nodeId);

      if (outputReachable.has(nodeId)) {
        entryNodeId = nodeId;
        entryDepth = globalDepth.get(nodeId) ?? 0;
        break;
      }

      for (const inWire of incomingWires.get(nodeId) ?? []) {
        if (!searchVisited.has(inWire.source.nodeId)) {
          searchQueue.push(inWire.source.nodeId);
        }
      }
    }

    const entryTime = entryNodeId !== null
      ? Math.round((entryDepth * totalTicks) / outputMaxDepth)
      : 0;
    const remaining = totalTicks - entryTime;

    // Compute local depths within this dead-end subgraph relative to entry
    const localDepth = new Map<NodeId, number>();
    if (entryNodeId !== null) {
      localDepth.set(entryNodeId, 0);
    }

    // Forward pass through dead-end wires to compute local depths
    // Process in global depth order
    const subgraphWires = deadEndWires.filter(
      (w) => searchVisited.has(w.source.nodeId) || searchVisited.has(w.target.nodeId),
    );

    let changed = true;
    while (changed) {
      changed = false;
      for (const w of subgraphWires) {
        const srcLocal = localDepth.get(w.source.nodeId);
        if (srcLocal !== undefined) {
          const newDepth = srcLocal + 1;
          const existing = localDepth.get(w.target.nodeId);
          if (existing === undefined || newDepth > existing) {
            localDepth.set(w.target.nodeId, newDepth);
            changed = true;
          }
        }
      }
    }

    // Find local max depth
    let localMax = 0;
    for (const [, d] of localDepth) {
      localMax = Math.max(localMax, d);
    }

    // Assign delays for subgraph wires
    for (const w of subgraphWires) {
      if (result.wireDelays.has(w.id)) continue;
      visited.add(w.source.nodeId);
      visited.add(w.target.nodeId);

      const srcLocal = localDepth.get(w.source.nodeId) ?? 0;
      const tgtLocal = localDepth.get(w.target.nodeId) ?? 1;

      if (localMax === 0) {
        result.wireDelays.set(w.id, Math.max(1, remaining));
        continue;
      }

      const srcTime = Math.round((srcLocal * remaining) / localMax);
      const tgtTime = Math.round((tgtLocal * remaining) / localMax);
      result.wireDelays.set(w.id, Math.max(1, tgtTime - srcTime));
    }
  }
}

/**
 * Handles the case where the entire graph is dead-end (no terminal/output nodes
 * reachable) or all nodes are at the same depth.
 */
function assignAllDeadEnd(
  wires: ReadonlyArray<Wire>,
  depth: Map<NodeId, number>,
  totalTicks: number,
  incomingWires: Map<NodeId, Wire[]>,
  topoOrder: ReadonlyArray<NodeId>,
  result: WireDelayResult,
): void {
  // Find overall max depth
  let maxDepth = 0;
  for (const [, d] of depth) {
    maxDepth = Math.max(maxDepth, d);
  }

  if (maxDepth === 0) {
    // All nodes at depth 0 — single wire or parallel edges
    for (const wire of wires) {
      result.wireDelays.set(wire.id, totalTicks);
    }
    return;
  }

  // Distribute totalTicks across depths
  for (const wire of wires) {
    const srcDepth = depth.get(wire.source.nodeId) ?? 0;
    const tgtDepth = depth.get(wire.target.nodeId) ?? 1;
    const srcTime = Math.round((srcDepth * totalTicks) / maxDepth);
    const tgtTime = Math.round((tgtDepth * totalTicks) / maxDepth);
    result.wireDelays.set(wire.id, Math.max(1, tgtTime - srcTime));
  }
}

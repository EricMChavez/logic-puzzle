import type { GameboardState, NodeState, Wire } from '../shared/types/index.ts';
import { createWire } from '../shared/types/index.ts';
import type { BakeMetadata } from '../engine/baking/index.ts';
import { createConnectionPointNode } from './connection-point-nodes.ts';
import { isConnectionPointNode } from './connection-point-nodes.ts';

/**
 * Reconstruct a read-only GameboardState from bake metadata.
 * Used for viewing puzzle node internals.
 *
 * Layout strategy:
 * - Input CPs: left column
 * - Processing nodes: topological order across middle columns
 * - Output CPs: right column
 */
export function gameboardFromBakeMetadata(
  puzzleId: string,
  metadata: BakeMetadata,
): GameboardState {
  const nodes = new Map<string, NodeState>();

  // Create input CP nodes
  for (let i = 0; i < metadata.inputCount; i++) {
    const cp = createConnectionPointNode('input', i);
    nodes.set(cp.id, cp);
  }

  // Create output CP nodes
  for (let i = 0; i < metadata.outputCount; i++) {
    const cp = createConnectionPointNode('output', i);
    nodes.set(cp.id, cp);
  }

  // Create processing nodes from nodeConfigs, laid out in topo order
  const processingConfigs = metadata.nodeConfigs.filter(
    (cfg) => !isConnectionPointNode(cfg.id),
  );

  // Spread processing nodes across middle columns in topo order
  for (let i = 0; i < processingConfigs.length; i++) {
    const cfg = processingConfigs[i];

    const node: NodeState = {
      id: cfg.id,
      type: cfg.type,
      position: { col: 4 + i * 2, row: 4 },
      params: { ...cfg.params },
      inputCount: cfg.inputCount,
      outputCount: cfg.outputCount,
    };
    nodes.set(cfg.id, node);
  }

  // Build wires from edges
  const wires: Wire[] = metadata.edges.map((edge, i) =>
    createWire(
      `viewer-wire-${i}`,
      { nodeId: edge.fromNodeId, portIndex: edge.fromPort, side: 'output' as const },
      { nodeId: edge.toNodeId, portIndex: edge.toPort, side: 'input' as const },
    ),
  );

  return {
    id: `viewer-puzzle:${puzzleId}`,
    nodes,
    wires,
  };
}

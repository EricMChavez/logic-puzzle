import type { GameboardState, NodeState, Wire } from '../shared/types/index.ts';
import { createWire } from '../shared/types/index.ts';
import type { BakeMetadata } from '../engine/baking/index.ts';
import { createConnectionPointNode, createBidirectionalConnectionPointNode, isBidirectionalCpNode, getBidirectionalCpIndex } from './connection-point-nodes.ts';
import { isConnectionPointNode } from './connection-point-nodes.ts';
import { PLAYABLE_START, PLAYABLE_END } from '../shared/grid/index.ts';

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

  // Detect if edges reference bidirectional CP nodes (utility nodes use these)
  const usesBidirectionalCps = metadata.edges.some(
    edge => isBidirectionalCpNode(edge.fromNodeId) || isBidirectionalCpNode(edge.toNodeId)
  );

  if (usesBidirectionalCps) {
    // Create bidirectional CP nodes to match the edge references
    // Collect all unique bidirectional CP indices from edges
    const bidirIndices = new Set<number>();
    for (const edge of metadata.edges) {
      if (isBidirectionalCpNode(edge.fromNodeId)) {
        bidirIndices.add(getBidirectionalCpIndex(edge.fromNodeId));
      }
      if (isBidirectionalCpNode(edge.toNodeId)) {
        bidirIndices.add(getBidirectionalCpIndex(edge.toNodeId));
      }
    }
    for (const idx of bidirIndices) {
      const cp = createBidirectionalConnectionPointNode(idx);
      nodes.set(cp.id, cp);
    }
  } else {
    // Create standard input/output CP nodes
    for (let i = 0; i < metadata.inputCount; i++) {
      const cp = createConnectionPointNode('input', i);
      nodes.set(cp.id, cp);
    }
    for (let i = 0; i < metadata.outputCount; i++) {
      const cp = createConnectionPointNode('output', i);
      nodes.set(cp.id, cp);
    }
  }

  // Create processing nodes from nodeConfigs, laid out in topo order
  const processingConfigs = metadata.nodeConfigs.filter(
    (cfg) => !isConnectionPointNode(cfg.id),
  );

  // Spread processing nodes across playable area in topo order
  const margin = 4; // cells inside playable area edges
  const startCol = PLAYABLE_START + margin;
  const endCol = PLAYABLE_END - margin;
  const spacing = processingConfigs.length > 1
    ? Math.min(6, Math.floor((endCol - startCol) / (processingConfigs.length - 1)))
    : 0;
  for (let i = 0; i < processingConfigs.length; i++) {
    const cfg = processingConfigs[i];

    const node: NodeState = {
      id: cfg.id,
      type: cfg.type,
      position: { col: startCol + i * spacing, row: 4 },
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

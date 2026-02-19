import type { GameboardState, ChipState, Path } from '../shared/types/index.ts';
import { createPath } from '../shared/types/index.ts';
import type { BakeMetadata } from '../engine/baking/index.ts';
import { createConnectionPointNode, createBidirectionalConnectionPointNode, isBidirectionalCpNode, getBidirectionalCpIndex } from './connection-point-nodes.ts';
import { isConnectionPointNode } from './connection-point-nodes.ts';
import { PLAYABLE_START, PLAYABLE_END } from '../shared/grid/index.ts';

/**
 * Reconstruct a read-only GameboardState from bake metadata.
 * Used for viewing puzzle chip internals.
 *
 * Layout strategy:
 * - Input CPs: left column
 * - Processing chips: topological order across middle columns
 * - Output CPs: right column
 */
export function gameboardFromBakeMetadata(
  puzzleId: string,
  metadata: BakeMetadata,
): GameboardState {
  const chips = new Map<string, ChipState>();

  // Detect if edges reference bidirectional CP chips (utility chips use these)
  const usesBidirectionalCps = metadata.edges.some(
    edge => isBidirectionalCpNode(edge.fromChipId) || isBidirectionalCpNode(edge.toChipId)
  );

  if (usesBidirectionalCps) {
    // Create bidirectional CP chips to match the edge references
    // Collect all unique bidirectional CP indices from edges
    const bidirIndices = new Set<number>();
    for (const edge of metadata.edges) {
      if (isBidirectionalCpNode(edge.fromChipId)) {
        bidirIndices.add(getBidirectionalCpIndex(edge.fromChipId));
      }
      if (isBidirectionalCpNode(edge.toChipId)) {
        bidirIndices.add(getBidirectionalCpIndex(edge.toChipId));
      }
    }
    for (const idx of bidirIndices) {
      const cp = createBidirectionalConnectionPointNode(idx);
      chips.set(cp.id, cp);
    }
  } else {
    // Create standard input/output CP chips
    for (let i = 0; i < metadata.socketCount; i++) {
      const cp = createConnectionPointNode('input', i);
      chips.set(cp.id, cp);
    }
    for (let i = 0; i < metadata.plugCount; i++) {
      const cp = createConnectionPointNode('output', i);
      chips.set(cp.id, cp);
    }
  }

  // Create processing chips from chipConfigs, laid out in topo order
  const processingConfigs = metadata.chipConfigs.filter(
    (cfg) => !isConnectionPointNode(cfg.id),
  );

  // Spread processing chips across playable area in topo order
  const margin = 4; // cells inside playable area edges
  const startCol = PLAYABLE_START + margin;
  const endCol = PLAYABLE_END - margin;
  const spacing = processingConfigs.length > 1
    ? Math.min(6, Math.floor((endCol - startCol) / (processingConfigs.length - 1)))
    : 0;
  for (let i = 0; i < processingConfigs.length; i++) {
    const cfg = processingConfigs[i];

    const chip: ChipState = {
      id: cfg.id,
      type: cfg.type,
      position: { col: startCol + i * spacing, row: 4 },
      params: { ...cfg.params },
      socketCount: cfg.socketCount,
      plugCount: cfg.plugCount,
    };
    chips.set(cfg.id, chip);
  }

  // Build paths from edges
  const paths: Path[] = metadata.edges.map((edge, i) =>
    createPath(
      `viewer-wire-${i}`,
      { chipId: edge.fromChipId, portIndex: edge.fromPort, side: 'plug' as const },
      { chipId: edge.toChipId, portIndex: edge.toPort, side: 'socket' as const },
    ),
  );

  return {
    id: `viewer-puzzle:${puzzleId}`,
    chips,
    paths,
  };
}

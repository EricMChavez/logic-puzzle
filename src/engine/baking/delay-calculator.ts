import type { NodeId, NodeState, Wire } from '../../shared/types/index.ts';
import {
  isConnectionInputNode,
  isConnectionOutputNode,
  getConnectionPointIndex,
} from '../../puzzle/connection-point-nodes.ts';
import { createLogger } from '../../shared/logger/index.ts';

const log = createLogger('Bake');

/** Describes where a node input port gets its value from. */
export type PortSource =
  | { kind: 'cp'; cpIndex: number; bufferOffset: number }
  | { kind: 'node'; sourceNodeId: NodeId; sourcePort: number }
  | { kind: 'none' };

/** Mapping from an output CP to the node/port that feeds it. */
export interface OutputMapping {
  cpIndex: number;
  sourceNodeId: NodeId;
  sourcePort: number;
}

/** Full result of delay analysis. */
export interface DelayAnalysis {
  /** For each processing node, its input port sources. Key: "nodeId:portIndex" */
  portSources: Map<string, PortSource>;
  /** Circular buffer size per input CP index. */
  inputBufferSizes: number[];
  /** Output CP mappings. */
  outputMappings: OutputMapping[];
  /** Processing nodes in topological order (excludes CP nodes). */
  processingOrder: NodeId[];
  inputCount: number;
  outputCount: number;
}

/**
 * Analyze wire delays across the graph to determine buffer sizes for input CPs
 * and the source/offset for every node input port.
 *
 * Walk topo order tracking cumulative delay from each input CP.
 * Normalize so the shortest path from any CP has offset 0.
 */
export function analyzeDelays(
  topoOrder: NodeId[],
  nodes: ReadonlyMap<NodeId, NodeState>,
  wires: Wire[],
): DelayAnalysis {
  // Build wire lookup: target "nodeId:portIndex" → wire
  const wireByTarget = new Map<string, Wire>();
  for (const wire of wires) {
    const key = `${wire.to.nodeId}:${wire.to.portIndex}`;
    wireByTarget.set(key, wire);
  }

  // Build outgoing wire lookup: source "nodeId:portIndex" → wire[]
  const wiresBySource = new Map<string, Wire[]>();
  for (const wire of wires) {
    const key = `${wire.from.nodeId}:${wire.from.portIndex}`;
    const list = wiresBySource.get(key) ?? [];
    list.push(wire);
    wiresBySource.set(key, list);
  }

  // Track cumulative delay at each node's output ports.
  // outputDelay[nodeId] = delay accumulated from input CPs to this node's output.
  const outputDelay = new Map<NodeId, number>();

  const portSources = new Map<string, PortSource>();
  const outputMappings: OutputMapping[] = [];
  const processingOrder: NodeId[] = [];

  let inputCount = 0;
  let outputCount = 0;

  for (const nodeId of topoOrder) {
    const node = nodes.get(nodeId);
    if (!node) continue;

    if (isConnectionInputNode(nodeId)) {
      // Input CPs produce signals with 0 initial delay
      outputDelay.set(nodeId, 0);
      const cpIndex = getConnectionPointIndex(nodeId);
      if (cpIndex >= inputCount) inputCount = cpIndex + 1;
      continue;
    }

    if (isConnectionOutputNode(nodeId)) {
      // Output CPs receive from a single input wire
      const cpIndex = getConnectionPointIndex(nodeId);
      if (cpIndex >= outputCount) outputCount = cpIndex + 1;

      const wireKey = `${nodeId}:0`;
      const wire = wireByTarget.get(wireKey);
      if (wire) {
        outputMappings.push({
          cpIndex,
          sourceNodeId: wire.from.nodeId,
          sourcePort: wire.from.portIndex,
        });
      }
      continue;
    }

    // Processing node
    processingOrder.push(nodeId);

    let maxInputDelay = 0;

    for (let portIndex = 0; portIndex < node.inputCount; portIndex++) {
      const wireKey = `${nodeId}:${portIndex}`;
      const wire = wireByTarget.get(wireKey);

      if (!wire) {
        portSources.set(wireKey, { kind: 'none' });
        continue;
      }

      const sourceNodeId = wire.from.nodeId;
      const sourcePort = wire.from.portIndex;

      if (isConnectionInputNode(sourceNodeId)) {
        // Wire from an input CP
        const cpIndex = getConnectionPointIndex(sourceNodeId);
        const sourceDelay = outputDelay.get(sourceNodeId) ?? 0;
        const totalDelay = sourceDelay + wire.wtsDelay;
        portSources.set(wireKey, {
          kind: 'cp',
          cpIndex,
          bufferOffset: totalDelay,
        });
        if (totalDelay > maxInputDelay) maxInputDelay = totalDelay;
      } else {
        // Wire from another processing node
        const sourceDelay = outputDelay.get(sourceNodeId) ?? 0;
        const totalDelay = sourceDelay + wire.wtsDelay;
        portSources.set(wireKey, {
          kind: 'node',
          sourceNodeId,
          sourcePort,
        });
        if (totalDelay > maxInputDelay) maxInputDelay = totalDelay;
      }
    }

    // For delay nodes, add subdivisions to the output delay
    let nodeDelay = 0;
    if (node.type === 'delay') {
      const subdivisions =
        typeof node.params['subdivisions'] === 'number'
          ? node.params['subdivisions']
          : 0;
      nodeDelay = subdivisions;
    }
    outputDelay.set(nodeId, maxInputDelay + nodeDelay);
  }

  // Normalize CP buffer offsets: subtract minimum offset so shortest path = 0
  let minCpOffset = Infinity;
  for (const source of portSources.values()) {
    if (source.kind === 'cp') {
      if (source.bufferOffset < minCpOffset) minCpOffset = source.bufferOffset;
    }
  }
  if (minCpOffset === Infinity) minCpOffset = 0;

  if (minCpOffset > 0) {
    for (const source of portSources.values()) {
      if (source.kind === 'cp') {
        source.bufferOffset -= minCpOffset;
      }
    }
  }

  // Compute inputBufferSizes: max bufferOffset per CP index + 1
  const inputBufferSizes = new Array<number>(inputCount).fill(1);
  for (const source of portSources.values()) {
    if (source.kind === 'cp') {
      const needed = source.bufferOffset + 1;
      if (needed > inputBufferSizes[source.cpIndex]) {
        inputBufferSizes[source.cpIndex] = needed;
      }
    }
  }

  log.debug('Delay analysis complete', {
    inputCount,
    outputCount,
    processingNodes: processingOrder.length,
    inputBufferSizes,
  });

  return {
    portSources,
    inputBufferSizes,
    outputMappings,
    processingOrder,
    inputCount,
    outputCount,
  };
}

import type { NodeId, NodeState, Wire } from '../../shared/types/index.ts';
import { createWire, WIRE_BUFFER_SIZE } from '../../shared/types/index.ts';
import type { Result } from '../../shared/result/index.ts';
import { ok, err } from '../../shared/result/index.ts';
import { topologicalSort } from '../graph/topological-sort.ts';
import { getNodeDefinition } from '../nodes/registry.ts';
import type { NodeRuntimeState } from '../nodes/framework.ts';
import { analyzeDelays } from './delay-calculator.ts';
import type { PortSource, OutputMapping } from './delay-calculator.ts';
import {
  isConnectionPointNode,
  getConnectionPointIndex,
  createConnectionPointNode,
} from '../../puzzle/connection-point-nodes.ts';
import { createLogger } from '../../shared/logger/index.ts';
import type { BakeMetadata, BakeResult, BakeError, BakedEdge, BakedNodeConfig } from './types.ts';

const log = createLogger('Bake');

/** Circular buffer for input CP values. */
interface CircularBuffer {
  data: number[];
  writeIndex: number;
  capacity: number;
}

/** Pre-computed spec for one input port of a node in the closure. */
interface InputSpec {
  source: PortSource;
}

/** Pre-computed spec for one node in the closure. */
interface NodeSpec {
  id: NodeId;
  type: string;
  params: Record<string, number | string | boolean>;
  inputSpecs: InputSpec[];
  outputCount: number;
}

/**
 * Bake a gameboard graph into a single evaluate closure.
 *
 * The closure captures mutable state (circular buffers for input CPs,
 * DelayState for delay nodes) and evaluates the entire graph in one call.
 */
export function bakeGraph(
  nodes: ReadonlyMap<NodeId, NodeState>,
  wires: Wire[],
): Result<BakeResult, BakeError> {
  // Step 1: Topological sort
  const nodeIds = Array.from(nodes.keys());
  const sortResult = topologicalSort(nodeIds, wires);
  if (!sortResult.ok) {
    return err({
      message: sortResult.error.message,
      cyclePath: sortResult.error.cyclePath,
    });
  }
  const topoOrder = sortResult.value;

  // Step 2: Analyze delays
  const analysis = analyzeDelays(topoOrder, nodes, wires);

  // Step 3: Build metadata
  const metadata = buildMetadata(topoOrder, nodes, wires, analysis);

  // Step 4: Build closure
  const evaluate = buildClosure(nodes, analysis);

  log.info('Graph baked successfully', {
    inputCount: analysis.inputCount,
    outputCount: analysis.outputCount,
    processingNodes: analysis.processingOrder.length,
  });

  return ok({ evaluate, metadata });
}

/**
 * Reconstruct a BakeResult from serialized metadata.
 * Rebuilds the node map and wire array, then re-analyzes and builds a new closure.
 */
export function reconstructFromMetadata(metadata: BakeMetadata): BakeResult {
  // Rebuild nodes Map
  const nodes = new Map<NodeId, NodeState>();
  for (const config of metadata.nodeConfigs) {
    nodes.set(config.id, {
      id: config.id,
      type: config.type,
      position: { col: 0, row: 0 },
      params: { ...config.params },
      inputCount: config.inputCount,
      outputCount: config.outputCount,
    });
  }

  // Add CP virtual nodes that may not be in nodeConfigs
  for (let i = 0; i < metadata.inputCount; i++) {
    const cpNode = createConnectionPointNode('input', i);
    if (!nodes.has(cpNode.id)) {
      nodes.set(cpNode.id, cpNode);
    }
  }
  for (let i = 0; i < metadata.outputCount; i++) {
    const cpNode = createConnectionPointNode('output', i);
    if (!nodes.has(cpNode.id)) {
      nodes.set(cpNode.id, cpNode);
    }
  }

  // Rebuild wires
  const wires: Wire[] = metadata.edges.map((edge, i) =>
    createWire(
      `baked-wire-${i}`,
      { nodeId: edge.fromNodeId, portIndex: edge.fromPort, side: 'output' as const },
      { nodeId: edge.toNodeId, portIndex: edge.toPort, side: 'input' as const },
    ),
  );

  // Re-analyze and build closure
  const analysis = analyzeDelays(metadata.topoOrder, nodes, wires);
  const evaluate = buildClosure(nodes, analysis);

  return { evaluate, metadata };
}

/** Build serializable metadata from the analysis results. */
function buildMetadata(
  topoOrder: NodeId[],
  nodes: ReadonlyMap<NodeId, NodeState>,
  wires: Wire[],
  analysis: ReturnType<typeof analyzeDelays>,
): BakeMetadata {
  const nodeConfigs: BakedNodeConfig[] = [];
  for (const nodeId of topoOrder) {
    const node = nodes.get(nodeId);
    if (!node) continue;
    nodeConfigs.push({
      id: node.id,
      type: node.type,
      params: { ...node.params },
      inputCount: node.inputCount,
      outputCount: node.outputCount,
    });
  }

  const edges: BakedEdge[] = wires.map((wire) => ({
    fromNodeId: wire.source.nodeId,
    fromPort: wire.source.portIndex,
    toNodeId: wire.target.nodeId,
    toPort: wire.target.portIndex,
    wtsDelay: WIRE_BUFFER_SIZE,
  }));

  return {
    topoOrder,
    nodeConfigs,
    edges,
    inputDelays: analysis.inputBufferSizes,
    inputCount: analysis.inputCount,
    outputCount: analysis.outputCount,
  };
}

/** Read from a circular buffer at an offset before the current write position. */
function readCircularBuffer(buf: CircularBuffer, offset: number): number {
  // offset=0 means the most recently written value
  const index = ((buf.writeIndex - 1 - offset) % buf.capacity + buf.capacity) % buf.capacity;
  return buf.data[index];
}

/**
 * Evaluate a single processing node given its input values.
 * Uses the node registry to look up and evaluate any fundamental node.
 */
function evaluateNodePure(
  type: string,
  inputs: number[],
  params: Record<string, number | string | boolean>,
  nodeState: NodeRuntimeState | undefined,
  tickIndex: number,
): number[] {
  const def = getNodeDefinition(type);
  if (!def) {
    return [];
  }

  return def.evaluate({
    inputs,
    params: params as Record<string, number | string | boolean>,
    state: nodeState,
    tickIndex,
  });
}

/**
 * Build the evaluate closure that captures mutable state.
 *
 * The closure:
 * 1. Pushes each input value into its CP circular buffer
 * 2. Evaluates each processing node in topo order
 * 3. Collects output CP values and returns them
 */
function buildClosure(
  nodes: ReadonlyMap<NodeId, NodeState>,
  analysis: ReturnType<typeof analyzeDelays>,
): (inputs: number[]) => number[] {
  const {
    portSources,
    inputBufferSizes,
    outputMappings,
    processingOrder,
    inputCount,
    outputCount,
  } = analysis;

  // Create circular buffers for input CPs
  const cpBuffers: CircularBuffer[] = [];
  for (let i = 0; i < inputCount; i++) {
    const capacity = inputBufferSizes[i];
    cpBuffers.push({
      data: new Array<number>(capacity).fill(0),
      writeIndex: 0,
      capacity,
    });
  }

  // Build node specs for fast evaluation
  const nodeSpecs: NodeSpec[] = [];
  const nodeStates = new Map<NodeId, NodeRuntimeState>();

  for (const nodeId of processingOrder) {
    const node = nodes.get(nodeId);
    if (!node) continue;

    const inputSpecs: InputSpec[] = [];
    for (let portIndex = 0; portIndex < node.inputCount; portIndex++) {
      const key = `${nodeId}:${portIndex}`;
      const source = portSources.get(key) ?? { kind: 'none' as const };
      inputSpecs.push({ source });
    }

    nodeSpecs.push({
      id: nodeId,
      type: node.type,
      params: node.params,
      inputSpecs,
      outputCount: node.outputCount,
    });

    // Create node state for stateful nodes using the registry
    const def = getNodeDefinition(node.type);
    if (def?.createState) {
      nodeStates.set(nodeId, def.createState());
    }
  }

  // Pre-compute output mapping lookups
  const outputMap: OutputMapping[] = [];
  for (let i = 0; i < outputCount; i++) {
    const mapping = outputMappings.find((m) => m.cpIndex === i);
    if (mapping) {
      outputMap.push(mapping);
    } else {
      // Unconnected output — will produce 0
      outputMap.push({ cpIndex: i, sourceNodeId: '', sourcePort: 0 });
    }
  }

  // Storage for node outputs, reused across calls
  const nodeOutputs = new Map<NodeId, number[]>();

  // Track tick index for stateful nodes
  let tickIndex = 0;

  // The closure
  return function evaluate(inputs: number[]): number[] {
    // Step 1: Push input values into CP circular buffers
    for (let i = 0; i < inputCount; i++) {
      const buf = cpBuffers[i];
      const value = i < inputs.length ? inputs[i] : 0;
      buf.data[buf.writeIndex] = value;
      buf.writeIndex = (buf.writeIndex + 1) % buf.capacity;
    }

    // Step 2: Evaluate each processing node in topo order
    nodeOutputs.clear();

    for (const spec of nodeSpecs) {
      const nodeInputs: number[] = [];

      for (const inputSpec of spec.inputSpecs) {
        const source = inputSpec.source;
        if (source.kind === 'cp') {
          nodeInputs.push(readCircularBuffer(cpBuffers[source.cpIndex], source.bufferOffset));
        } else if (source.kind === 'node') {
          const outputs = nodeOutputs.get(source.sourceNodeId);
          nodeInputs.push(outputs ? (outputs[source.sourcePort] ?? 0) : 0);
        } else {
          nodeInputs.push(0);
        }
      }

      const nodeState = nodeStates.get(spec.id);
      const outputs = evaluateNodePure(spec.type, nodeInputs, spec.params, nodeState, tickIndex);
      nodeOutputs.set(spec.id, outputs);
    }

    tickIndex++;

    // Step 3: Collect output CP values
    const result = new Array<number>(outputCount).fill(0);
    for (let i = 0; i < outputCount; i++) {
      const mapping = outputMap[i];
      if (mapping.sourceNodeId === '') continue; // unconnected

      if (isConnectionPointNode(mapping.sourceNodeId)) {
        // Direct CP-to-CP: read from the input buffer
        const cpIndex = getConnectionPointIndex(mapping.sourceNodeId);
        if (cpIndex >= 0 && cpIndex < cpBuffers.length) {
          result[i] = readCircularBuffer(cpBuffers[cpIndex], 0);
        }
      } else {
        const outputs = nodeOutputs.get(mapping.sourceNodeId);
        result[i] = outputs ? (outputs[mapping.sourcePort] ?? 0) : 0;
      }
    }

    return result;
  };
}

import type { NodeId, NodeState, Wire } from '../../shared/types/index.ts';
import { createWire } from '../../shared/types/index.ts';
import type { Result } from '../../shared/result/index.ts';
import { ok, err } from '../../shared/result/index.ts';
import { topologicalSort } from '../graph/topological-sort.ts';
import { computeWireDelays } from '../graph/wire-delays.ts';
import { getNodeDefinition } from '../nodes/registry.ts';
import type { NodeRuntimeState } from '../nodes/framework.ts';
import { analyzeDelays } from './delay-calculator.ts';
import { GTS_CONFIG } from '../../shared/constants/index.ts';
import type { PortSource, OutputMapping } from './delay-calculator.ts';
import {
  isConnectionPointNode,
  isConnectionInputNode,
  isConnectionOutputNode,
  getConnectionPointIndex,
  createConnectionPointNode,
  isBidirectionalCpNode,
  getBidirectionalCpIndex,
  cpInputId,
  cpOutputId,
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
 * Classify bidirectional CPs by their wiring:
 * - Has outgoing wire (from output port) → 'input' (feeds signal into board)
 * - Has incoming wire (to input port) → 'output' (receives signal from board)
 * - Both → error
 * - Neither → 'off'
 */
function classifyBidirectionalCps(
  nodes: ReadonlyMap<NodeId, NodeState>,
  wires: Wire[],
): Result<('input' | 'output' | 'off')[], BakeError> {
  const layout: ('input' | 'output' | 'off')[] = [];

  for (let i = 0; i < 6; i++) {
    const nodeId = `__cp_bidir_${i}__`;
    if (!nodes.has(nodeId)) {
      layout.push('off');
      continue;
    }

    const hasOutgoing = wires.some(w => w.source.nodeId === nodeId);
    const hasIncoming = wires.some(w => w.target.nodeId === nodeId);

    if (hasOutgoing && hasIncoming) {
      return err({ message: `Bidirectional CP ${i} has both incoming and outgoing wires` });
    } else if (hasOutgoing) {
      layout.push('input');  // CP emits signal into the board → acts as input
    } else if (hasIncoming) {
      layout.push('output'); // CP receives signal from the board → acts as output
    } else {
      layout.push('off');
    }
  }

  return ok(layout);
}

/**
 * Transform bidirectional CPs into standard input/output CPs for baking.
 * Returns new nodes map and wires array with bidir CPs replaced.
 */
function transformBidirToStandard(
  nodes: ReadonlyMap<NodeId, NodeState>,
  wires: Wire[],
  cpLayout: ('input' | 'output' | 'off')[],
): { nodes: Map<NodeId, NodeState>; wires: Wire[] } {
  const newNodes = new Map<NodeId, NodeState>();
  let inputIndex = 0;
  let outputIndex = 0;

  // Map from bidir node ID to new standard CP node ID
  const idMap = new Map<string, string>();

  for (let i = 0; i < 6; i++) {
    const bidirId = `__cp_bidir_${i}__`;
    const direction = cpLayout[i];

    if (direction === 'input') {
      const newId = cpInputId(inputIndex);
      idMap.set(bidirId, newId);
      newNodes.set(newId, createConnectionPointNode('input', inputIndex));
      inputIndex++;
    } else if (direction === 'output') {
      const newId = cpOutputId(outputIndex);
      idMap.set(bidirId, newId);
      newNodes.set(newId, createConnectionPointNode('output', outputIndex));
      outputIndex++;
    }
    // 'off' CPs are dropped entirely
  }

  // Copy non-bidir nodes
  for (const [id, node] of nodes) {
    if (!isBidirectionalCpNode(id)) {
      newNodes.set(id, node);
    }
  }

  // Remap wires
  const newWires: Wire[] = wires
    .filter(w => {
      // Drop wires connected to 'off' CPs
      const srcBidir = isBidirectionalCpNode(w.source.nodeId);
      const tgtBidir = isBidirectionalCpNode(w.target.nodeId);
      if (srcBidir && !idMap.has(w.source.nodeId)) return false;
      if (tgtBidir && !idMap.has(w.target.nodeId)) return false;
      return true;
    })
    .map(w => {
      let source = w.source;
      let target = w.target;

      if (isBidirectionalCpNode(w.source.nodeId)) {
        const newId = idMap.get(w.source.nodeId)!;
        source = { ...source, nodeId: newId };
      }
      if (isBidirectionalCpNode(w.target.nodeId)) {
        const newId = idMap.get(w.target.nodeId)!;
        target = { ...target, nodeId: newId };
      }

      return { ...w, source, target };
    });

  return { nodes: newNodes, wires: newWires };
}

/**
 * Bake a gameboard graph into a single evaluate closure.
 *
 * The closure captures mutable state (circular buffers for input CPs)
 * and evaluates the entire graph in one call.
 */
export function bakeGraph(
  nodes: ReadonlyMap<NodeId, NodeState>,
  wires: Wire[],
): Result<BakeResult, BakeError> {
  // Check for bidirectional CPs (utility node editing)
  const hasBidirCps = Array.from(nodes.keys()).some(id => isBidirectionalCpNode(id));
  let cpLayout: ('input' | 'output' | 'off')[] | undefined;
  let bakeNodes = nodes;
  let bakeWires = wires;

  if (hasBidirCps) {
    const classifyResult = classifyBidirectionalCps(nodes, wires);
    if (!classifyResult.ok) {
      return err({ message: classifyResult.error.message });
    }
    cpLayout = classifyResult.value;
    const transformed = transformBidirToStandard(nodes, wires, cpLayout);
    bakeNodes = transformed.nodes;
    bakeWires = transformed.wires;
  }

  // Step 1: Topological sort
  const nodeIds = Array.from(bakeNodes.keys());
  const sortResult = topologicalSort(nodeIds, bakeWires);
  if (!sortResult.ok) {
    return err({
      message: sortResult.error.message,
      cyclePath: sortResult.error.cyclePath,
    });
  }
  const topoOrder = sortResult.value;

  // Step 2: Compute GTS wire delays and analyze
  const delayResult = computeWireDelays(topoOrder, bakeWires, bakeNodes, GTS_CONFIG.TOTAL_TICKS);
  const analysis = analyzeDelays(topoOrder, bakeNodes, bakeWires, delayResult.wireDelays);

  // Step 3: Build metadata
  const metadata = buildMetadata(topoOrder, bakeNodes, bakeWires, analysis, delayResult.wireDelays);
  if (cpLayout) {
    metadata.cpLayout = cpLayout;
  }

  // Step 4: Build closure
  const evaluate = buildClosure(bakeNodes, analysis);

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

  // Build wire delay map from stored edge data
  const wireDelays = new Map<string, number>();
  for (let i = 0; i < wires.length; i++) {
    wireDelays.set(wires[i].id, metadata.edges[i].wtsDelay);
  }

  // Re-analyze and build closure
  const analysis = analyzeDelays(metadata.topoOrder, nodes, wires, wireDelays);
  const evaluate = buildClosure(nodes, analysis);

  return { evaluate, metadata };
}

/** Build serializable metadata from the analysis results. */
function buildMetadata(
  topoOrder: NodeId[],
  nodes: ReadonlyMap<NodeId, NodeState>,
  wires: Wire[],
  analysis: ReturnType<typeof analyzeDelays>,
  wireDelays?: ReadonlyMap<string, number>,
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
    wtsDelay: wireDelays?.get(wire.id) ?? 1,
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

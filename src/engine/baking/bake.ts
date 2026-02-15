import type { NodeId, NodeState, Wire } from '../../shared/types/index.ts';
import { createWire } from '../../shared/types/index.ts';
import type { Result } from '../../shared/result/index.ts';
import { ok, err } from '../../shared/result/index.ts';
import { topologicalSort } from '../graph/topological-sort.ts';
import { getNodeDefinition } from '../nodes/registry.ts';
import type { NodeRuntimeState } from '../nodes/framework.ts';
import {
  isConnectionPointNode,
  isConnectionInputNode,
  isConnectionOutputNode,
  getConnectionPointIndex,
  createConnectionPointNode,
  isBidirectionalCpNode,
  cpInputId,
  cpOutputId,
  isUtilitySlotNode,
  getUtilitySlotIndex,
} from '../../puzzle/connection-point-nodes.ts';
import { createLogger } from '../../shared/logger/index.ts';
import type { BakeMetadata, BakeResult, BakeError, BakedEdge, BakedNodeConfig } from './types.ts';

const log = createLogger('Bake');

/** Where a node input port gets its value from. */
type PortSource =
  | { kind: 'cp'; cpIndex: number }
  | { kind: 'node'; sourceNodeId: NodeId; sourcePort: number }
  | { kind: 'none' };

/** Mapping from an output CP to the node/port that feeds it. */
interface OutputMapping {
  cpIndex: number;
  sourceNodeId: NodeId;
  sourcePort: number;
}

/** Pre-computed spec for one node in the closure. */
interface NodeSpec {
  id: NodeId;
  type: string;
  params: Record<string, number | string | boolean>;
  inputSpecs: PortSource[];
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
    const chipId = `__cp_bidir_${i}__`;
    if (!nodes.has(chipId)) {
      layout.push('off');
      continue;
    }

    const hasOutgoing = wires.some(w => w.source.chipId === chipId);
    const hasIncoming = wires.some(w => w.target.chipId === chipId);

    if (hasOutgoing && hasIncoming) {
      return err({ message: `Bidirectional CP ${i} has both incoming and outgoing wires` });
    } else if (hasOutgoing) {
      layout.push('input');
    } else if (hasIncoming) {
      layout.push('output');
    } else {
      layout.push('off');
    }
  }

  return ok(layout);
}

/**
 * Transform bidirectional CPs into standard input/output CPs for baking.
 */
function transformBidirToStandard(
  nodes: ReadonlyMap<NodeId, NodeState>,
  wires: Wire[],
  cpLayout: ('input' | 'output' | 'off')[],
): { chips: Map<NodeId, NodeState>; wires: Wire[] } {
  const newNodes = new Map<NodeId, NodeState>();
  let inputIndex = 0;
  let outputIndex = 0;

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
  }

  for (const [id, node] of nodes) {
    if (!isBidirectionalCpNode(id)) {
      newNodes.set(id, node);
    }
  }

  const newWires: Wire[] = wires
    .filter(w => {
      const srcBidir = isBidirectionalCpNode(w.source.chipId);
      const tgtBidir = isBidirectionalCpNode(w.target.chipId);
      if (srcBidir && !idMap.has(w.source.chipId)) return false;
      if (tgtBidir && !idMap.has(w.target.chipId)) return false;
      return true;
    })
    .map(w => {
      let source = w.source;
      let target = w.target;

      if (isBidirectionalCpNode(w.source.chipId)) {
        const newId = idMap.get(w.source.chipId)!;
        source = { ...source, chipId: newId };
      }
      if (isBidirectionalCpNode(w.target.chipId)) {
        const newId = idMap.get(w.target.chipId)!;
        target = { ...target, chipId: newId };
      }

      return { ...w, source, target };
    });

  return { chips: newNodes, wires: newWires };
}

/**
 * Bake a gameboard graph into a single evaluate closure.
 *
 * Cycle-based: each call to evaluate() processes one cycle.
 * No wire delay simulation. Memory nodes provide 1-cycle delay.
 */
export function bakeGraph(
  nodes: ReadonlyMap<NodeId, NodeState>,
  wires: Wire[],
): Result<BakeResult, BakeError> {
  // Handle bidirectional CPs (utility node editing)
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
    bakeNodes = transformed.chips;
    bakeWires = transformed.paths;
  }

  // Step 1: Topological sort
  const chipIds = Array.from(bakeNodes.keys());
  const sortResult = topologicalSort(chipIds, bakeWires);
  if (!sortResult.ok) {
    return err({
      message: sortResult.error.message,
      cyclePath: sortResult.error.cyclePath,
    });
  }
  const topoOrder = sortResult.value;

  // Step 2: Analyze graph structure (no delay analysis)
  const analysis = analyzeGraph(topoOrder, bakeNodes, bakeWires);

  // Step 3: Build metadata
  const metadata = buildMetadata(topoOrder, bakeNodes, bakeWires, analysis);
  if (cpLayout) {
    metadata.cpLayout = cpLayout;
  }

  // Derive cpLayout from utility slot nodes if present (new system)
  if (!cpLayout) {
    const hasUtilitySlots = Array.from(bakeNodes.keys()).some(id => isUtilitySlotNode(id));
    if (hasUtilitySlots) {
      const layout: ('input' | 'output' | 'off')[] = [];
      for (let i = 0; i < 6; i++) {
        const slotId = `__cp_utility_${i}__`;
        const node = bakeNodes.get(slotId);
        if (!node) {
          layout.push('off');
        } else if (node.type === 'connection-input') {
          layout.push('input');
        } else {
          layout.push('output');
        }
      }
      metadata.cpLayout = layout;
    }
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
 */
export function reconstructFromMetadata(metadata: BakeMetadata): BakeResult {
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

  const wires: Wire[] = metadata.edges.map((edge, i) =>
    createWire(
      `baked-wire-${i}`,
      { chipId: edge.fromNodeId, portIndex: edge.fromPort, side: 'output' as const },
      { chipId: edge.toNodeId, portIndex: edge.toPort, side: 'input' as const },
    ),
  );

  const analysis = analyzeGraph(metadata.topoOrder, nodes, wires);
  const evaluate = buildClosure(nodes, analysis);

  return { evaluate, metadata };
}

// =============================================================================
// Graph analysis (replaces delay-calculator)
// =============================================================================

interface GraphAnalysis {
  portSources: Map<string, PortSource>;
  outputMappings: OutputMapping[];
  processingOrder: NodeId[];
  inputCount: number;
  outputCount: number;
}

/**
 * Analyze graph structure: determine port sources, output mappings,
 * and processing order. No delay computation.
 */
function analyzeGraph(
  topoOrder: NodeId[],
  nodes: ReadonlyMap<NodeId, NodeState>,
  wires: Wire[],
): GraphAnalysis {
  // Build wire lookup: target "chipId:portIndex" → wire
  const wireByTarget = new Map<string, Wire>();
  for (const wire of wires) {
    wireByTarget.set(`${wire.target.chipId}:${wire.target.portIndex}`, wire);
  }

  const portSources = new Map<string, PortSource>();
  const outputMappings: OutputMapping[] = [];
  const processingOrder: NodeId[] = [];

  let inputCount = 0;
  let outputCount = 0;

  for (const chipId of topoOrder) {
    const node = nodes.get(chipId);
    if (!node) continue;

    if (isConnectionInputNode(chipId)) {
      const cpIndex = getConnectionPointIndex(chipId);
      if (cpIndex >= inputCount) inputCount = cpIndex + 1;
      continue;
    }

    if (isConnectionOutputNode(chipId)) {
      const cpIndex = getConnectionPointIndex(chipId);
      if (cpIndex >= outputCount) outputCount = cpIndex + 1;

      const wire = wireByTarget.get(`${chipId}:0`);
      if (wire) {
        outputMappings.push({
          cpIndex,
          sourceNodeId: wire.source.chipId,
          sourcePort: wire.source.portIndex,
        });
      }
      continue;
    }

    // Utility slot nodes: treated like standard input/output CPs for baking
    if (isUtilitySlotNode(chipId)) {
      const slotIndex = getUtilitySlotIndex(chipId);
      if (node.type === 'connection-input') {
        // Utility input slots: use slot index directly as cpIndex
        if (slotIndex >= inputCount) inputCount = slotIndex + 1;
      } else if (node.type === 'connection-output') {
        // Utility output slots: use slot index directly as output index
        // Left outputs get indices 0-2, right outputs get indices 3-5 — no collision
        const outputIndex = slotIndex;
        if (outputIndex >= 0 && outputIndex >= outputCount) outputCount = outputIndex + 1;
        const wire = wireByTarget.get(`${chipId}:0`);
        if (wire) {
          outputMappings.push({
            cpIndex: outputIndex,
            sourceNodeId: wire.source.chipId,
            sourcePort: wire.source.portIndex,
          });
        }
      }
      continue;
    }

    // Processing node
    processingOrder.push(chipId);

    for (let portIndex = 0; portIndex < node.inputCount; portIndex++) {
      const wireKey = `${chipId}:${portIndex}`;
      const wire = wireByTarget.get(wireKey);

      if (!wire) {
        portSources.set(wireKey, { kind: 'none' });
        continue;
      }

      const sourceNodeId = wire.source.chipId;

      if (isConnectionInputNode(sourceNodeId)) {
        const cpIndex = getConnectionPointIndex(sourceNodeId);
        portSources.set(wireKey, { kind: 'cp', cpIndex });
      } else if (isUtilitySlotNode(sourceNodeId)) {
        // Utility input slot: slot index is the cpIndex
        const slotIndex = getUtilitySlotIndex(sourceNodeId);
        portSources.set(wireKey, { kind: 'cp', cpIndex: slotIndex });
      } else {
        portSources.set(wireKey, {
          kind: 'node',
          sourceNodeId,
          sourcePort: wire.source.portIndex,
        });
      }
    }
  }

  return {
    portSources,
    outputMappings,
    processingOrder,
    inputCount,
    outputCount,
  };
}

// =============================================================================
// Metadata
// =============================================================================

function buildMetadata(
  topoOrder: NodeId[],
  nodes: ReadonlyMap<NodeId, NodeState>,
  wires: Wire[],
  analysis: GraphAnalysis,
): BakeMetadata {
  const nodeConfigs: BakedNodeConfig[] = [];
  for (const chipId of topoOrder) {
    const node = nodes.get(chipId);
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
    fromNodeId: wire.source.chipId,
    fromPort: wire.source.portIndex,
    toNodeId: wire.target.chipId,
    toPort: wire.target.portIndex,
  }));

  return {
    topoOrder,
    nodeConfigs,
    edges,
    inputCount: analysis.inputCount,
    outputCount: analysis.outputCount,
  };
}

// =============================================================================
// Closure builder
// =============================================================================

/**
 * Evaluate a single processing node.
 */
function evaluateNodePure(
  type: string,
  inputs: number[],
  params: Record<string, number | string | boolean>,
  nodeState: NodeRuntimeState | undefined,
  tickIndex: number,
): number[] {
  const def = getNodeDefinition(type);
  if (!def) return [];

  return def.evaluate({
    inputs,
    params,
    state: nodeState,
    tickIndex,
  });
}

/**
 * Build the evaluate closure.
 *
 * Cycle-based: each call receives inputs directly, evaluates in topo order,
 * returns outputs. No circular buffers or wire delays.
 */
function buildClosure(
  nodes: ReadonlyMap<NodeId, NodeState>,
  analysis: GraphAnalysis,
): (inputs: number[]) => number[] {
  const {
    portSources,
    outputMappings,
    processingOrder,
    outputCount,
  } = analysis;

  // Build node specs for fast evaluation
  const nodeSpecs: NodeSpec[] = [];
  const nodeStates = new Map<NodeId, NodeRuntimeState>();

  for (const chipId of processingOrder) {
    const node = nodes.get(chipId);
    if (!node) continue;

    const inputSpecs: PortSource[] = [];
    for (let portIndex = 0; portIndex < node.inputCount; portIndex++) {
      const key = `${chipId}:${portIndex}`;
      inputSpecs.push(portSources.get(key) ?? { kind: 'none' as const });
    }

    nodeSpecs.push({
      id: chipId,
      type: node.type,
      params: node.params,
      inputSpecs,
      outputCount: node.outputCount,
    });

    const def = getNodeDefinition(node.type);
    if (def?.createState) {
      nodeStates.set(chipId, def.createState());
    }
  }

  // Pre-compute output mapping lookups
  const outputMap: OutputMapping[] = [];
  for (let i = 0; i < outputCount; i++) {
    const mapping = outputMappings.find((m) => m.cpIndex === i);
    outputMap.push(mapping ?? { cpIndex: i, sourceNodeId: '', sourcePort: 0 });
  }

  // Storage for node outputs, reused across calls
  const nodeOutputs = new Map<NodeId, number[]>();
  let tickIndex = 0;

  // The closure
  return function evaluate(inputs: number[]): number[] {
    nodeOutputs.clear();

    // Evaluate each processing node in topo order
    for (const spec of nodeSpecs) {
      const nodeInputs: number[] = [];

      for (const source of spec.inputSpecs) {
        if (source.kind === 'cp') {
          nodeInputs.push(source.cpIndex < inputs.length ? inputs[source.cpIndex] : 0);
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

    // Collect output CP values
    const result = new Array<number>(outputCount).fill(0);
    for (let i = 0; i < outputCount; i++) {
      const mapping = outputMap[i];
      if (mapping.sourceNodeId === '') continue;

      if (isConnectionPointNode(mapping.sourceNodeId)) {
        // Direct CP-to-CP: use input value directly
        const cpIndex = getConnectionPointIndex(mapping.sourceNodeId);
        if (cpIndex >= 0 && cpIndex < inputs.length) {
          result[i] = inputs[cpIndex];
        }
      } else {
        const outputs = nodeOutputs.get(mapping.sourceNodeId);
        result[i] = outputs ? (outputs[mapping.sourcePort] ?? 0) : 0;
      }
    }

    return result;
  };
}

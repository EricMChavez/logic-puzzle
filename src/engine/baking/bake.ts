import type { ChipId, ChipState, Path } from '../../shared/types/index.ts';
import { createPath } from '../../shared/types/index.ts';
import type { Result } from '../../shared/result/index.ts';
import { ok, err } from '../../shared/result/index.ts';
import { topologicalSort } from '../graph/topological-sort.ts';
import { getChipDefinition } from '../nodes/registry.ts';
import type { ChipRuntimeState } from '../nodes/framework.ts';
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
import type { BakeMetadata, BakeResult, BakeError, BakedEdge, BakedChipConfig } from './types.ts';

const log = createLogger('Bake');

/** Where a chip socket port gets its value from. */
type PortSource =
  | { kind: 'cp'; cpIndex: number }
  | { kind: 'chip'; sourceChipId: ChipId; sourcePort: number }
  | { kind: 'none' };

/** Mapping from an output CP to the chip/port that feeds it. */
interface OutputMapping {
  cpIndex: number;
  sourceChipId: ChipId;
  sourcePort: number;
}

/** Pre-computed spec for one chip in the closure. */
interface ChipSpec {
  id: ChipId;
  type: string;
  params: Record<string, number | string | boolean>;
  socketSpecs: PortSource[];
  plugCount: number;
}

/**
 * Classify bidirectional CPs by their wiring:
 * - Has outgoing wire (from output port) → 'input' (feeds signal into board)
 * - Has incoming wire (to input port) → 'output' (receives signal from board)
 * - Both → error
 * - Neither → 'off'
 */
function classifyBidirectionalCps(
  nodes: ReadonlyMap<ChipId, ChipState>,
  paths: Path[],
): Result<('input' | 'output' | 'off')[], BakeError> {
  const layout: ('input' | 'output' | 'off')[] = [];

  for (let i = 0; i < 6; i++) {
    const chipId = `__cp_bidir_${i}__`;
    if (!nodes.has(chipId)) {
      layout.push('off');
      continue;
    }

    const hasOutgoing = paths.some(w => w.source.chipId === chipId);
    const hasIncoming = paths.some(w => w.target.chipId === chipId);

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
  nodes: ReadonlyMap<ChipId, ChipState>,
  paths: Path[],
  cpLayout: ('input' | 'output' | 'off')[],
): { chips: Map<ChipId, ChipState>; paths: Path[] } {
  const newNodes = new Map<ChipId, ChipState>();
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

  const newPaths: Path[] = paths
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

  return { chips: newNodes, paths: newPaths };
}

/**
 * Bake a gameboard graph into a single evaluate closure.
 *
 * Cycle-based: each call to evaluate() processes one cycle.
 * No wire delay simulation. Memory chips provide 1-cycle delay.
 */
export function bakeGraph(
  nodes: ReadonlyMap<ChipId, ChipState>,
  paths: Path[],
): Result<BakeResult, BakeError> {
  // Handle bidirectional CPs (utility chip editing)
  const hasBidirCps = Array.from(nodes.keys()).some(id => isBidirectionalCpNode(id));
  let cpLayout: ('input' | 'output' | 'off')[] | undefined;
  let bakeNodes = nodes;
  let bakePaths = paths;

  if (hasBidirCps) {
    const classifyResult = classifyBidirectionalCps(nodes, paths);
    if (!classifyResult.ok) {
      return err({ message: classifyResult.error.message });
    }
    cpLayout = classifyResult.value;
    const transformed = transformBidirToStandard(nodes, paths, cpLayout);
    bakeNodes = transformed.chips;
    bakePaths = transformed.paths;
  }

  // Step 1: Topological sort
  const chipIds = Array.from(bakeNodes.keys());
  const sortResult = topologicalSort(chipIds, bakePaths);
  if (!sortResult.ok) {
    return err({
      message: sortResult.error.message,
      cyclePath: sortResult.error.cyclePath,
    });
  }
  const topoOrder = sortResult.value;

  // Step 2: Analyze graph structure (no delay analysis)
  const analysis = analyzeGraph(topoOrder, bakeNodes, bakePaths);

  // Step 3: Build metadata
  const metadata = buildMetadata(topoOrder, bakeNodes, bakePaths, analysis);
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
    socketCount: analysis.socketCount,
    plugCount: analysis.plugCount,
    processingChips: analysis.processingOrder.length,
  });

  return ok({ evaluate, metadata });
}

/**
 * Reconstruct a BakeResult from serialized metadata.
 */
export function reconstructFromMetadata(metadata: BakeMetadata): BakeResult {
  const nodes = new Map<ChipId, ChipState>();
  for (const config of metadata.chipConfigs) {
    nodes.set(config.id, {
      id: config.id,
      type: config.type,
      position: { col: 0, row: 0 },
      params: { ...config.params },
      socketCount: config.socketCount,
      plugCount: config.plugCount,
    });
  }

  for (let i = 0; i < metadata.socketCount; i++) {
    const cpNode = createConnectionPointNode('input', i);
    if (!nodes.has(cpNode.id)) {
      nodes.set(cpNode.id, cpNode);
    }
  }
  for (let i = 0; i < metadata.plugCount; i++) {
    const cpNode = createConnectionPointNode('output', i);
    if (!nodes.has(cpNode.id)) {
      nodes.set(cpNode.id, cpNode);
    }
  }

  const paths: Path[] = metadata.edges.map((edge, i) =>
    createPath(
      `baked-path-${i}`,
      { chipId: edge.fromChipId, portIndex: edge.fromPort, side: 'plug' as const },
      { chipId: edge.toChipId, portIndex: edge.toPort, side: 'socket' as const },
    ),
  );

  const analysis = analyzeGraph(metadata.topoOrder, nodes, paths);
  const evaluate = buildClosure(nodes, analysis);

  return { evaluate, metadata };
}

// =============================================================================
// Graph analysis (replaces delay-calculator)
// =============================================================================

interface GraphAnalysis {
  portSources: Map<string, PortSource>;
  outputMappings: OutputMapping[];
  processingOrder: ChipId[];
  socketCount: number;
  plugCount: number;
}

/**
 * Analyze graph structure: determine port sources, output mappings,
 * and processing order. No delay computation.
 */
function analyzeGraph(
  topoOrder: ChipId[],
  nodes: ReadonlyMap<ChipId, ChipState>,
  paths: Path[],
): GraphAnalysis {
  // Build path lookup: target "chipId:portIndex" → path
  const pathByTarget = new Map<string, Path>();
  for (const path of paths) {
    pathByTarget.set(`${path.target.chipId}:${path.target.portIndex}`, path);
  }

  const portSources = new Map<string, PortSource>();
  const outputMappings: OutputMapping[] = [];
  const processingOrder: ChipId[] = [];

  let socketCount = 0;
  let plugCount = 0;

  // Pre-pass: build sequential index remapping for utility slots.
  // Slot indices (0-5) can have gaps; we need dense port indices (0, 1, 2...).
  const utilitySlotToSocketIndex = new Map<number, number>();
  const utilitySlotToPlugIndex = new Map<number, number>();
  {
    // Collect and sort by slot index to ensure stable ordering
    const socketSlots: number[] = [];
    const plugSlots: number[] = [];
    for (const chipId of topoOrder) {
      const node = nodes.get(chipId);
      if (!node || !isUtilitySlotNode(chipId)) continue;
      const slotIndex = getUtilitySlotIndex(chipId);
      if (node.type === 'connection-input') socketSlots.push(slotIndex);
      else if (node.type === 'connection-output') plugSlots.push(slotIndex);
    }
    socketSlots.sort((a, b) => a - b);
    plugSlots.sort((a, b) => a - b);
    for (let i = 0; i < socketSlots.length; i++) utilitySlotToSocketIndex.set(socketSlots[i], i);
    for (let i = 0; i < plugSlots.length; i++) utilitySlotToPlugIndex.set(plugSlots[i], i);
  }

  for (const chipId of topoOrder) {
    const node = nodes.get(chipId);
    if (!node) continue;

    if (isConnectionInputNode(chipId)) {
      const cpIndex = getConnectionPointIndex(chipId);
      if (cpIndex >= socketCount) socketCount = cpIndex + 1;
      continue;
    }

    if (isConnectionOutputNode(chipId)) {
      const cpIndex = getConnectionPointIndex(chipId);
      if (cpIndex >= plugCount) plugCount = cpIndex + 1;

      const path = pathByTarget.get(`${chipId}:0`);
      if (path) {
        outputMappings.push({
          cpIndex,
          sourceChipId: path.source.chipId,
          sourcePort: path.source.portIndex,
        });
      }
      continue;
    }

    // Utility slot nodes: remap slot indices to sequential port indices
    if (isUtilitySlotNode(chipId)) {
      const slotIndex = getUtilitySlotIndex(chipId);
      if (node.type === 'connection-input') {
        const seqIndex = utilitySlotToSocketIndex.get(slotIndex) ?? 0;
        if (seqIndex >= socketCount) socketCount = seqIndex + 1;
      } else if (node.type === 'connection-output') {
        const seqIndex = utilitySlotToPlugIndex.get(slotIndex) ?? 0;
        if (seqIndex >= plugCount) plugCount = seqIndex + 1;
        const path = pathByTarget.get(`${chipId}:0`);
        if (path) {
          outputMappings.push({
            cpIndex: seqIndex,
            sourceChipId: path.source.chipId,
            sourcePort: path.source.portIndex,
          });
        }
      }
      continue;
    }

    // Processing chip
    processingOrder.push(chipId);

    for (let portIndex = 0; portIndex < node.socketCount; portIndex++) {
      const pathKey = `${chipId}:${portIndex}`;
      const path = pathByTarget.get(pathKey);

      if (!path) {
        portSources.set(pathKey, { kind: 'none' });
        continue;
      }

      const sourceChipId = path.source.chipId;

      if (isConnectionInputNode(sourceChipId)) {
        const cpIndex = getConnectionPointIndex(sourceChipId);
        portSources.set(pathKey, { kind: 'cp', cpIndex });
      } else if (isUtilitySlotNode(sourceChipId)) {
        // Utility input slot: use remapped sequential index
        const slotIndex = getUtilitySlotIndex(sourceChipId);
        const seqIndex = utilitySlotToSocketIndex.get(slotIndex) ?? 0;
        portSources.set(pathKey, { kind: 'cp', cpIndex: seqIndex });
      } else {
        portSources.set(pathKey, {
          kind: 'chip',
          sourceChipId,
          sourcePort: path.source.portIndex,
        });
      }
    }
  }

  return {
    portSources,
    outputMappings,
    processingOrder,
    socketCount,
    plugCount,
  };
}

// =============================================================================
// Metadata
// =============================================================================

function buildMetadata(
  topoOrder: ChipId[],
  nodes: ReadonlyMap<ChipId, ChipState>,
  paths: Path[],
  analysis: GraphAnalysis,
): BakeMetadata {
  const chipConfigs: BakedChipConfig[] = [];
  for (const chipId of topoOrder) {
    const node = nodes.get(chipId);
    if (!node) continue;
    chipConfigs.push({
      id: node.id,
      type: node.type,
      params: { ...node.params } as Record<string, number | string | boolean>,
      socketCount: node.socketCount,
      plugCount: node.plugCount,
    });
  }

  const edges: BakedEdge[] = paths.map((path) => ({
    fromChipId: path.source.chipId,
    fromPort: path.source.portIndex,
    toChipId: path.target.chipId,
    toPort: path.target.portIndex,
  }));

  return {
    topoOrder,
    chipConfigs,
    edges,
    socketCount: analysis.socketCount,
    plugCount: analysis.plugCount,
  };
}

// =============================================================================
// Closure builder
// =============================================================================

/**
 * Evaluate a single processing chip.
 */
function evaluateChipPure(
  type: string,
  inputs: number[],
  params: Record<string, number | string | boolean>,
  chipState: ChipRuntimeState | undefined,
  tickIndex: number,
): number[] {
  const def = getChipDefinition(type);
  if (!def) return [];

  return def.evaluate({
    inputs,
    params,
    state: chipState,
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
  nodes: ReadonlyMap<ChipId, ChipState>,
  analysis: GraphAnalysis,
): (inputs: number[]) => number[] {
  const {
    portSources,
    outputMappings,
    processingOrder,
    plugCount,
  } = analysis;

  // Build chip specs for fast evaluation
  const chipSpecs: ChipSpec[] = [];
  const chipStates = new Map<ChipId, ChipRuntimeState>();

  for (const chipId of processingOrder) {
    const node = nodes.get(chipId);
    if (!node) continue;

    const socketSpecs: PortSource[] = [];
    for (let portIndex = 0; portIndex < node.socketCount; portIndex++) {
      const key = `${chipId}:${portIndex}`;
      socketSpecs.push(portSources.get(key) ?? { kind: 'none' as const });
    }

    chipSpecs.push({
      id: chipId,
      type: node.type,
      params: node.params as Record<string, number | string | boolean>,
      socketSpecs,
      plugCount: node.plugCount,
    });

    const def = getChipDefinition(node.type);
    if (def?.createState) {
      chipStates.set(chipId, def.createState());
    }
  }

  // Pre-compute output mapping lookups
  const outputMap: OutputMapping[] = [];
  for (let i = 0; i < plugCount; i++) {
    const mapping = outputMappings.find((m) => m.cpIndex === i);
    outputMap.push(mapping ?? { cpIndex: i, sourceChipId: '', sourcePort: 0 });
  }

  // Storage for chip outputs, reused across calls
  const chipOutputs = new Map<ChipId, number[]>();
  let tickIndex = 0;

  // The closure
  return function evaluate(inputs: number[]): number[] {
    chipOutputs.clear();

    // Evaluate each processing chip in topo order
    for (const spec of chipSpecs) {
      const chipInputs: number[] = [];

      for (const source of spec.socketSpecs) {
        if (source.kind === 'cp') {
          chipInputs.push(source.cpIndex < inputs.length ? inputs[source.cpIndex] : 0);
        } else if (source.kind === 'chip') {
          const outputs = chipOutputs.get(source.sourceChipId);
          chipInputs.push(outputs ? (outputs[source.sourcePort] ?? 0) : 0);
        } else {
          chipInputs.push(0);
        }
      }

      const chipState = chipStates.get(spec.id);
      const outputs = evaluateChipPure(spec.type, chipInputs, spec.params, chipState, tickIndex);
      chipOutputs.set(spec.id, outputs);
    }

    tickIndex++;

    // Collect output CP values
    const result = new Array<number>(plugCount).fill(0);
    for (let i = 0; i < plugCount; i++) {
      const mapping = outputMap[i];
      if (mapping.sourceChipId === '') continue;

      if (isConnectionPointNode(mapping.sourceChipId)) {
        // Direct CP-to-CP: use input value directly
        const cpIndex = getConnectionPointIndex(mapping.sourceChipId);
        if (cpIndex >= 0 && cpIndex < inputs.length) {
          result[i] = inputs[cpIndex];
        }
      } else {
        const outputs = chipOutputs.get(mapping.sourceChipId);
        result[i] = outputs ? (outputs[mapping.sourcePort] ?? 0) : 0;
      }
    }

    return result;
  };
}

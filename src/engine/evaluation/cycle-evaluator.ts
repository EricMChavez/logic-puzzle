/**
 * Cycle-based graph evaluator.
 *
 * Evaluates the entire signal graph for N cycles, producing
 * a complete set of output samples. No time-domain simulation —
 * the graph settles instantly each cycle.
 */

import type { NodeId, NodeState, Wire } from '../../shared/types/index.ts';
import type { Result } from '../../shared/result/index.ts';
import { ok, err } from '../../shared/result/index.ts';
import { topologicalSort } from '../graph/topological-sort.ts';
import { getNodeDefinition } from '../nodes/registry.ts';
import type { NodeRuntimeState } from '../nodes/framework.ts';
import { clamp } from '../../shared/math/index.ts';
import { KNOB_NODES } from '../../shared/constants/index.ts';
import {
  isConnectionPointNode,
  isConnectionInputNode,
  isConnectionOutputNode,
  getConnectionPointIndex,
  isCreativeSlotNode,
  getCreativeSlotIndex,
} from '../../puzzle/connection-point-nodes.ts';

// =============================================================================
// Types
// =============================================================================

/** Results of evaluating all cycles. */
export interface CycleResults {
  /** Output values per cycle: [cycleIndex][outputPortIndex] */
  outputValues: number[][];
  /** Signal value per wire per cycle: wireId → number[] */
  wireValues: Map<string, number[]>;
  /** Per-node outputs per cycle: nodeId → [cycleIndex][outputPortIndex] */
  nodeOutputs: Map<string, number[][]>;
  /** Final cross-cycle state values (for debugging) */
  crossCycleState: Map<string, number>;
  /** Non-CP nodes in topological evaluation order */
  processingOrder: NodeId[];
}

/** Error from cycle evaluation. */
export interface CycleEvalError {
  message: string;
  cyclePath?: NodeId[];
}

// =============================================================================
// Internal types
// =============================================================================

/** Classification of a parameter wire as same-cycle or cross-cycle. */
type ParamWireKind = 'same-cycle' | 'cross-cycle';

interface ParamWireInfo {
  wire: Wire;
  kind: ParamWireKind;
}

// =============================================================================
// Main evaluator
// =============================================================================

/**
 * Evaluate the graph for `cycleCount` cycles.
 *
 * @param nodes       All nodes on the board (including CP virtual nodes)
 * @param wires       All wires on the board
 * @param portConstants  Map of "nodeId:portIndex" → constant value for unconnected ports
 * @param inputGenerator  Produces input CP values for each cycle
 * @param cycleCount  Number of cycles to evaluate (default 256)
 */
export function evaluateAllCycles(
  nodes: ReadonlyMap<NodeId, NodeState>,
  wires: Wire[],
  portConstants: Map<string, number>,
  inputGenerator: (cycleIndex: number) => number[],
  cycleCount: number = 256,
): Result<CycleResults, CycleEvalError> {
  // ─── Separate signal wires from parameter wires ───────────────────────────
  const signalWires: Wire[] = [];
  const parameterWires: Wire[] = [];

  for (const wire of wires) {
    if (isParameterWire(wire, nodes)) {
      parameterWires.push(wire);
    } else {
      signalWires.push(wire);
    }
  }

  // ─── Topological sort on signal wires only ────────────────────────────────
  const nodeIds = Array.from(nodes.keys());
  const sortResult = topologicalSort(nodeIds, signalWires);
  if (!sortResult.ok) {
    return err({
      message: sortResult.error.message,
      cyclePath: sortResult.error.cyclePath,
    });
  }
  const topoOrder = sortResult.value;

  // Build topo index map for parameter wire classification
  const topoIndex = new Map<NodeId, number>();
  for (let i = 0; i < topoOrder.length; i++) {
    topoIndex.set(topoOrder[i], i);
  }

  // ─── Classify parameter wires ─────────────────────────────────────────────
  const paramWireInfos: ParamWireInfo[] = parameterWires.map((wire) => {
    const srcIdx = topoIndex.get(wire.source.nodeId) ?? -1;
    const tgtIdx = topoIndex.get(wire.target.nodeId) ?? -1;
    const kind: ParamWireKind = srcIdx < tgtIdx ? 'same-cycle' : 'cross-cycle';
    return { wire, kind };
  });

  // ─── Build wire lookup: target "nodeId:portIndex" → wire ──────────────────
  const wireByTarget = new Map<string, Wire>();
  for (const wire of signalWires) {
    wireByTarget.set(`${wire.target.nodeId}:${wire.target.portIndex}`, wire);
  }

  // Parameter wire targets override signal wires for those specific ports
  for (const { wire } of paramWireInfos) {
    wireByTarget.set(`${wire.target.nodeId}:${wire.target.portIndex}`, wire);
  }

  // ─── Identify input/output CPs ───────────────────────────────────────────
  let inputCount = 0;
  let outputCount = 0;
  const outputCpSources = new Map<number, { nodeId: NodeId; portIndex: number }>();

  for (const nodeId of nodeIds) {
    if (isCreativeSlotNode(nodeId)) {
      const node = nodes.get(nodeId);
      const slotIndex = getCreativeSlotIndex(nodeId);
      if (node?.type === 'connection-input') {
        // Creative input slot: use slot index (0-2) as cpIndex
        if (slotIndex >= 0 && slotIndex + 1 > inputCount) inputCount = slotIndex + 1;
      } else if (node?.type === 'connection-output') {
        // Creative output slot: derive fixed output index from slot position.
        // Slots 3-5 map to output indices 0-2, matching meter cpIndex expectations.
        const outputIndex = slotIndex - 3;
        if (outputIndex >= 0 && outputIndex + 1 > outputCount) outputCount = outputIndex + 1;
        const wire = wireByTarget.get(`${nodeId}:0`);
        if (wire) {
          outputCpSources.set(outputIndex, {
            nodeId: wire.source.nodeId,
            portIndex: wire.source.portIndex,
          });
        }
      }
    } else if (isConnectionInputNode(nodeId)) {
      const cpIndex = getConnectionPointIndex(nodeId);
      if (cpIndex >= 0 && cpIndex + 1 > inputCount) inputCount = cpIndex + 1;
    } else if (isConnectionOutputNode(nodeId)) {
      const cpIndex = getConnectionPointIndex(nodeId);
      if (cpIndex >= 0 && cpIndex + 1 > outputCount) outputCount = cpIndex + 1;
      // Find what feeds this output CP
      const wire = wireByTarget.get(`${nodeId}:0`);
      if (wire) {
        outputCpSources.set(cpIndex, {
          nodeId: wire.source.nodeId,
          portIndex: wire.source.portIndex,
        });
      }
    }
  }

  // ─── Build processing order (non-CP nodes in topo order) ──────────────────
  const processingOrder: NodeId[] = [];
  for (const nodeId of topoOrder) {
    if (!isConnectionPointNode(nodeId) && !isCreativeSlotNode(nodeId)) {
      processingOrder.push(nodeId);
    }
  }

  // ─── Create runtime state for stateful nodes ─────────────────────────────
  const nodeStates = new Map<NodeId, NodeRuntimeState>();
  for (const nodeId of processingOrder) {
    const node = nodes.get(nodeId);
    if (!node) continue;
    const def = getNodeDefinition(node.type);
    if (def?.createState) {
      nodeStates.set(nodeId, def.createState());
    }
  }

  // ─── Cross-cycle values storage ───────────────────────────────────────────
  const crossCycleValues = new Map<string, number>();

  // ─── Output storage ──────────────────────────────────────────────────────
  const outputValues: number[][] = [];
  const wireValuesMap = new Map<string, number[]>();
  const nodeOutputsMap = new Map<string, number[][]>();

  // Initialize wire values arrays
  for (const wire of wires) {
    wireValuesMap.set(wire.id, []);
  }
  // Initialize node outputs arrays
  for (const nodeId of processingOrder) {
    nodeOutputsMap.set(nodeId, []);
  }

  // ─── Per-node output cache for current cycle ─────────────────────────────
  const currentOutputs = new Map<NodeId, number[]>();

  // Map from input CP nodeId → cpIndex for fast lookup
  const inputCpIndexMap = new Map<NodeId, number>();
  for (const nodeId of nodeIds) {
    if (isCreativeSlotNode(nodeId)) {
      const node = nodes.get(nodeId);
      if (node?.type === 'connection-input') {
        const slotIndex = getCreativeSlotIndex(nodeId);
        if (slotIndex >= 0) inputCpIndexMap.set(nodeId, slotIndex);
      }
    } else if (isConnectionInputNode(nodeId)) {
      const idx = getConnectionPointIndex(nodeId);
      if (idx >= 0) inputCpIndexMap.set(nodeId, idx);
    }
  }

  // Initialize node outputs arrays for input CP nodes (so render-loop can read their signals)
  for (const nodeId of inputCpIndexMap.keys()) {
    nodeOutputsMap.set(nodeId, []);
  }

  // ─── Evaluate cycles ─────────────────────────────────────────────────────
  for (let cycle = 0; cycle < cycleCount; cycle++) {
    const inputValues = inputGenerator(cycle);
    currentOutputs.clear();

    // Store input CP outputs (they "output" the input signal)
    for (const [nodeId, cpIndex] of inputCpIndexMap) {
      const value = cpIndex < inputValues.length ? inputValues[cpIndex] : 0;
      currentOutputs.set(nodeId, [value]);
      nodeOutputsMap.get(nodeId)!.push([value]);
    }

    // Evaluate each processing node in topological order
    for (const nodeId of processingOrder) {
      const node = nodes.get(nodeId);
      if (!node) continue;

      const def = getNodeDefinition(node.type);
      if (!def) continue;

      // Gather inputs for this node
      const nodeInputs: number[] = [];
      for (let portIndex = 0; portIndex < node.inputCount; portIndex++) {
        const key = `${nodeId}:${portIndex}`;
        const wire = wireByTarget.get(key);

        if (!wire) {
          // No wire — use port constant or default 0
          nodeInputs.push(portConstants.get(key) ?? 0);
          continue;
        }

        // Check if this is a cross-cycle parameter wire
        const paramInfo = paramWireInfos.find(
          (p) => p.wire.id === wire.id,
        );

        if (paramInfo && paramInfo.kind === 'cross-cycle') {
          // Use stored value from previous cycle
          const crossKey = `${wire.source.nodeId}:${wire.source.portIndex}`;
          nodeInputs.push(crossCycleValues.get(crossKey) ?? portConstants.get(key) ?? 0);
        } else {
          // Same-cycle signal or same-cycle parameter: source already evaluated
          const sourceOutputs = currentOutputs.get(wire.source.nodeId);
          if (sourceOutputs) {
            nodeInputs.push(sourceOutputs[wire.source.portIndex] ?? 0);
          } else {
            nodeInputs.push(portConstants.get(key) ?? 0);
          }
        }
      }

      // Evaluate
      const nodeState = nodeStates.get(nodeId);
      const outputs = def.evaluate({
        inputs: nodeInputs,
        params: node.params as Record<string, number | string | boolean>,
        state: nodeState,
        tickIndex: cycle,
      });

      // Clamp all outputs
      const clampedOutputs = outputs.map((v) => clamp(v));
      currentOutputs.set(nodeId, clampedOutputs);

      // Record node outputs
      nodeOutputsMap.get(nodeId)!.push([...clampedOutputs]);
    }

    // Update cross-cycle values for next cycle
    for (const { wire, kind } of paramWireInfos) {
      if (kind === 'cross-cycle') {
        const crossKey = `${wire.source.nodeId}:${wire.source.portIndex}`;
        const sourceOutputs = currentOutputs.get(wire.source.nodeId);
        if (sourceOutputs) {
          crossCycleValues.set(crossKey, sourceOutputs[wire.source.portIndex] ?? 0);
        }
      }
    }

    // Record wire values at this cycle
    for (const wire of wires) {
      const sourceOutputs = currentOutputs.get(wire.source.nodeId);
      const value = sourceOutputs ? (sourceOutputs[wire.source.portIndex] ?? 0) : 0;
      wireValuesMap.get(wire.id)!.push(value);
    }

    // Collect output CP values
    const cycleOutputs = new Array<number>(outputCount).fill(0);
    for (let i = 0; i < outputCount; i++) {
      const source = outputCpSources.get(i);
      if (source) {
        const sourceOutputs = currentOutputs.get(source.nodeId);
        if (sourceOutputs) {
          cycleOutputs[i] = sourceOutputs[source.portIndex] ?? 0;
        }
      }
    }
    outputValues.push(cycleOutputs);
  }

  return ok({
    outputValues,
    wireValues: wireValuesMap,
    nodeOutputs: nodeOutputsMap,
    crossCycleState: crossCycleValues,
    processingOrder,
  });
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Determine if a wire is a "parameter wire" (targets a knob port).
 */
function isParameterWire(wire: Wire, nodes: ReadonlyMap<NodeId, NodeState>): boolean {
  const targetNode = nodes.get(wire.target.nodeId);
  if (!targetNode) return false;

  const knobConfig = KNOB_NODES[targetNode.type];
  if (!knobConfig) return false;

  return wire.target.portIndex === knobConfig.portIndex;
}

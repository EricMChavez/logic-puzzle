/**
 * Cycle-based graph evaluator.
 *
 * Evaluates the entire signal graph for N cycles, producing
 * a complete set of output samples. No time-domain simulation —
 * the graph settles instantly each cycle.
 *
 * Uses a two-pass approach for seamless looping:
 * - Pass 0 (warm-up): runs all cycles to establish steady-state.
 *   Memory nodes and cross-cycle parameter wires reach their
 *   wrap-around values (cycle 0's "previous" = cycle N-1's value).
 * - Pass 1 (recording): re-runs all cycles, now recording results.
 *   This eliminates the zero-glitch on cycle 0.
 */

import type { NodeId, NodeState, Wire } from '../../shared/types/index.ts';
import type { Result } from '../../shared/result/index.ts';
import { ok, err } from '../../shared/result/index.ts';
import { topologicalSortWithDepths } from '../graph/topological-sort.ts';
import { computeLiveNodes } from '../graph/liveness.ts';
import { getNodeDefinition } from '../nodes/registry.ts';
import type { NodeRuntimeState } from '../nodes/framework.ts';
import { clamp } from '../../shared/math/index.ts';
import { getKnobConfig } from '../nodes/framework.ts';
import {
  isConnectionPointNode,
  isConnectionInputNode,
  isConnectionOutputNode,
  getConnectionPointIndex,
  isCreativeSlotNode,
  getCreativeSlotIndex,
  isUtilitySlotNode,
  getUtilitySlotIndex,
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
  /** Per-node outputs per cycle: chipId → [cycleIndex][outputPortIndex] */
  nodeOutputs: Map<string, number[][]>;
  /** Final cross-cycle state values (for debugging) */
  crossCycleState: Map<string, number>;
  /** Non-CP nodes in topological evaluation order */
  processingOrder: NodeId[];
  /** Depth (longest path from roots) for all nodes including CPs */
  nodeDepths: Map<NodeId, number>;
  /** Maximum depth across all nodes */
  maxDepth: number;
  /** Set of node IDs reachable from input sources (live nodes) */
  liveNodeIds: ReadonlySet<NodeId>;
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
 * @param portConstants  Map of "chipId:portIndex" → constant value for unconnected ports
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
  const chipIds = Array.from(nodes.keys());
  const sortResult = topologicalSortWithDepths(chipIds, signalWires);
  if (!sortResult.ok) {
    return err({
      message: sortResult.error.message,
      cyclePath: sortResult.error.cyclePath,
    });
  }
  const { order: topoOrder, depths: nodeDepths, maxDepth } = sortResult.value;

  // ─── Classify parameter wires using depth comparison ──────────────────────
  const paramWireInfos: ParamWireInfo[] = parameterWires.map((wire) => {
    const srcDepth = nodeDepths.get(wire.source.chipId) ?? 0;
    const tgtDepth = nodeDepths.get(wire.target.chipId) ?? 0;
    const kind: ParamWireKind = srcDepth < tgtDepth ? 'same-cycle' : 'cross-cycle';
    return { wire, kind };
  });

  // ─── Build wire lookup: target "chipId:portIndex" → wire ──────────────────
  const wireByTarget = new Map<string, Wire>();
  for (const wire of signalWires) {
    wireByTarget.set(`${wire.target.chipId}:${wire.target.portIndex}`, wire);
  }

  // Parameter wire targets override signal wires for those specific ports
  for (const { wire } of paramWireInfos) {
    wireByTarget.set(`${wire.target.chipId}:${wire.target.portIndex}`, wire);
  }

  // ─── Identify input/output CPs ───────────────────────────────────────────
  let inputCount = 0;
  let outputCount = 0;
  const outputCpSources = new Map<number, { chipId: NodeId; portIndex: number }>();

  for (const chipId of chipIds) {
    if (isCreativeSlotNode(chipId)) {
      const node = nodes.get(chipId);
      const slotIndex = getCreativeSlotIndex(chipId);
      if (node?.type === 'connection-input') {
        // Creative input slot: use slot index (0-2) as cpIndex
        if (slotIndex >= 0 && slotIndex + 1 > inputCount) inputCount = slotIndex + 1;
      } else if (node?.type === 'connection-output') {
        // Creative output slot: use slot index directly as output index.
        // Left outputs (0-2) and right outputs (3-5) each get unique indices.
        const outputIndex = slotIndex;
        if (outputIndex >= 0 && outputIndex + 1 > outputCount) outputCount = outputIndex + 1;
        const wire = wireByTarget.get(`${chipId}:0`);
        if (wire) {
          outputCpSources.set(outputIndex, {
            chipId: wire.source.chipId,
            portIndex: wire.source.portIndex,
          });
        }
      }
    } else if (isUtilitySlotNode(chipId)) {
      const node = nodes.get(chipId);
      const slotIndex = getUtilitySlotIndex(chipId);
      if (node?.type === 'connection-input') {
        // Utility input slot: use slot index directly as cpIndex
        if (slotIndex >= 0 && slotIndex + 1 > inputCount) inputCount = slotIndex + 1;
      } else if (node?.type === 'connection-output') {
        // Utility output slot: use slot index directly as output index
        // Left outputs get indices 0-2, right outputs get indices 3-5 — no collision
        const outputIndex = slotIndex;
        if (outputIndex >= 0 && outputIndex + 1 > outputCount) outputCount = outputIndex + 1;
        const wire = wireByTarget.get(`${chipId}:0`);
        if (wire) {
          outputCpSources.set(outputIndex, {
            chipId: wire.source.chipId,
            portIndex: wire.source.portIndex,
          });
        }
      }
    } else if (isConnectionInputNode(chipId)) {
      const cpIndex = getConnectionPointIndex(chipId);
      if (cpIndex >= 0 && cpIndex + 1 > inputCount) inputCount = cpIndex + 1;
    } else if (isConnectionOutputNode(chipId)) {
      const cpIndex = getConnectionPointIndex(chipId);
      if (cpIndex >= 0 && cpIndex + 1 > outputCount) outputCount = cpIndex + 1;
      // Find what feeds this output CP
      const wire = wireByTarget.get(`${chipId}:0`);
      if (wire) {
        outputCpSources.set(cpIndex, {
          chipId: wire.source.chipId,
          portIndex: wire.source.portIndex,
        });
      }
    }
  }

  // ─── Build processing order (non-CP nodes in topo order) ──────────────────
  const processingOrder: NodeId[] = [];
  for (const chipId of topoOrder) {
    if (!isConnectionPointNode(chipId) && !isCreativeSlotNode(chipId)) {
      processingOrder.push(chipId);
    }
  }

  // ─── Create runtime state for stateful nodes ─────────────────────────────
  const nodeStates = new Map<NodeId, NodeRuntimeState>();
  for (const chipId of processingOrder) {
    const node = nodes.get(chipId);
    if (!node) continue;
    const def = getNodeDefinition(node.type);
    if (def?.createState) {
      nodeStates.set(chipId, def.createState());
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
  for (const chipId of processingOrder) {
    nodeOutputsMap.set(chipId, []);
  }

  // ─── Per-node output cache for current cycle ─────────────────────────────
  const currentOutputs = new Map<NodeId, number[]>();

  // Map from input CP chipId → cpIndex for fast lookup
  const inputCpIndexMap = new Map<NodeId, number>();
  for (const chipId of chipIds) {
    if (isCreativeSlotNode(chipId)) {
      const node = nodes.get(chipId);
      if (node?.type === 'connection-input') {
        const slotIndex = getCreativeSlotIndex(chipId);
        if (slotIndex >= 0) inputCpIndexMap.set(chipId, slotIndex);
      }
    } else if (isUtilitySlotNode(chipId)) {
      const node = nodes.get(chipId);
      if (node?.type === 'connection-input') {
        const slotIndex = getUtilitySlotIndex(chipId);
        if (slotIndex >= 0) inputCpIndexMap.set(chipId, slotIndex);
      }
    } else if (isConnectionInputNode(chipId)) {
      const idx = getConnectionPointIndex(chipId);
      if (idx >= 0) inputCpIndexMap.set(chipId, idx);
    }
  }

  // Initialize node outputs arrays for input CP nodes (so render-loop can read their signals)
  for (const chipId of inputCpIndexMap.keys()) {
    nodeOutputsMap.set(chipId, []);
  }

  // Compute forward-reachable (live) nodes from input sources
  const liveNodeIds = computeLiveNodes(wires, new Set(inputCpIndexMap.keys()));

  // ─── Evaluate cycles (two-pass for seamless looping) ─────────────────────
  // Pass 0: warm-up — establish steady-state for Memory nodes and cross-cycle
  //         parameter wires. No results are recorded.
  // Pass 1: recording — re-run with warmed-up state, record all results.
  for (let pass = 0; pass < 2; pass++) {
    const recording = pass === 1;

    for (let cycle = 0; cycle < cycleCount; cycle++) {
      const inputValues = inputGenerator(cycle);
      currentOutputs.clear();

      // Store input CP outputs (they "output" the input signal)
      for (const [chipId, cpIndex] of inputCpIndexMap) {
        const value = cpIndex < inputValues.length ? inputValues[cpIndex] : 0;
        currentOutputs.set(chipId, [value]);
        if (recording) nodeOutputsMap.get(chipId)!.push([value]);
      }

      // Evaluate each processing node in topological order
      for (const chipId of processingOrder) {
        const node = nodes.get(chipId);
        if (!node) continue;

        // Skip non-live nodes — record zero outputs to keep arrays consistent
        if (!liveNodeIds.has(chipId)) {
          const zeroOutputs = new Array(node.outputCount).fill(0);
          currentOutputs.set(chipId, zeroOutputs);
          if (recording) nodeOutputsMap.get(chipId)!.push(zeroOutputs);
          continue;
        }

        const def = getNodeDefinition(node.type);
        if (!def) continue;

        // Gather inputs for this node
        const nodeInputs: number[] = [];
        for (let portIndex = 0; portIndex < node.inputCount; portIndex++) {
          const key = `${chipId}:${portIndex}`;
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
            const crossKey = `${wire.source.chipId}:${wire.source.portIndex}`;
            nodeInputs.push(crossCycleValues.get(crossKey) ?? portConstants.get(key) ?? 0);
          } else {
            // Same-cycle signal or same-cycle parameter: source already evaluated
            const sourceOutputs = currentOutputs.get(wire.source.chipId);
            if (sourceOutputs) {
              nodeInputs.push(sourceOutputs[wire.source.portIndex] ?? 0);
            } else {
              nodeInputs.push(portConstants.get(key) ?? 0);
            }
          }
        }

        // Evaluate
        const nodeState = nodeStates.get(chipId);
        const outputs = def.evaluate({
          inputs: nodeInputs,
          params: node.params as Record<string, number | string | boolean>,
          state: nodeState,
          tickIndex: cycle,
        });

        // Clamp all outputs
        const clampedOutputs = outputs.map((v) => clamp(v));
        currentOutputs.set(chipId, clampedOutputs);

        // Record node outputs
        if (recording) nodeOutputsMap.get(chipId)!.push([...clampedOutputs]);
      }

      // Update cross-cycle values for next cycle
      for (const { wire, kind } of paramWireInfos) {
        if (kind === 'cross-cycle') {
          const crossKey = `${wire.source.chipId}:${wire.source.portIndex}`;
          const sourceOutputs = currentOutputs.get(wire.source.chipId);
          if (sourceOutputs) {
            crossCycleValues.set(crossKey, sourceOutputs[wire.source.portIndex] ?? 0);
          }
        }
      }

      // Record wire values at this cycle
      if (recording) {
        for (const wire of wires) {
          const sourceOutputs = currentOutputs.get(wire.source.chipId);
          const value = sourceOutputs ? (sourceOutputs[wire.source.portIndex] ?? 0) : 0;
          wireValuesMap.get(wire.id)!.push(value);
        }
      }

      // Collect output CP values
      if (recording) {
        const cycleOutputs = new Array<number>(outputCount).fill(0);
        for (let i = 0; i < outputCount; i++) {
          const source = outputCpSources.get(i);
          if (source) {
            const sourceOutputs = currentOutputs.get(source.chipId);
            if (sourceOutputs) {
              cycleOutputs[i] = sourceOutputs[source.portIndex] ?? 0;
            }
          }
        }
        outputValues.push(cycleOutputs);
      }
    }
  }

  return ok({
    outputValues,
    wireValues: wireValuesMap,
    nodeOutputs: nodeOutputsMap,
    crossCycleState: crossCycleValues,
    processingOrder,
    nodeDepths,
    maxDepth,
    liveNodeIds,
  });
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Determine if a wire is a "parameter wire" (targets a knob port).
 */
function isParameterWire(wire: Wire, nodes: ReadonlyMap<NodeId, NodeState>): boolean {
  const targetNode = nodes.get(wire.target.chipId);
  if (!targetNode) return false;

  const knobConfig = getKnobConfig(getNodeDefinition(targetNode.type));
  if (!knobConfig) return false;

  return wire.target.portIndex === knobConfig.portIndex;
}

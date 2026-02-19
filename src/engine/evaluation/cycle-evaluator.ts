/**
 * Cycle-based graph evaluator.
 *
 * Evaluates the entire signal graph for N cycles, producing
 * a complete set of output samples. No time-domain simulation —
 * the graph settles instantly each cycle.
 *
 * Uses a two-pass approach for seamless looping:
 * - Pass 0 (warm-up): runs all cycles to establish steady-state.
 *   Memory chips and cross-cycle parameter paths reach their
 *   wrap-around values (cycle 0's "previous" = cycle N-1's value).
 * - Pass 1 (recording): re-runs all cycles, now recording results.
 *   This eliminates the zero-glitch on cycle 0.
 */

import type { ChipId, ChipState, Path } from '../../shared/types/index.ts';
import type { Result } from '../../shared/result/index.ts';
import { ok, err } from '../../shared/result/index.ts';
import { topologicalSortWithDepths } from '../graph/topological-sort.ts';
import { computeLiveNodes } from '../graph/liveness.ts';
import { getChipDefinition } from '../nodes/registry.ts';
import type { ChipRuntimeState } from '../nodes/framework.ts';
import { clamp } from '../../shared/math/index.ts';
import { getKnobConfig } from '../nodes/framework.ts';
import type { BakeMetadata } from '../baking/index.ts';
import { reconstructFromMetadata } from '../baking/index.ts';
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
  /** Signal value per path per cycle: pathId → number[] */
  pathValues: Map<string, number[]>;
  /** Per-chip outputs per cycle: chipId → [cycleIndex][plugPortIndex] */
  chipOutputs: Map<string, number[][]>;
  /** Final cross-cycle state values (for debugging) */
  crossCycleState: Map<string, number>;
  /** Non-CP chips in topological evaluation order */
  processingOrder: ChipId[];
  /** Depth (longest path from roots) for all chips including CPs */
  chipDepths: Map<ChipId, number>;
  /** Maximum depth across all chips */
  maxDepth: number;
  /** Set of chip IDs reachable from input sources (live chips) */
  liveChipIds: ReadonlySet<ChipId>;
}

/** Error from cycle evaluation. */
export interface CycleEvalError {
  message: string;
  cyclePath?: ChipId[];
}

// =============================================================================
// Internal types
// =============================================================================

/** Classification of a parameter path as same-cycle or cross-cycle. */
type ParamPathKind = 'same-cycle' | 'cross-cycle';

interface ParamPathInfo {
  path: Path;
  kind: ParamPathKind;
}

// =============================================================================
// Main evaluator
// =============================================================================

/**
 * Evaluate the graph for `cycleCount` cycles.
 *
 * @param chips       All chips on the board (including CP virtual chips)
 * @param paths       All paths on the board
 * @param portConstants  Map of "chipId:portIndex" → constant value for unconnected ports
 * @param inputGenerator  Produces input CP values for each cycle
 * @param cycleCount  Number of cycles to evaluate (default 256)
 * @param customChipMetadata  Bake metadata for custom chips (puzzle:*, utility:*) keyed by type
 */
export function evaluateAllCycles(
  chips: ReadonlyMap<ChipId, ChipState>,
  paths: Path[],
  portConstants: Map<string, number>,
  inputGenerator: (cycleIndex: number) => number[],
  cycleCount: number = 256,
  customChipMetadata?: ReadonlyMap<string, BakeMetadata>,
): Result<CycleResults, CycleEvalError> {
  // ─── Separate signal paths from parameter paths ───────────────────────────
  const signalPaths: Path[] = [];
  const parameterPaths: Path[] = [];

  for (const path of paths) {
    if (isParameterPath(path, chips)) {
      parameterPaths.push(path);
    } else {
      signalPaths.push(path);
    }
  }

  // ─── Topological sort on signal paths only ────────────────────────────────
  const chipIds = Array.from(chips.keys());
  const sortResult = topologicalSortWithDepths(chipIds, signalPaths);
  if (!sortResult.ok) {
    return err({
      message: sortResult.error.message,
      cyclePath: sortResult.error.cyclePath,
    });
  }
  const { order: topoOrder, depths: chipDepths, maxDepth } = sortResult.value;

  // ─── Classify parameter paths using depth comparison ──────────────────────
  const paramPathInfos: ParamPathInfo[] = parameterPaths.map((path) => {
    const srcDepth = chipDepths.get(path.source.chipId) ?? 0;
    const tgtDepth = chipDepths.get(path.target.chipId) ?? 0;
    const kind: ParamPathKind = srcDepth < tgtDepth ? 'same-cycle' : 'cross-cycle';
    return { path, kind };
  });

  // ─── Build path lookup: target "chipId:portIndex" → path ──────────────────
  const pathByTarget = new Map<string, Path>();
  for (const path of signalPaths) {
    pathByTarget.set(`${path.target.chipId}:${path.target.portIndex}`, path);
  }

  // Parameter path targets override signal paths for those specific ports
  for (const { path } of paramPathInfos) {
    pathByTarget.set(`${path.target.chipId}:${path.target.portIndex}`, path);
  }

  // ─── Identify input/output CPs ───────────────────────────────────────────
  let socketCount = 0;
  let plugCount = 0;
  const outputCpSources = new Map<number, { chipId: ChipId; portIndex: number }>();

  for (const chipId of chipIds) {
    if (isCreativeSlotNode(chipId)) {
      const node = chips.get(chipId);
      const slotIndex = getCreativeSlotIndex(chipId);
      if (node?.type === 'connection-input') {
        // Creative input slot: use slot index (0-2) as cpIndex
        if (slotIndex >= 0 && slotIndex + 1 > socketCount) socketCount = slotIndex + 1;
      } else if (node?.type === 'connection-output') {
        // Creative output slot: use slot index directly as output index.
        // Left outputs (0-2) and right outputs (3-5) each get unique indices.
        const outputIndex = slotIndex;
        if (outputIndex >= 0 && outputIndex + 1 > plugCount) plugCount = outputIndex + 1;
        const path = pathByTarget.get(`${chipId}:0`);
        if (path) {
          outputCpSources.set(outputIndex, {
            chipId: path.source.chipId,
            portIndex: path.source.portIndex,
          });
        }
      }
    } else if (isUtilitySlotNode(chipId)) {
      const node = chips.get(chipId);
      const slotIndex = getUtilitySlotIndex(chipId);
      if (node?.type === 'connection-input') {
        // Utility input slot: use slot index directly as cpIndex
        if (slotIndex >= 0 && slotIndex + 1 > socketCount) socketCount = slotIndex + 1;
      } else if (node?.type === 'connection-output') {
        // Utility output slot: use slot index directly as output index
        // Left outputs get indices 0-2, right outputs get indices 3-5 — no collision
        const outputIndex = slotIndex;
        if (outputIndex >= 0 && outputIndex + 1 > plugCount) plugCount = outputIndex + 1;
        const path = pathByTarget.get(`${chipId}:0`);
        if (path) {
          outputCpSources.set(outputIndex, {
            chipId: path.source.chipId,
            portIndex: path.source.portIndex,
          });
        }
      }
    } else if (isConnectionInputNode(chipId)) {
      const cpIndex = getConnectionPointIndex(chipId);
      if (cpIndex >= 0 && cpIndex + 1 > socketCount) socketCount = cpIndex + 1;
    } else if (isConnectionOutputNode(chipId)) {
      const cpIndex = getConnectionPointIndex(chipId);
      if (cpIndex >= 0 && cpIndex + 1 > plugCount) plugCount = cpIndex + 1;
      // Find what feeds this output CP
      const path = pathByTarget.get(`${chipId}:0`);
      if (path) {
        outputCpSources.set(cpIndex, {
          chipId: path.source.chipId,
          portIndex: path.source.portIndex,
        });
      }
    }
  }

  // ─── Build processing order (non-CP chips in topo order) ──────────────────
  const processingOrder: ChipId[] = [];
  for (const chipId of topoOrder) {
    if (!isConnectionPointNode(chipId) && !isCreativeSlotNode(chipId)) {
      processingOrder.push(chipId);
    }
  }

  // ─── Create runtime state for stateful chips ─────────────────────────────
  const chipStates = new Map<ChipId, ChipRuntimeState>();
  for (const chipId of processingOrder) {
    const chip = chips.get(chipId);
    if (!chip) continue;
    const def = getChipDefinition(chip.type);
    if (def?.createState) {
      chipStates.set(chipId, def.createState());
    }
  }

  // ─── Build custom chip closures for baked chips (puzzle:*, utility:*) ────
  const customClosures = new Map<ChipId, (inputs: number[]) => number[]>();
  if (customChipMetadata) {
    for (const chipId of processingOrder) {
      const chip = chips.get(chipId);
      if (!chip) continue;
      if (getChipDefinition(chip.type)) continue; // fundamental chip, skip
      const metadata = customChipMetadata.get(chip.type);
      if (metadata) {
        const bakeResult = reconstructFromMetadata(metadata);
        customClosures.set(chipId, bakeResult.evaluate);
      }
    }
  }

  // ─── Cross-cycle values storage ───────────────────────────────────────────
  const crossCycleValues = new Map<string, number>();

  // ─── Output storage ──────────────────────────────────────────────────────
  const outputValues: number[][] = [];
  const pathValuesMap = new Map<string, number[]>();
  const chipOutputsMap = new Map<string, number[][]>();

  // Initialize path values arrays
  for (const path of paths) {
    pathValuesMap.set(path.id, []);
  }
  // Initialize chip outputs arrays
  for (const chipId of processingOrder) {
    chipOutputsMap.set(chipId, []);
  }

  // ─── Per-chip output cache for current cycle ─────────────────────────────
  const currentOutputs = new Map<ChipId, number[]>();

  // Map from input CP chipId → cpIndex for fast lookup
  const inputCpIndexMap = new Map<ChipId, number>();
  for (const chipId of chipIds) {
    if (isCreativeSlotNode(chipId)) {
      const node = chips.get(chipId);
      if (node?.type === 'connection-input') {
        const slotIndex = getCreativeSlotIndex(chipId);
        if (slotIndex >= 0) inputCpIndexMap.set(chipId, slotIndex);
      }
    } else if (isUtilitySlotNode(chipId)) {
      const node = chips.get(chipId);
      if (node?.type === 'connection-input') {
        const slotIndex = getUtilitySlotIndex(chipId);
        if (slotIndex >= 0) inputCpIndexMap.set(chipId, slotIndex);
      }
    } else if (isConnectionInputNode(chipId)) {
      const idx = getConnectionPointIndex(chipId);
      if (idx >= 0) inputCpIndexMap.set(chipId, idx);
    }
  }

  // Initialize chip outputs arrays for input CP chips (so render-loop can read their signals)
  for (const chipId of inputCpIndexMap.keys()) {
    chipOutputsMap.set(chipId, []);
  }

  // Compute forward-reachable (live) chips from input sources
  const liveChipIds = computeLiveNodes(paths, new Set(inputCpIndexMap.keys()));

  // ─── Evaluate cycles (two-pass for seamless looping) ─────────────────────
  // Pass 0: warm-up — establish steady-state for Memory chips and cross-cycle
  //         parameter paths. No results are recorded.
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
        if (recording) chipOutputsMap.get(chipId)!.push([value]);
      }

      // Evaluate each processing chip in topological order
      for (const chipId of processingOrder) {
        const chip = chips.get(chipId);
        if (!chip) continue;

        // Skip non-live chips — record zero outputs to keep arrays consistent
        if (!liveChipIds.has(chipId)) {
          const zeroOutputs = new Array(chip.plugCount).fill(0);
          currentOutputs.set(chipId, zeroOutputs);
          if (recording) chipOutputsMap.get(chipId)!.push(zeroOutputs);
          continue;
        }

        const def = getChipDefinition(chip.type);
        const customEval = customClosures.get(chipId);
        if (!def && !customEval) continue;

        // Gather inputs for this chip
        const chipInputs: number[] = [];
        for (let portIndex = 0; portIndex < chip.socketCount; portIndex++) {
          const key = `${chipId}:${portIndex}`;
          const path = pathByTarget.get(key);

          if (!path) {
            // No path — use port constant or default 0
            chipInputs.push(portConstants.get(key) ?? 0);
            continue;
          }

          // Check if this is a cross-cycle parameter path
          const paramInfo = paramPathInfos.find(
            (p) => p.path.id === path.id,
          );

          if (paramInfo && paramInfo.kind === 'cross-cycle') {
            // Use stored value from previous cycle
            const crossKey = `${path.source.chipId}:${path.source.portIndex}`;
            chipInputs.push(crossCycleValues.get(crossKey) ?? portConstants.get(key) ?? 0);
          } else {
            // Same-cycle signal or same-cycle parameter: source already evaluated
            const sourceOutputs = currentOutputs.get(path.source.chipId);
            if (sourceOutputs) {
              chipInputs.push(sourceOutputs[path.source.portIndex] ?? 0);
            } else {
              chipInputs.push(portConstants.get(key) ?? 0);
            }
          }
        }

        // Evaluate — fundamental chip or custom baked chip
        let clampedOutputs: number[];
        if (def) {
          const chipState = chipStates.get(chipId);
          const outputs = def.evaluate({
            inputs: chipInputs,
            params: chip.params as Record<string, number | string | boolean>,
            state: chipState,
            tickIndex: cycle,
          });
          clampedOutputs = outputs.map((v) => clamp(v));
        } else {
          // Custom baked chip — closure handles internal evaluation
          const outputs = customEval!(chipInputs);
          clampedOutputs = outputs.map((v) => clamp(v));
        }

        currentOutputs.set(chipId, clampedOutputs);

        // Record chip outputs
        if (recording) chipOutputsMap.get(chipId)!.push([...clampedOutputs]);
      }

      // Update cross-cycle values for next cycle
      for (const { path, kind } of paramPathInfos) {
        if (kind === 'cross-cycle') {
          const crossKey = `${path.source.chipId}:${path.source.portIndex}`;
          const sourceOutputs = currentOutputs.get(path.source.chipId);
          if (sourceOutputs) {
            crossCycleValues.set(crossKey, sourceOutputs[path.source.portIndex] ?? 0);
          }
        }
      }

      // Record path values at this cycle
      if (recording) {
        for (const path of paths) {
          const sourceOutputs = currentOutputs.get(path.source.chipId);
          const value = sourceOutputs ? (sourceOutputs[path.source.portIndex] ?? 0) : 0;
          pathValuesMap.get(path.id)!.push(value);
        }
      }

      // Collect output CP values
      if (recording) {
        const cycleOutputs = new Array<number>(plugCount).fill(0);
        for (let i = 0; i < plugCount; i++) {
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
    pathValues: pathValuesMap,
    chipOutputs: chipOutputsMap,
    crossCycleState: crossCycleValues,
    processingOrder,
    chipDepths,
    maxDepth,
    liveChipIds,
  });
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Determine if a path is a "parameter path" (targets a knob port).
 */
function isParameterPath(path: Path, chips: ReadonlyMap<ChipId, ChipState>): boolean {
  const targetChip = chips.get(path.target.chipId);
  if (!targetChip) return false;

  const knobConfig = getKnobConfig(getChipDefinition(targetChip.type));
  if (!knobConfig) return false;

  return path.target.portIndex === knobConfig.portIndex;
}

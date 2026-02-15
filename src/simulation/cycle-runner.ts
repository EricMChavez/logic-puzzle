import { useGameStore } from '../store/index.ts';
import type { GameStore } from '../store/index.ts';
import { evaluateAllCycles } from '../engine/evaluation/index.ts';
import type { CycleResults } from '../engine/evaluation/index.ts';
import { generateWaveformValue } from '../puzzle/waveform-generators.ts';
import { CONNECTION_POINT_CONFIG, VALIDATION_CONFIG } from '../shared/constants/index.ts';
import { bakeGraph } from '../engine/baking/index.ts';
import { utilitySlotId } from '../puzzle/connection-point-nodes.ts';
import { buildSlotConfig, directionIndexToSlot } from '../puzzle/types.ts';
import type { SlotConfig } from '../puzzle/types.ts';
import { createLogger } from '../shared/logger/index.ts';

const log = createLogger('CycleRunner');

const CYCLE_COUNT = 256;

// Per-sample match arrays keyed by "output:0", "output:1", etc.
const perSampleMatchArrays = new Map<string, boolean[]>();

/** Get per-sample match arrays for rendering. */
export function getPerSampleMatch(): ReadonlyMap<string, boolean[]> {
  return perSampleMatchArrays;
}

/** Initialize meter slot state based on current mode. */
function initializeMeters(store: GameStore): void {
  const { activePuzzle, isCreativeMode, editingUtilityId } = store;

  perSampleMatchArrays.clear();

  if (editingUtilityId) {
    // Utility editing: meter slots already set by startEditingUtility / toggleMeterMode.
    // No re-initialization needed — meter state is authoritative.
  } else if (isCreativeMode) {
    // Creative mode: meters initialized by initializeCreativeMode() in App.tsx
  } else if (activePuzzle) {
    const slotConfig: SlotConfig = activePuzzle.slotConfig
      ?? buildSlotConfig(activePuzzle.activeInputs, activePuzzle.activeOutputs);
    store.initializeMeters(slotConfig);
  } else {
    const slotConfig = buildSlotConfig(CONNECTION_POINT_CONFIG.INPUT_COUNT, CONNECTION_POINT_CONFIG.OUTPUT_COUNT);
    store.initializeMeters(slotConfig);
  }
}

/** Run cycle evaluation on the current graph and store results. */
function runCycleEvaluation(): void {
  const store = useGameStore.getState();
  if (!store.activeBoard) {
    store.setCycleResults(null);
    return;
  }

  const { chips: nodes, paths: wires } = store.activeBoard;
  const { activePuzzle, activeTestCaseIndex, isCreativeMode, creativeSlots, editingUtilityId, portConstants } = store;

  // Build port constants map for the evaluator
  const constants = new Map<string, number>(portConstants);

  // Build input generator based on mode
  let inputGenerator: (cycleIndex: number) => number[];

  if (editingUtilityId) {
    // Utility editing: inputs from port constants (utility slot CPs)
    // Takes priority over creative mode (utility can be entered from creative)
    inputGenerator = (_cycleIndex: number) => {
      const inputs: number[] = [];
      for (let i = 0; i < 6; i++) {
        const chipId = utilitySlotId(i);
        const key = `${chipId}:0`;
        inputs.push(constants.get(key) ?? 0);
      }
      return inputs;
    };
  } else if (isCreativeMode) {
    // Creative mode: inputs from creative slot waveforms
    inputGenerator = (cycleIndex: number) => {
      const inputs: number[] = [];
      for (let i = 0; i < 6; i++) {
        const slot = creativeSlots[i];
        if (slot?.direction === 'input' && slot.waveform) {
          inputs.push(generateWaveformValue(cycleIndex, slot.waveform));
        } else {
          inputs.push(0);
        }
      }
      return inputs;
    };
  } else if (activePuzzle) {
    // Puzzle mode: inputs from test case
    const testCase = activePuzzle.testCases[activeTestCaseIndex];
    if (!testCase) {
      store.setCycleResults(null);
      return;
    }
    inputGenerator = (cycleIndex: number) => {
      return testCase.inputs.map(waveformDef => generateWaveformValue(cycleIndex, waveformDef));
    };
  } else {
    // No puzzle, no creative: zero inputs
    inputGenerator = () => [];
  }

  const result = evaluateAllCycles(nodes, wires, constants, inputGenerator, CYCLE_COUNT);

  if (!result.ok) {
    log.warn('Cycle evaluation failed', { error: result.error.message });
    store.setCycleResults(null);
    return;
  }

  const cycleResults = result.value;
  store.setCycleResults(cycleResults);

  // Validate against puzzle targets
  if (activePuzzle && !isCreativeMode) {
    validateCycleResults(cycleResults, store);
  }

  log.info('Cycle evaluation complete', {
    outputs: cycleResults.outputValues.length,
  });
}

/** Validate cycle results against puzzle targets. */
function validateCycleResults(results: CycleResults, store: GameStore): void {
  const { activePuzzle, activeTestCaseIndex, puzzleStatus } = store;
  if (!activePuzzle || puzzleStatus === 'victory') return;

  const testCase = activePuzzle.testCases[activeTestCaseIndex];
  if (!testCase) return;

  const slotConfig: SlotConfig = activePuzzle.slotConfig
    ?? buildSlotConfig(activePuzzle.activeInputs, activePuzzle.activeOutputs);

  const tolerance = VALIDATION_CONFIG.MATCH_TOLERANCE;
  // Slot-indexed perPortMatch: perPortMatch[slotIndex] = true/false
  const perPortMatch: boolean[] = new Array(6).fill(false);
  let allMatch = testCase.expectedOutputs.length > 0;

  for (let outputIdx = 0; outputIdx < testCase.expectedOutputs.length; outputIdx++) {
    let portMatch = true;
    const matchArr = new Array(CYCLE_COUNT).fill(false);

    for (let cycle = 0; cycle < CYCLE_COUNT; cycle++) {
      const actual = results.outputValues[cycle]?.[outputIdx] ?? 0;
      const expected = generateWaveformValue(cycle, testCase.expectedOutputs[outputIdx]);
      const match = Math.abs(actual - expected) <= tolerance;
      matchArr[cycle] = match;
      if (!match) portMatch = false;
    }

    // Map per-direction output index → flat slot index
    const slotIdx = directionIndexToSlot(slotConfig, 'output', outputIdx);
    if (slotIdx >= 0) {
      perSampleMatchArrays.set(`output:${slotIdx}`, matchArr);
      perPortMatch[slotIdx] = portMatch;
    }
    if (!portMatch) allMatch = false;
  }

  store.updateValidation(perPortMatch, allMatch);

  // Check if test case just passed
  const updatedStore = useGameStore.getState();
  if (updatedStore.testCasesPassed.includes(activeTestCaseIndex) &&
      !store.testCasesPassed.includes(activeTestCaseIndex)) {
    // Test case just passed — advance
    updatedStore.advanceTestCase();

    const finalStore = useGameStore.getState();
    if (finalStore.puzzleStatus === 'victory') {
      triggerCeremony();
    } else if (finalStore.puzzleStatus === 'playing') {
      // More test cases: re-initialize and re-evaluate
      initializeMeters(useGameStore.getState());
      runCycleEvaluation();
    }
  }
}

/** Trigger the completion ceremony after puzzle victory. */
function triggerCeremony(): void {
  const store = useGameStore.getState();
  const { activePuzzle, activeBoard } = store;
  if (!activePuzzle || !activeBoard) return;

  const bakeResult = bakeGraph(activeBoard.chips, activeBoard.paths);
  if (!bakeResult.ok) return;

  const { metadata } = bakeResult.value;
  const puzzleId = activePuzzle.id;
  const isResolve = store.completedLevels.has(puzzleId);

  // Auto-play so the solved puzzle animates behind the celebration
  store.setPlayMode('playing');

  store.enterItWorks({
    id: puzzleId,
    title: activePuzzle.title,
    description: activePuzzle.description,
  }, isResolve, metadata);
}

/**
 * Initialize the cycle runner subscriber. Called once from store/index.ts.
 * The subscriber auto-evaluates whenever the graph, board, or test case changes.
 * No explicit start/stop needed — evaluation is instant and on-demand.
 */
export function initCycleRunner(store: {
  getState(): GameStore;
  subscribe(listener: (state: GameStore, prev: GameStore) => void): () => void;
}): void {
  store.subscribe((state, prev) => {
    // Re-evaluate when graph structure changes
    if (state.graphVersion !== prev.graphVersion && state.activeBoard) {
      initializeMeters(state);
      runCycleEvaluation();
      return;
    }

    // Re-evaluate when board switches
    if (state.activeBoardId !== prev.activeBoardId && state.activeBoard) {
      initializeMeters(state);
      runCycleEvaluation();
      return;
    }

    // Re-evaluate when puzzle loads/unloads
    if (state.activePuzzle !== prev.activePuzzle && state.activeBoard) {
      initializeMeters(state);
      runCycleEvaluation();
      return;
    }

    // Re-evaluate when test case changes
    if (state.activeTestCaseIndex !== prev.activeTestCaseIndex && state.activePuzzle) {
      initializeMeters(state);
      runCycleEvaluation();
      return;
    }

    // Re-evaluate when creative slot waveforms change
    if (state.creativeSlots !== prev.creativeSlots && state.activeBoard) {
      runCycleEvaluation();
      return;
    }
  });
}

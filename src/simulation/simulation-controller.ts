import type { NodeId, NodeState, Wire } from '../shared/types/index.ts';
import { WIRE_BUFFER_SIZE } from '../shared/types/index.ts';
import { WtsClock } from '../wts/clock/wts-clock.ts';
import { createSchedulerState, advanceTick } from '../wts/scheduler/tick-scheduler.ts';
import type { SchedulerState } from '../wts/scheduler/tick-scheduler.ts';
import { topologicalSort } from '../engine/graph/topological-sort.ts';
import { WaveformBuffer } from '../gameboard/visualization/waveform-buffer.ts';
import { useGameStore } from '../store/index.ts';
import { CONNECTION_POINT_CONFIG, VALIDATION_CONFIG } from '../shared/constants/index.ts';
import { evaluateMultiply } from '../engine/nodes/multiply.ts';
import { evaluateMix } from '../engine/nodes/mix.ts';
import type { MixMode } from '../engine/nodes/mix.ts';
import { evaluateInvert } from '../engine/nodes/invert.ts';
import { evaluateThreshold } from '../engine/nodes/threshold.ts';
import { evaluateDelay } from '../engine/nodes/delay.ts';
import { generateWaveformValue } from '../puzzle/waveform-generators.ts';
import { cpInputId, cpOutputId, getConnectionPointIndex, isCreativeSlotNode, getCreativeSlotIndex, creativeSlotId } from '../puzzle/connection-point-nodes.ts';
import { validateBuffers } from '../puzzle/validation.ts';
import { bakeGraph, reconstructFromMetadata } from '../engine/baking/index.ts';
import { MeterCircularBuffer } from '../gameboard/meters/circular-buffer.ts';
import { METER_BUFFER_CAPACITY } from '../gameboard/meters/meter-types.ts';
import { buildConnectionPointConfig } from '../puzzle/types.ts';

/** Waveform history length (number of ticks to display) */
const WAVEFORM_CAPACITY = 64;

/** Tick interval in ms. 1 WTS = 16 subdivisions = 1 second → 62.5ms per tick */
const TICK_INTERVAL_MS = 63;

// Module-level simulation state
let clock: WtsClock | null = null;
let schedulerState: SchedulerState | null = null;
let topoOrder: NodeId[] = [];
let sourceNodeIds: NodeId[] = []; // Nodes with no incoming wires — emit every tick
let intervalId: ReturnType<typeof setInterval> | null = null;

// Waveform buffers keyed by "input:0", "input:1", "output:0", etc.
const waveformBuffers = new Map<string, WaveformBuffer>();

// Meter circular buffers keyed by "input:0", "output:0", etc.
const meterSignalBuffers = new Map<string, MeterCircularBuffer>();
const meterTargetBuffers = new Map<string, MeterCircularBuffer>();

// Track graph version for detecting structural mutations during simulation
let lastGraphVersion = 0;

// Per-sample match arrays keyed by "output:0", "output:1", etc.
const perSampleMatchArrays = new Map<string, boolean[]>();

/** Whether the simulation is currently running. */
export function isRunning(): boolean {
  return intervalId !== null;
}

/** Get waveform buffers for rendering. */
export function getWaveformBuffers(): ReadonlyMap<string, WaveformBuffer> {
  return waveformBuffers;
}

/** Get meter signal buffers for rendering. */
export function getMeterBuffers(): ReadonlyMap<string, MeterCircularBuffer> {
  return meterSignalBuffers;
}

/** Get meter target buffers for rendering. */
export function getTargetMeterBuffers(): ReadonlyMap<string, MeterCircularBuffer> {
  return meterTargetBuffers;
}

/** Get per-sample match arrays for rendering (keyed by "output:0", etc.). */
export function getPerSampleMatch(): ReadonlyMap<string, boolean[]> {
  return perSampleMatchArrays;
}

/** Start the simulation loop. */
export function startSimulation(): void {
  if (intervalId !== null) return;

  const store = useGameStore.getState();
  if (!store.activeBoard) return;

  const { nodes, wires } = store.activeBoard;

  // Calculate topological order
  const nodeIds = Array.from(nodes.keys());
  const sortResult = topologicalSort(nodeIds, wires);
  if (!sortResult.ok) return; // Can't simulate with cycles
  topoOrder = sortResult.value;

  // Initialize scheduler state
  clock = new WtsClock();
  schedulerState = createSchedulerState(nodes);

  // Initialize baked evaluate closures for puzzle and utility nodes
  for (const [nodeId, node] of nodes) {
    if (node.type.startsWith('puzzle:')) {
      const puzzleId = node.type.slice('puzzle:'.length);
      const entry = store.puzzleNodes.get(puzzleId);
      if (entry) {
        const runtime = schedulerState.nodeStates.get(nodeId);
        if (runtime) {
          const { evaluate } = reconstructFromMetadata(entry.bakeMetadata);
          runtime.bakedEvaluate = evaluate;
        }
      }
    } else if (node.type.startsWith('utility:')) {
      const utilityId = node.type.slice('utility:'.length);
      const entry = store.utilityNodes.get(utilityId);
      if (entry) {
        const runtime = schedulerState.nodeStates.get(nodeId);
        if (runtime) {
          const { evaluate } = reconstructFromMetadata(entry.bakeMetadata);
          runtime.bakedEvaluate = evaluate;
        }
      }
    }
  }

  // Identify source nodes (no incoming wires on any port)
  const nodesWithIncoming = new Set<NodeId>();
  for (const wire of wires) {
    nodesWithIncoming.add(wire.target.nodeId);
  }
  sourceNodeIds = nodeIds.filter((id) => !nodesWithIncoming.has(id));

  // Initialize waveform buffers
  waveformBuffers.clear();
  for (let i = 0; i < CONNECTION_POINT_CONFIG.INPUT_COUNT; i++) {
    waveformBuffers.set(`input:${i}`, new WaveformBuffer(WAVEFORM_CAPACITY));
  }
  for (let i = 0; i < CONNECTION_POINT_CONFIG.OUTPUT_COUNT; i++) {
    waveformBuffers.set(`output:${i}`, new WaveformBuffer(WAVEFORM_CAPACITY));
  }

  // Create target waveform buffers when a puzzle is active
  const { activePuzzle, activeTestCaseIndex } = store;
  if (activePuzzle) {
    const testCase = activePuzzle.testCases[activeTestCaseIndex];
    if (testCase) {
      for (let i = 0; i < testCase.expectedOutputs.length; i++) {
        waveformBuffers.set(`target:${i}`, new WaveformBuffer(WAVEFORM_CAPACITY));
      }
    }
  }

  // Initialize meter circular buffers
  meterSignalBuffers.clear();
  meterTargetBuffers.clear();
  for (let i = 0; i < CONNECTION_POINT_CONFIG.INPUT_COUNT; i++) {
    meterSignalBuffers.set(`input:${i}`, new MeterCircularBuffer(METER_BUFFER_CAPACITY));
  }
  for (let i = 0; i < CONNECTION_POINT_CONFIG.OUTPUT_COUNT; i++) {
    meterSignalBuffers.set(`output:${i}`, new MeterCircularBuffer(METER_BUFFER_CAPACITY));
  }
  // Pre-fill meter buffers based on mode
  if (store.isCreativeMode) {
    // Creative mode: pre-fill based on slot directions
    const { creativeSlots } = store;
    // Left side (slots 0-2)
    for (let i = 0; i < 3; i++) {
      const slot = creativeSlots[i];
      const mBuf = meterSignalBuffers.get(`input:${i}`);
      if (mBuf && slot?.direction === 'input') {
        for (let t = 0; t < METER_BUFFER_CAPACITY; t++) {
          mBuf.push(generateWaveformValue(t, slot.waveform));
        }
      }
      // Output slots start with zeros (already initialized)
    }
    // Right side (slots 3-5)
    for (let i = 0; i < 3; i++) {
      const slot = creativeSlots[i + 3];
      const mBuf = meterSignalBuffers.get(`output:${i}`);
      if (mBuf && slot?.direction === 'input') {
        for (let t = 0; t < METER_BUFFER_CAPACITY; t++) {
          mBuf.push(generateWaveformValue(t, slot.waveform));
        }
      }
    }
    // Don't re-initialize meters in creative mode (App.tsx handles it)
  } else if (activePuzzle) {
    const testCase = activePuzzle.testCases[activeTestCaseIndex];
    if (testCase) {
      for (let i = 0; i < testCase.expectedOutputs.length; i++) {
        meterTargetBuffers.set(`target:${i}`, new MeterCircularBuffer(METER_BUFFER_CAPACITY));
      }
      // Pre-fill target meter buffers with 256 samples so target is immediately visible
      for (let i = 0; i < testCase.expectedOutputs.length; i++) {
        const tBuf = meterTargetBuffers.get(`target:${i}`);
        if (tBuf) {
          for (let t = 0; t < METER_BUFFER_CAPACITY; t++) {
            tBuf.push(generateWaveformValue(t, testCase.expectedOutputs[i]));
          }
        }
      }
      // Pre-fill input meter buffers with lookahead samples (upcoming signal)
      for (let cpIndex = 0; cpIndex < testCase.inputs.length; cpIndex++) {
        const mBuf = meterSignalBuffers.get(`input:${cpIndex}`);
        if (mBuf) {
          for (let t = 0; t < METER_BUFFER_CAPACITY; t++) {
            mBuf.push(generateWaveformValue(t, testCase.inputs[cpIndex]));
          }
        }
      }
    }
    // Initialize meter slice with connection point config
    const cpConfig = buildConnectionPointConfig(activePuzzle.activeInputs, activePuzzle.activeOutputs);
    store.initializeMeters(cpConfig);
  } else {
    // Fallback: initialize with default config
    const cpConfig = buildConnectionPointConfig(CONNECTION_POINT_CONFIG.INPUT_COUNT, CONNECTION_POINT_CONFIG.OUTPUT_COUNT);
    store.initializeMeters(cpConfig);
  }

  // Reset validation state for new simulation run
  lastGraphVersion = store.graphVersion;

  // Initial evaluation: apply constants, evaluate all nodes, emit outputs
  const seededWires = initialEvaluation(nodes, wires, store.portConstants);

  // Write seeded wires to the store
  if (seededWires) {
    store.updateWires(seededWires);
  }

  // Start ticking
  intervalId = setInterval(tick, TICK_INTERVAL_MS);
}

/** Stop the simulation loop. */
export function stopSimulation(): void {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
  clock = null;
  schedulerState = null;
  topoOrder = [];
  sourceNodeIds = [];

  // Clear meter buffers and match state
  meterSignalBuffers.clear();
  meterTargetBuffers.clear();
  perSampleMatchArrays.clear();

  // Clear signals from wires in the store
  const store = useGameStore.getState();
  if (store.activeBoard) {
    const cleanedWires = store.activeBoard.wires.map((w) => ({
      ...w,
      signalBuffer: new Array(WIRE_BUFFER_SIZE).fill(0),
      writeHead: 0,
    }));
    store.updateWires(cleanedWires);
  }
}

/**
 * Apply port constants, evaluate all nodes in topo order, and emit outputs.
 * Returns a cloned wire array with initial signals placed on it.
 */
function initialEvaluation(
  nodes: ReadonlyMap<NodeId, NodeState>,
  wires: ReadonlyArray<Wire>,
  portConstants: Map<string, number>,
): Wire[] | null {
  if (!schedulerState) return null;

  // Build set of connected input ports
  const connectedInputs = new Set<string>();
  for (const wire of wires) {
    connectedInputs.add(`${wire.target.nodeId}:${wire.target.portIndex}`);
  }

  // Clone wires for mutation
  const mutableWires: Wire[] = wires.map((w) => ({
    ...w,
    signalBuffer: [...w.signalBuffer],
  }));

  // Apply port constants to unconnected inputs
  for (const [nodeId, runtime] of schedulerState.nodeStates) {
    const node = nodes.get(nodeId);
    if (!node) continue;
    for (let i = 0; i < node.inputCount; i++) {
      const key = `${nodeId}:${i}`;
      if (!connectedInputs.has(key)) {
        runtime.inputs[i] = portConstants.get(key) ?? 0;
      }
    }
  }

  // Evaluate all nodes in topo order and emit outputs
  for (const nodeId of topoOrder) {
    const node = nodes.get(nodeId);
    const runtime = schedulerState.nodeStates.get(nodeId);
    if (!node || !runtime) continue;

    evaluateNodeForInit(node, runtime, 0);

    // Emit outputs onto outgoing wires
    for (const wire of mutableWires) {
      if (wire.source.nodeId === nodeId) {
        const value = runtime.outputs[wire.source.portIndex] ?? 0;
        if (value !== 0) {
          wire.signalBuffer[wire.writeHead] = value;
        }
      }
    }
  }

  return mutableWires;
}

/** Evaluate a node for initial seeding. Mirrors tick-scheduler's evaluateNode. */
function evaluateNodeForInit(node: NodeState, runtime: { inputs: number[]; outputs: number[]; delayState?: import('../engine/nodes/delay.ts').DelayState; bakedEvaluate?: (inputs: number[]) => number[] }, currentTick?: number): void {
  switch (node.type) {
    case 'multiply': {
      runtime.outputs[0] = evaluateMultiply(runtime.inputs[0] ?? 0, runtime.inputs[1] ?? 0);
      break;
    }
    case 'mix': {
      const mode = (node.params['mode'] as MixMode) ?? 'Add';
      runtime.outputs[0] = evaluateMix(runtime.inputs[0] ?? 0, runtime.inputs[1] ?? 0, mode);
      break;
    }
    case 'invert': {
      runtime.outputs[0] = evaluateInvert(runtime.inputs[0] ?? 0);
      break;
    }
    case 'threshold': {
      const threshold = typeof node.params['threshold'] === 'number' ? node.params['threshold'] : 0;
      runtime.outputs[0] = evaluateThreshold(runtime.inputs[0] ?? 0, threshold);
      break;
    }
    case 'delay': {
      if (runtime.delayState) {
        runtime.outputs[0] = evaluateDelay(runtime.inputs[0] ?? 0, runtime.delayState);
      }
      break;
    }
    case 'connection-input': {
      // Generate waveform value for this input CP
      const store = useGameStore.getState();
      const tick = currentTick ?? 0;

      // Creative mode with creative slot nodes
      if (store.isCreativeMode && isCreativeSlotNode(node.id)) {
        const slotIndex = getCreativeSlotIndex(node.id);
        const slot = store.creativeSlots[slotIndex];
        if (slot && slot.direction === 'input') {
          runtime.outputs[0] = generateWaveformValue(tick, slot.waveform);
        }
        break;
      }

      // Puzzle mode: use puzzle test case waveforms
      const cpIndex = getConnectionPointIndex(node.id);
      const { activePuzzle, activeTestCaseIndex } = store;
      if (activePuzzle) {
        const testCase = activePuzzle.testCases[activeTestCaseIndex];
        if (testCase && cpIndex >= 0 && cpIndex < testCase.inputs.length) {
          runtime.outputs[0] = generateWaveformValue(tick, testCase.inputs[cpIndex]);
        }
      }
      break;
    }
    case 'connection-output':
      // Output CPs just receive signals — no evaluation needed
      break;
    default: {
      // Puzzle and utility nodes use their baked evaluate closure
      if ((node.type.startsWith('puzzle:') || node.type.startsWith('utility:')) && runtime.bakedEvaluate) {
        const results = runtime.bakedEvaluate([...runtime.inputs]);
        for (let i = 0; i < results.length && i < runtime.outputs.length; i++) {
          runtime.outputs[i] = results[i];
        }
      }
      break;
    }
  }
}

/** Advance one simulation tick. */
function tick(): void {
  if (!clock || !schedulerState) return;

  const store = useGameStore.getState();
  if (!store.activeBoard) return;

  // Detect structural changes and restart simulation with fresh state
  if (store.graphVersion !== lastGraphVersion) {
    stopSimulation();
    startSimulation();
    return;
  }

  clock.tick();

  const boardNodes = store.activeBoard.nodes;
  const { portConstants } = store;

  // Deep clone wires for mutation (advanceTick mutates in-place)
  const wires: Wire[] = store.activeBoard.wires.map((w) => ({
    ...w,
    signalBuffer: [...w.signalBuffer],
  }));

  // Build set of connected input ports
  const connectedInputs = new Set<string>();
  for (const wire of wires) {
    connectedInputs.add(`${wire.target.nodeId}:${wire.target.portIndex}`);
  }

  // Apply port constants to unconnected inputs before each tick
  for (const [nodeId, runtime] of schedulerState.nodeStates) {
    const node = boardNodes.get(nodeId);
    if (!node) continue;
    for (let i = 0; i < node.inputCount; i++) {
      const key = `${nodeId}:${i}`;
      if (!connectedInputs.has(key)) {
        const constValue = portConstants.get(key) ?? 0;
        if (runtime.inputs[i] !== constValue) {
          runtime.inputs[i] = constValue;
        }
      }
    }
  }

  // Evaluate source nodes (nodes with no incoming wires) so their outputs are
  // current before advanceTick.  Wire writes happen inside advanceTick's
  // always-write loop, which writes at writeHead *after* reading — giving the
  // correct 16-tick ring-buffer delay.
  const currentTick = clock.getTick();
  for (const nodeId of sourceNodeIds) {
    const node = boardNodes.get(nodeId);
    const runtime = schedulerState.nodeStates.get(nodeId);
    if (!node || !runtime) continue;

    evaluateNodeForInit(node, runtime, currentTick);
  }

  // Run the scheduler tick (advances signals, delivers arrivals, evaluates downstream)
  advanceTick(wires, boardNodes, topoOrder, schedulerState);

  // Write updated wires back to the store
  store.updateWires(wires);

  // Record waveform data at connection points
  recordWaveforms();

  // Run validation against puzzle targets
  validateTick();
}

/** Record current node output values into waveform buffers. */
function recordWaveforms(): void {
  if (!schedulerState || !clock) return;

  const currentTick = clock.getTick();
  const store = useGameStore.getState();
  const { activePuzzle, activeTestCaseIndex, isCreativeMode, creativeSlots } = store;

  // Creative mode: record from creative slot nodes
  if (isCreativeMode) {
    // Left side slots (0-2)
    for (let i = 0; i < 3; i++) {
      const slotIndex = i;
      const nodeId = creativeSlotId(slotIndex);
      const runtime = schedulerState.nodeStates.get(nodeId);
      const slot = creativeSlots[slotIndex];
      const mBuf = meterSignalBuffers.get(`input:${i}`);

      if (slot?.direction === 'input') {
        // Input slot: push future lookahead sample
        if (mBuf) {
          const futureValue = generateWaveformValue(currentTick + METER_BUFFER_CAPACITY, slot.waveform);
          mBuf.push(futureValue);
        }
      } else if (slot?.direction === 'output') {
        // Output slot: push received signal value
        const value = runtime ? runtime.inputs[0] ?? 0 : 0;
        if (mBuf) mBuf.push(value);
        // Also push to authoring buffer for puzzle creation
        store.pushOutputSample(slotIndex, value);
      }
      // 'off' slots: no recording
    }

    // Right side slots (3-5)
    for (let i = 0; i < 3; i++) {
      const slotIndex = i + 3;
      const nodeId = creativeSlotId(slotIndex);
      const runtime = schedulerState.nodeStates.get(nodeId);
      const slot = creativeSlots[slotIndex];
      const mBuf = meterSignalBuffers.get(`output:${i}`);

      if (slot?.direction === 'input') {
        // Input slot: push future lookahead sample
        if (mBuf) {
          const futureValue = generateWaveformValue(currentTick + METER_BUFFER_CAPACITY, slot.waveform);
          mBuf.push(futureValue);
        }
      } else if (slot?.direction === 'output') {
        // Output slot: push received signal value
        const value = runtime ? runtime.inputs[0] ?? 0 : 0;
        if (mBuf) mBuf.push(value);
        // Also push to authoring buffer for puzzle creation
        store.pushOutputSample(slotIndex, value);
      }
      // 'off' slots: no recording
    }
    return;
  }

  // Puzzle mode: record from standard CP nodes
  // Record input CP waveform values (from their output port)
  for (let i = 0; i < CONNECTION_POINT_CONFIG.INPUT_COUNT; i++) {
    const nodeId = cpInputId(i);
    const runtime = schedulerState.nodeStates.get(nodeId);
    const value = runtime ? runtime.outputs[0] ?? 0 : 0;
    const buf = waveformBuffers.get(`input:${i}`);
    if (buf) buf.push(value);

    // For input meters: push the NEXT future sample (lookahead)
    const mBuf = meterSignalBuffers.get(`input:${i}`);
    if (mBuf && activePuzzle) {
      const testCase = activePuzzle.testCases[activeTestCaseIndex];
      if (testCase && i < testCase.inputs.length) {
        const futureValue = generateWaveformValue(currentTick + METER_BUFFER_CAPACITY, testCase.inputs[i]);
        mBuf.push(futureValue);
      }
    } else if (mBuf) {
      mBuf.push(value);
    }
  }

  // Record output CP waveform values (from their input port)
  for (let i = 0; i < CONNECTION_POINT_CONFIG.OUTPUT_COUNT; i++) {
    const nodeId = cpOutputId(i);
    const runtime = schedulerState.nodeStates.get(nodeId);
    const value = runtime ? runtime.inputs[0] ?? 0 : 0;
    const buf = waveformBuffers.get(`output:${i}`);
    if (buf) buf.push(value);
    const mBuf = meterSignalBuffers.get(`output:${i}`);
    if (mBuf) mBuf.push(value);
  }

  // Record target waveform values when in puzzle mode (legacy waveform buffers only)
  if (activePuzzle) {
    const testCase = activePuzzle.testCases[activeTestCaseIndex];
    if (testCase) {
      for (let i = 0; i < testCase.expectedOutputs.length; i++) {
        const targetValue = generateWaveformValue(currentTick, testCase.expectedOutputs[i]);
        const buf = waveformBuffers.get(`target:${i}`);
        if (buf) buf.push(targetValue);
        // Target meter buffers are NOT pushed here — they are pre-filled at
        // startSimulation() and stay static so the target waveform doesn't scroll.
      }
    }
  }
}

/** Validate current output signals against puzzle targets. */
function validateTick(): void {
  if (!schedulerState || !clock) return;

  const store = useGameStore.getState();

  // Skip validation in creative mode
  if (store.isCreativeMode) return;

  const { activePuzzle, activeTestCaseIndex, puzzleStatus } = store;
  if (!activePuzzle || puzzleStatus === 'victory') return;

  const testCase = activePuzzle.testCases[activeTestCaseIndex];
  if (!testCase) return;

  // Track graph version
  lastGraphVersion = store.graphVersion;

  // Buffer-based validation: compare full output meter buffers against target buffers.
  // Victory triggers instantly when ALL output buffers match their targets.
  const perPortMatch: boolean[] = [];
  let allBuffersMatch = testCase.expectedOutputs.length > 0;

  for (let i = 0; i < testCase.expectedOutputs.length; i++) {
    const outputBuf = meterSignalBuffers.get(`output:${i}`);
    const targetBuf = meterTargetBuffers.get(`target:${i}`);
    if (outputBuf && targetBuf) {
      const result = validateBuffers(outputBuf, targetBuf, VALIDATION_CONFIG.MATCH_TOLERANCE);
      perSampleMatchArrays.set(`output:${i}`, result.perSample);
      perPortMatch.push(result.allMatch);
      if (!result.allMatch) allBuffersMatch = false;
    } else {
      perPortMatch.push(false);
      allBuffersMatch = false;
    }
  }

  store.updateValidation(perPortMatch, allBuffersMatch);

  // Check if this test case was just passed
  const updatedStore = useGameStore.getState();
  if (updatedStore.testCasesPassed.includes(activeTestCaseIndex) &&
      !store.testCasesPassed.includes(activeTestCaseIndex)) {
    // Test case just passed — stop simulation and advance
    stopSimulation();
    updatedStore.advanceTestCase();

    // Check if puzzle is now fully complete
    const finalStore = useGameStore.getState();
    if (finalStore.puzzleStatus === 'victory') {
      triggerCeremony();
    } else if (finalStore.puzzleStatus === 'playing') {
      // Auto-restart simulation if more test cases remain
      startSimulation();
    }
  }
}

/** Trigger the completion ceremony after puzzle victory. */
function triggerCeremony(): void {
  const store = useGameStore.getState();
  const { activePuzzle, activeBoard } = store;
  if (!activePuzzle || !activeBoard) return;

  // Capture canvas snapshot as data URL (for ceremony-slice)
  const canvas = document.querySelector('canvas');
  const snapshot = canvas ? canvas.toDataURL() : '';

  // Bake the winning graph
  const bakeResult = bakeGraph(activeBoard.nodes, activeBoard.wires);
  if (!bakeResult.ok) return;

  const { metadata } = bakeResult.value;
  const puzzleId = activePuzzle.id;
  const isResolve = store.completedLevels.has(puzzleId);

  // Store ceremony data (puzzle info + bake metadata) — palette addition deferred
  // to render-loop's handleCeremonyCompletion when zoom-out finishes.
  store.startCeremony(
    snapshot,
    { id: puzzleId, title: activePuzzle.title, description: activePuzzle.description },
    isResolve,
    metadata,
  );

  // Start the victory burst animation phase
  store.startVictoryBurst();
}

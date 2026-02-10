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
import { cpInputId, cpOutputId, getConnectionPointIndex, isCreativeSlotNode, getCreativeSlotIndex, creativeSlotId, isBidirectionalCpNode, getBidirectionalCpIndex, cpBidirectionalId } from '../puzzle/connection-point-nodes.ts';
import { validateBuffers } from '../puzzle/validation.ts';
import { bakeGraph, reconstructFromMetadata } from '../engine/baking/index.ts';
import { MeterCircularBuffer } from '../gameboard/meters/circular-buffer.ts';
import { METER_BUFFER_CAPACITY } from '../gameboard/meters/meter-types.ts';
import { buildConnectionPointConfig, buildCustomNodeConnectionPointConfig } from '../puzzle/types.ts';

/** Waveform history length (number of ticks to display) */
const WAVEFORM_CAPACITY = 64;

/** Exact tick interval in ms. 1 WTS = 16 subdivisions = 1 second → 62.5ms per tick */
const TICK_MS = 62.5;

/** Maximum catch-up ticks per frame to prevent frame-budget blowout after long pauses */
const MAX_CATCHUP_TICKS = 4;

// Module-level simulation state
let clock: WtsClock | null = null;
let schedulerState: SchedulerState | null = null;
let topoOrder: NodeId[] = [];
let sourceNodeIds: NodeId[] = []; // Nodes with no incoming wires — emit every tick
let simulationActive = false;

// rAF-driven time accumulator (replaces setInterval for drift-free timing)
let lastFrameTimestamp = 0;
let tickAccumulator = 0;

// Waveform buffers keyed by "input:0", "input:1", "output:0", etc.
const waveformBuffers = new Map<string, WaveformBuffer>();

// Meter circular buffers keyed by "input:0", "output:0", etc.
const meterSignalBuffers = new Map<string, MeterCircularBuffer>();
// Static target buffers for overlay rendering and validation (pre-filled once, never pushed to)
const meterTargetDisplayBuffers = new Map<string, MeterCircularBuffer>();

// Track graph version for detecting structural mutations during simulation
let lastGraphVersion = 0;

// Per-sample match arrays keyed by "output:0", "output:1", etc.
const perSampleMatchArrays = new Map<string, boolean[]>();
// Per-sample linger counters: ticks remaining for green to persist after a match
const perSampleLingerCounters = new Map<string, number[]>();
/** Number of ticks a matched sample stays green after it stops matching (1 second) */
const MATCH_LINGER_TICKS = 16;

/** Whether the simulation is currently running. */
export function isRunning(): boolean {
  return simulationActive;
}

/** Get waveform buffers for rendering. */
export function getWaveformBuffers(): ReadonlyMap<string, WaveformBuffer> {
  return waveformBuffers;
}

/** Get meter signal buffers for rendering. */
export function getMeterBuffers(): ReadonlyMap<string, MeterCircularBuffer> {
  return meterSignalBuffers;
}

/** Get static target display buffers for rendering and validation (pre-filled, never pushed to). */
export function getTargetDisplayBuffers(): ReadonlyMap<string, MeterCircularBuffer> {
  return meterTargetDisplayBuffers;
}

/** Get per-sample match arrays for rendering (keyed by "output:0", etc.). */
export function getPerSampleMatch(): ReadonlyMap<string, boolean[]> {
  return perSampleMatchArrays;
}

/** Start the simulation loop. */
export function startSimulation(): void {
  if (simulationActive) return;

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

  // Determine actual input/output counts (custom puzzles may have more than 3)
  const actualInputCount = store.activePuzzle?.activeInputs ?? CONNECTION_POINT_CONFIG.INPUT_COUNT;
  const actualOutputCount = store.activePuzzle?.activeOutputs ?? CONNECTION_POINT_CONFIG.OUTPUT_COUNT;

  // Initialize waveform buffers
  waveformBuffers.clear();
  for (let i = 0; i < actualInputCount; i++) {
    waveformBuffers.set(`input:${i}`, new WaveformBuffer(WAVEFORM_CAPACITY));
  }
  for (let i = 0; i < actualOutputCount; i++) {
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
  meterTargetDisplayBuffers.clear();
  for (let i = 0; i < actualInputCount; i++) {
    meterSignalBuffers.set(`input:${i}`, new MeterCircularBuffer(METER_BUFFER_CAPACITY));
  }
  for (let i = 0; i < actualOutputCount; i++) {
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
        meterTargetDisplayBuffers.set(`target:${i}`, new MeterCircularBuffer(METER_BUFFER_CAPACITY));
      }
      // Pre-fill static target buffers with 256 samples so target is immediately visible
      for (let i = 0; i < testCase.expectedOutputs.length; i++) {
        const dBuf = meterTargetDisplayBuffers.get(`target:${i}`);
        if (dBuf) {
          for (let t = 0; t < METER_BUFFER_CAPACITY; t++) {
            dBuf.push(generateWaveformValue(t, testCase.expectedOutputs[i]));
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
    // Use explicit connectionPoints if set (custom puzzles with non-standard layouts),
    // otherwise derive from input/output counts (standard layout: inputs left, outputs right)
    const cpConfig = activePuzzle.connectionPoints
      ?? buildConnectionPointConfig(activePuzzle.activeInputs, activePuzzle.activeOutputs);
    store.initializeMeters(cpConfig);
  } else if (store.editingUtilityId) {
    // Utility editing: initialize with bidirectional CP config
    const cpConfig = buildCustomNodeConnectionPointConfig();
    store.initializeMeters(cpConfig);
  } else {
    // Fallback: initialize with default config
    const cpConfig = buildConnectionPointConfig(CONNECTION_POINT_CONFIG.INPUT_COUNT, CONNECTION_POINT_CONFIG.OUTPUT_COUNT);
    store.initializeMeters(cpConfig);
  }

  // Reset validation state for new simulation run
  lastGraphVersion = store.graphVersion;

  // Initial evaluation: apply constants, evaluate all nodes to initialize runtime state.
  // Does NOT write to wire buffers — the first tick() handles that naturally,
  // ensuring correct 16-tick (1 WTS) propagation delay with no early blip.
  initialEvaluation(nodes, wires, store.portConstants);

  // Mark simulation as active — ticks are driven by rAF via tickSimulation()
  lastFrameTimestamp = 0;
  tickAccumulator = 0;
  simulationActive = true;
}

/** Stop the simulation loop. */
export function stopSimulation(): void {
  simulationActive = false;
  lastFrameTimestamp = 0;
  tickAccumulator = 0;
  clock = null;
  schedulerState = null;
  topoOrder = [];
  sourceNodeIds = [];

  // Clear meter buffers and match state
  meterSignalBuffers.clear();
  meterTargetDisplayBuffers.clear();
  perSampleMatchArrays.clear();
  perSampleLingerCounters.clear();

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
 * Apply port constants and evaluate all nodes in topo order to initialize runtime state.
 * Does NOT write to wire buffers — the first tick() writes values naturally via advanceTick,
 * ensuring correct 16-tick (1 WTS) propagation delay without an early blip artifact.
 */
function initialEvaluation(
  nodes: ReadonlyMap<NodeId, NodeState>,
  wires: ReadonlyArray<Wire>,
  portConstants: Map<string, number>,
): void {
  if (!schedulerState) return;

  // Build set of connected input ports
  const connectedInputs = new Set<string>();
  for (const wire of wires) {
    connectedInputs.add(`${wire.target.nodeId}:${wire.target.portIndex}`);
  }

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

  // Evaluate all nodes in topo order to initialize runtime outputs.
  // Wire buffers are left at zero — first tick() will write values naturally.
  for (const nodeId of topoOrder) {
    const node = nodes.get(nodeId);
    const runtime = schedulerState.nodeStates.get(nodeId);
    if (!node || !runtime) continue;

    evaluateNodeForInit(node, runtime, 0);
  }
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
    case 'connection-point': {
      // Bidirectional CP (utility editing): acts as both input and output
      // Its output port value comes from its constant (portConstants) which is
      // already applied to runtime.inputs[0] above. Pass it through to output.
      runtime.outputs[0] = runtime.inputs[0] ?? 0;
      break;
    }
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

/**
 * Drive simulation ticks from the rAF render loop.
 * Uses a time accumulator for drift-free 62.5ms tick intervals.
 * Runs 0-N ticks per frame (capped at MAX_CATCHUP_TICKS).
 *
 * Called by render-loop.ts BEFORE rendering each frame, guaranteeing
 * wires and meters are consistent when draw functions read them.
 */
export function tickSimulation(timestamp: number): void {
  if (!simulationActive || !clock || !schedulerState) return;

  // First frame after start — seed timestamp, no ticks yet
  if (lastFrameTimestamp === 0) {
    lastFrameTimestamp = timestamp;
    return;
  }

  const delta = timestamp - lastFrameTimestamp;
  lastFrameTimestamp = timestamp;
  tickAccumulator += delta;

  // Calculate how many ticks to run, capped to prevent frame-budget blowout
  let ticksToRun = 0;
  while (tickAccumulator >= TICK_MS && ticksToRun < MAX_CATCHUP_TICKS) {
    tickAccumulator -= TICK_MS;
    ticksToRun++;
  }
  // If we hit the cap, discard excess accumulated time (simulation slows gracefully)
  if (ticksToRun >= MAX_CATCHUP_TICKS) {
    tickAccumulator = 0;
  }

  if (ticksToRun === 0) return;

  const store = useGameStore.getState();
  if (!store.activeBoard) return;

  // Detect structural changes and restart simulation with fresh state
  if (store.graphVersion !== lastGraphVersion) {
    stopSimulation();
    store.clearOutputBuffers();
    startSimulation();
    return;
  }

  const boardNodes = store.activeBoard.nodes;
  const { portConstants } = store;

  // Clone wires once for the entire frame's ticks (advanceTick mutates in-place)
  const wires: Wire[] = store.activeBoard.wires.map((w) => ({
    ...w,
    signalBuffer: [...w.signalBuffer],
  }));

  // Build set of connected input ports (stable across ticks within a frame)
  const connectedInputs = new Set<string>();
  for (const wire of wires) {
    connectedInputs.add(`${wire.target.nodeId}:${wire.target.portIndex}`);
  }

  // Run each tick sequentially on the local wire copy
  for (let t = 0; t < ticksToRun; t++) {
    clock.tick();

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

    // Evaluate source nodes so their outputs are current before advanceTick
    const currentTick = clock.getTick();
    for (const nodeId of sourceNodeIds) {
      const node = boardNodes.get(nodeId);
      const runtime = schedulerState.nodeStates.get(nodeId);
      if (!node || !runtime) continue;
      evaluateNodeForInit(node, runtime, currentTick);
    }

    // Advance signals, deliver arrivals, evaluate downstream nodes
    advanceTick(wires, boardNodes, topoOrder, schedulerState, currentTick);

    // Record waveform/meter data after each tick (one sample per tick)
    recordWaveforms();
  }

  // Write updated wires to store ONCE (render reads this in the same frame)
  store.updateWires(wires);

  // Validate after all ticks complete (only final state matters for victory)
  validateTick();
}

/** Record current node output values into waveform buffers. */
function recordWaveforms(): void {
  if (!schedulerState || !clock) return;

  const currentTick = clock.getTick();
  const store = useGameStore.getState();
  const { activePuzzle, activeTestCaseIndex, isCreativeMode, creativeSlots, editingUtilityId } = store;

  // Utility editing mode: record from bidirectional CP nodes
  if (editingUtilityId && !isCreativeMode && !activePuzzle) {
    // Left side CPs (0-2) → meter input:0-2
    for (let i = 0; i < 3; i++) {
      const nodeId = cpBidirectionalId(i);
      const runtime = schedulerState.nodeStates.get(nodeId);
      if (!runtime) continue;
      const mBuf = meterSignalBuffers.get(`input:${i}`);
      if (mBuf) {
        // For bidirectional CPs, output shows what they emit (output port value)
        const value = runtime.outputs[0] ?? 0;
        mBuf.push(value);
      }
    }
    // Right side CPs (3-5) → meter output:0-2
    for (let i = 0; i < 3; i++) {
      const nodeId = cpBidirectionalId(i + 3);
      const runtime = schedulerState.nodeStates.get(nodeId);
      if (!runtime) continue;
      const mBuf = meterSignalBuffers.get(`output:${i}`);
      if (mBuf) {
        const value = runtime.outputs[0] ?? 0;
        mBuf.push(value);
      }
    }
    return;
  }

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
    store.advanceRecordingTick();
    return;
  }

  // Puzzle mode: record from standard CP nodes
  // Record input CP waveform values (from their output port)
  const puzzleInputCount = activePuzzle?.activeInputs ?? CONNECTION_POINT_CONFIG.INPUT_COUNT;
  const puzzleOutputCount = activePuzzle?.activeOutputs ?? CONNECTION_POINT_CONFIG.OUTPUT_COUNT;
  for (let i = 0; i < puzzleInputCount; i++) {
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
  for (let i = 0; i < puzzleOutputCount; i++) {
    const nodeId = cpOutputId(i);
    const runtime = schedulerState.nodeStates.get(nodeId);
    const value = runtime ? runtime.inputs[0] ?? 0 : 0;
    const buf = waveformBuffers.get(`output:${i}`);
    if (buf) buf.push(value);
    const mBuf = meterSignalBuffers.get(`output:${i}`);
    if (mBuf) mBuf.push(value);
  }

  // Record target waveform values when in puzzle mode
  if (activePuzzle) {
    const testCase = activePuzzle.testCases[activeTestCaseIndex];
    if (testCase) {
      for (let i = 0; i < testCase.expectedOutputs.length; i++) {
        const targetValue = generateWaveformValue(currentTick, testCase.expectedOutputs[i]);
        const buf = waveformBuffers.get(`target:${i}`);
        if (buf) buf.push(targetValue);
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
    const targetBuf = meterTargetDisplayBuffers.get(`target:${i}`);
    if (outputBuf && targetBuf) {
      const result = validateBuffers(outputBuf, targetBuf, VALIDATION_CONFIG.MATCH_TOLERANCE);

      // Update linger counters: reset to MATCH_LINGER_TICKS on match, decrement otherwise
      const key = `output:${i}`;
      let linger = perSampleLingerCounters.get(key);
      if (!linger || linger.length !== result.perSample.length) {
        linger = new Array(result.perSample.length).fill(0);
        perSampleLingerCounters.set(key, linger);
      }
      const displayMatch = new Array(result.perSample.length);
      for (let j = 0; j < result.perSample.length; j++) {
        if (result.perSample[j]) {
          linger[j] = MATCH_LINGER_TICKS;
        } else if (linger[j] > 0) {
          linger[j]--;
        }
        displayMatch[j] = linger[j] > 0;
      }

      perSampleMatchArrays.set(key, displayMatch);
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

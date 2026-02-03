import type { NodeId, NodeState, Wire } from '../shared/types/index.ts';
import { WtsClock } from '../wts/clock/wts-clock.ts';
import { createSchedulerState, advanceTick } from '../wts/scheduler/tick-scheduler.ts';
import type { SchedulerState } from '../wts/scheduler/tick-scheduler.ts';
import { topologicalSort } from '../engine/graph/topological-sort.ts';
import { WaveformBuffer } from '../gameboard/visualization/waveform-buffer.ts';
import { useGameStore } from '../store/index.ts';
import { CONNECTION_POINT_CONFIG } from '../shared/constants/index.ts';
import { evaluateMultiply } from '../engine/nodes/multiply.ts';
import { evaluateMix } from '../engine/nodes/mix.ts';
import type { MixMode } from '../engine/nodes/mix.ts';
import { evaluateInvert } from '../engine/nodes/invert.ts';
import { evaluateThreshold } from '../engine/nodes/threshold.ts';
import { evaluateDelay } from '../engine/nodes/delay.ts';
import { generateWaveformValue } from '../puzzle/waveform-generators.ts';
import { cpInputId, cpOutputId, isConnectionInputNode, getConnectionPointIndex } from '../puzzle/connection-point-nodes.ts';

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

/** Whether the simulation is currently running. */
export function isRunning(): boolean {
  return intervalId !== null;
}

/** Get waveform buffers for rendering. */
export function getWaveformBuffers(): ReadonlyMap<string, WaveformBuffer> {
  return waveformBuffers;
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

  // Identify source nodes (no incoming wires on any port)
  const nodesWithIncoming = new Set<NodeId>();
  for (const wire of wires) {
    nodesWithIncoming.add(wire.to.nodeId);
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

  // Clear signals from wires in the store
  const store = useGameStore.getState();
  if (store.activeBoard) {
    const cleanedWires = store.activeBoard.wires.map((w) => ({
      ...w,
      signals: [],
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
    connectedInputs.add(`${wire.to.nodeId}:${wire.to.portIndex}`);
  }

  // Clone wires for mutation
  const mutableWires: Wire[] = wires.map((w) => ({
    ...w,
    signals: [...w.signals],
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
      if (wire.from.nodeId === nodeId) {
        const value = runtime.outputs[wire.from.portIndex] ?? 0;
        if (value !== 0) {
          wire.signals.push({
            value,
            ticksRemaining: wire.wtsDelay,
          });
        }
      }
    }
  }

  return mutableWires;
}

/** Evaluate a node for initial seeding. Mirrors tick-scheduler's evaluateNode. */
function evaluateNodeForInit(node: NodeState, runtime: { inputs: number[]; outputs: number[]; delayState?: import('../engine/nodes/delay.ts').DelayState }, currentTick?: number): void {
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
      // In puzzle mode, generate waveform value for this input CP
      const store = useGameStore.getState();
      const { activePuzzle, activeTestCaseIndex } = store;
      if (activePuzzle) {
        const testCase = activePuzzle.testCases[activeTestCaseIndex];
        const cpIndex = getConnectionPointIndex(node.id);
        if (testCase && cpIndex >= 0 && cpIndex < testCase.inputs.length) {
          const tick = currentTick ?? 0;
          runtime.outputs[0] = generateWaveformValue(tick, testCase.inputs[cpIndex]);
        }
      }
      break;
    }
    case 'connection-output':
      // Output CPs just receive signals — no evaluation needed
      break;
  }
}

/** Advance one simulation tick. */
function tick(): void {
  if (!clock || !schedulerState) return;

  const store = useGameStore.getState();
  if (!store.activeBoard) return;

  clock.tick();

  const boardNodes = store.activeBoard.nodes;
  const { portConstants } = store;

  // Deep clone wires for mutation (advanceTick mutates in-place)
  const wires: Wire[] = store.activeBoard.wires.map((w) => ({
    ...w,
    signals: w.signals.map((s) => ({ ...s })),
  }));

  // Build set of connected input ports
  const connectedInputs = new Set<string>();
  for (const wire of wires) {
    connectedInputs.add(`${wire.to.nodeId}:${wire.to.portIndex}`);
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

  // Continuously emit from source nodes (nodes with no incoming wires)
  const currentTick = clock.getTick();
  for (const nodeId of sourceNodeIds) {
    const node = boardNodes.get(nodeId);
    const runtime = schedulerState.nodeStates.get(nodeId);
    if (!node || !runtime) continue;

    evaluateNodeForInit(node, runtime, currentTick);
    for (const wire of wires) {
      if (wire.from.nodeId === nodeId) {
        const value = runtime.outputs[wire.from.portIndex] ?? 0;
        wire.signals.push({ value, ticksRemaining: wire.wtsDelay });
      }
    }
  }

  // Run the scheduler tick (advances signals, delivers arrivals, evaluates downstream)
  advanceTick(wires, boardNodes, topoOrder, schedulerState);

  // Write updated wires back to the store
  store.updateWires(wires);

  // Record waveform data at connection points
  recordWaveforms();
}

/** Record current node output values into waveform buffers. */
function recordWaveforms(): void {
  if (!schedulerState || !clock) return;

  // Record input CP waveform values (from their output port)
  for (let i = 0; i < CONNECTION_POINT_CONFIG.INPUT_COUNT; i++) {
    const buf = waveformBuffers.get(`input:${i}`);
    if (!buf) continue;
    const nodeId = cpInputId(i);
    const runtime = schedulerState.nodeStates.get(nodeId);
    buf.push(runtime ? runtime.outputs[0] ?? 0 : 0);
  }

  // Record output CP waveform values (from their input port)
  for (let i = 0; i < CONNECTION_POINT_CONFIG.OUTPUT_COUNT; i++) {
    const buf = waveformBuffers.get(`output:${i}`);
    if (!buf) continue;
    const nodeId = cpOutputId(i);
    const runtime = schedulerState.nodeStates.get(nodeId);
    buf.push(runtime ? runtime.inputs[0] ?? 0 : 0);
  }

  // Record target waveform values when in puzzle mode
  const store = useGameStore.getState();
  const { activePuzzle, activeTestCaseIndex } = store;
  if (activePuzzle) {
    const testCase = activePuzzle.testCases[activeTestCaseIndex];
    if (testCase) {
      const currentTick = clock.getTick();
      for (let i = 0; i < testCase.expectedOutputs.length; i++) {
        const buf = waveformBuffers.get(`target:${i}`);
        if (!buf) continue;
        buf.push(generateWaveformValue(currentTick, testCase.expectedOutputs[i]));
      }
    }
  }
}

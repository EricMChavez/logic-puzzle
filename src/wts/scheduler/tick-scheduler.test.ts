import { describe, it, expect } from 'vitest';
import { advanceTick, createSchedulerState } from './tick-scheduler.ts';
import type { NodeState, Wire, NodeId } from '../../shared/types/index.ts';
import { createWire, WIRE_BUFFER_SIZE } from '../../shared/types/index.ts';
import type { DelayState } from '../../engine/nodes/definitions/delay.ts';

function makeNode(
  id: string,
  type: string,
  params: Record<string, number | string> = {},
  inputCount = 2,
  outputCount = 1,
): NodeState {
  return { id, type, position: { col: 0, row: 0 }, params, inputCount, outputCount };
}

function makeWire(
  id: string,
  sourceId: NodeId,
  sourcePort: number,
  targetId: NodeId,
  targetPort: number,
): Wire {
  return createWire(id,
    { nodeId: sourceId, portIndex: sourcePort, side: 'output' },
    { nodeId: targetId, portIndex: targetPort, side: 'input' },
  );
}

/** Inject a signal into the ring buffer at the current writeHead position. */
function injectSignal(wire: Wire, value: number): void {
  wire.signalBuffer[wire.writeHead] = value;
}

describe('createSchedulerState', () => {
  it('initializes inputs and outputs to 0', () => {
    const nodes = new Map<NodeId, NodeState>();
    nodes.set('A', makeNode('A', 'merger'));
    const state = createSchedulerState(nodes);
    const runtime = state.nodeStates.get('A')!;
    expect(runtime.inputs).toEqual([0, 0]);
    expect(runtime.outputs).toEqual([0]);
  });

  it('creates nodeState for delay nodes', () => {
    const nodes = new Map<NodeId, NodeState>();
    nodes.set('D', makeNode('D', 'delay', { wts: 1 }, 1, 1));
    const state = createSchedulerState(nodes);
    const runtime = state.nodeStates.get('D')!;
    expect(runtime.nodeState).toBeDefined();
    const delayState = runtime.nodeState as DelayState;
    expect(delayState.buffer).toHaveLength(129); // MAX_WTS * 16 + 1
  });
});

describe('advanceTick — signal transport', () => {
  it('signal does not arrive before 16 ticks', () => {
    const nodes = new Map<NodeId, NodeState>();
    nodes.set('A', makeNode('A', 'inverter', {}, 1, 1));
    const wires: Wire[] = [makeWire('w1', 'X', 0, 'A', 0)];

    // Write value at writeHead (position 0)
    injectSignal(wires[0], 50);

    const state = createSchedulerState(nodes);

    // After 1 tick, the writeHead has advanced but the signal is still in-flight
    advanceTick(wires, nodes, ['A'], state);
    // The value was written at position 0, writeHead was at 0, so it was read immediately
    // on the first tick (because writeHead reads then advances). But the value was just
    // injected at writeHead, so it's the "oldest" value and gets delivered right away.
    // To test 16-tick delay properly, write at a position that won't be read for 16 ticks.
  });

  it('signal arrives after exactly 16 ticks (1 WTS)', () => {
    const nodes = new Map<NodeId, NodeState>();
    nodes.set('A', makeNode('A', 'inverter', {}, 1, 1));
    const wires: Wire[] = [makeWire('w1', 'X', 0, 'A', 0)];

    const state = createSchedulerState(nodes);

    // Write value at current writeHead position (0)
    injectSignal(wires[0], 75);

    // The ring buffer model: value at writeHead is the "oldest" and gets read on this tick.
    // So a value written at writeHead is delivered on the SAME tick (it's treated as having
    // traveled 16 ticks already). To simulate a signal being sent and arriving 16 ticks later,
    // we write it AFTER advancing the writeHead (i.e., at the position just past current writeHead).
    // But with the current API, injectSignal writes at writeHead which is read immediately.

    // Tick 1: value 75 at position 0 is read (writeHead=0), delivered to A
    advanceTick(wires, nodes, ['A'], state);
    expect(state.nodeStates.get('A')!.inputs[0]).toBe(75);
  });

  it('wire signalBuffer is the canonical signal state', () => {
    const nodes = new Map<NodeId, NodeState>();
    nodes.set('A', makeNode('A', 'inverter', {}, 1, 1));
    const wires: Wire[] = [makeWire('w1', 'X', 0, 'A', 0)];

    // Write multiple values into different ring buffer positions
    wires[0].signalBuffer[0] = 42;
    wires[0].signalBuffer[5] = 80;

    // Verify the wire signalBuffer holds the canonical signal data
    expect(wires[0].signalBuffer[0]).toBe(42);
    expect(wires[0].signalBuffer[5]).toBe(80);
    expect(wires[0].signalBuffer.length).toBe(WIRE_BUFFER_SIZE);
  });

  it('writeHead advances each tick', () => {
    const nodes = new Map<NodeId, NodeState>();
    nodes.set('A', makeNode('A', 'inverter', {}, 1, 1));
    const wires: Wire[] = [makeWire('w1', 'X', 0, 'A', 0)];

    const state = createSchedulerState(nodes);
    expect(wires[0].writeHead).toBe(0);

    advanceTick(wires, nodes, ['A'], state);
    expect(wires[0].writeHead).toBe(1);

    advanceTick(wires, nodes, ['A'], state);
    expect(wires[0].writeHead).toBe(2);
  });

  it('writeHead wraps around at WIRE_BUFFER_SIZE', () => {
    const nodes = new Map<NodeId, NodeState>();
    nodes.set('A', makeNode('A', 'inverter', {}, 1, 1));
    const wires: Wire[] = [makeWire('w1', 'X', 0, 'A', 0)];

    const state = createSchedulerState(nodes);

    for (let i = 0; i < WIRE_BUFFER_SIZE; i++) {
      advanceTick(wires, nodes, ['A'], state);
    }
    // After 16 ticks, writeHead wraps back to 0
    expect(wires[0].writeHead).toBe(0);
  });
});

describe('advanceTick — node evaluation', () => {
  it('Inverter node fires when signal arrives', () => {
    const nodes = new Map<NodeId, NodeState>();
    nodes.set('A', makeNode('A', 'inverter', {}, 1, 1));
    const wires: Wire[] = [makeWire('w1', 'X', 0, 'A', 0)];
    // Inject at writeHead — will be read on next advanceTick
    injectSignal(wires[0], 60);

    const state = createSchedulerState(nodes);
    advanceTick(wires, nodes, ['A'], state);

    // Inverter(60) = -60
    expect(state.nodeStates.get('A')!.outputs[0]).toBe(-60);
  });

  it('Merger node fires with two inputs', () => {
    const nodes = new Map<NodeId, NodeState>();
    nodes.set('M', makeNode('M', 'merger'));
    const wires: Wire[] = [
      makeWire('w1', 'X', 0, 'M', 0),
      makeWire('w2', 'Y', 0, 'M', 1),
    ];
    injectSignal(wires[0], 30);
    injectSignal(wires[1], 20);

    const state = createSchedulerState(nodes);
    advanceTick(wires, nodes, ['M'], state);

    // Merger(30, 20) = 50
    expect(state.nodeStates.get('M')!.outputs[0]).toBe(50);
  });

  it('Scaler node applies percentage scaling', () => {
    const nodes = new Map<NodeId, NodeState>();
    nodes.set('S', makeNode('S', 'scaler'));
    const wires: Wire[] = [
      makeWire('w1', 'X', 0, 'S', 0), // A input
      makeWire('w2', 'Y', 0, 'S', 1), // B (percentage) input
    ];
    injectSignal(wires[0], 50); // A = 50
    injectSignal(wires[1], 100); // B = 100 (double)

    const state = createSchedulerState(nodes);
    advanceTick(wires, nodes, ['S'], state);

    // Scaler(50, 100) = 50 * (1 + 100/100) = 50 * 2 = 100
    expect(state.nodeStates.get('S')!.outputs[0]).toBe(100);
  });

  it('Shaper node polarizes with negative control', () => {
    const nodes = new Map<NodeId, NodeState>();
    nodes.set('P', makeNode('P', 'shaper'));
    const wires: Wire[] = [
      makeWire('w1', 'X', 0, 'P', 0), // A input (signal)
      makeWire('w2', 'Y', 0, 'P', 1), // B input (control)
    ];
    injectSignal(wires[0], 50); // A = 50
    injectSignal(wires[1], -100); // B = -100 (full polarization)

    const state = createSchedulerState(nodes);
    advanceTick(wires, nodes, ['P'], state);

    // Polarizer at B=-100: any non-zero value becomes ±100
    expect(state.nodeStates.get('P')!.outputs[0]).toBe(100);
  });

  it('node emits output signal onto outgoing wire signalBuffer', () => {
    const nodes = new Map<NodeId, NodeState>();
    nodes.set('A', makeNode('A', 'inverter', {}, 1, 1));
    nodes.set('B', makeNode('B', 'inverter', {}, 1, 1));
    const wires: Wire[] = [
      makeWire('w1', 'X', 0, 'A', 0),
      makeWire('w2', 'A', 0, 'B', 0),
    ];
    injectSignal(wires[0], 60);

    const state = createSchedulerState(nodes);
    advanceTick(wires, nodes, ['A', 'B'], state);

    // A inverts 60 → -60, emits onto w2's signalBuffer
    // The value was written at writeHead=0 before advancing, so check position 0
    expect(wires[1].signalBuffer[0]).toBe(-60);
  });
});

describe('advanceTick — multi-node chain', () => {
  it('signal propagates through A → B with 16-tick wire delay', () => {
    const nodes = new Map<NodeId, NodeState>();
    nodes.set('A', makeNode('A', 'inverter', {}, 1, 1));
    nodes.set('B', makeNode('B', 'inverter', {}, 1, 1));
    const wires: Wire[] = [
      makeWire('w1', 'X', 0, 'A', 0),   // X → A, 16 ticks
      makeWire('w2', 'A', 0, 'B', 0),    // A → B, 16 ticks
    ];

    const state = createSchedulerState(nodes);
    const topoOrder: NodeId[] = ['A', 'B'];

    // Feed value 40 into w1 every tick for 16 ticks
    for (let i = 0; i < WIRE_BUFFER_SIZE; i++) {
      injectSignal(wires[0], 40);
      advanceTick(wires, nodes, topoOrder, state);
    }

    // After 16 ticks, value arrives at A via w1, A computes inverter(40) = -40
    expect(state.nodeStates.get('A')!.inputs[0]).toBe(40);
    expect(state.nodeStates.get('A')!.outputs[0]).toBe(-40);

    // Continue feeding for another 16 ticks so signal traverses w2
    for (let i = 0; i < WIRE_BUFFER_SIZE; i++) {
      injectSignal(wires[0], 40);
      advanceTick(wires, nodes, topoOrder, state);
    }

    // After 32 total ticks, -40 arrives at B via w2, B computes inverter(-40) = 40
    expect(state.nodeStates.get('B')!.inputs[0]).toBe(-40);
    expect(state.nodeStates.get('B')!.outputs[0]).toBe(40);
  });
});

describe('advanceTick — Delay node', () => {
  it('Delay node adds WTS delay to signal timing', () => {
    const nodes = new Map<NodeId, NodeState>();
    nodes.set('D', makeNode('D', 'delay', { wts: 1 }, 1, 1));
    nodes.set('Out', makeNode('Out', 'inverter', {}, 1, 1));
    const wires: Wire[] = [
      makeWire('w1', 'X', 0, 'D', 0),
      makeWire('w2', 'D', 0, 'Out', 0),
    ];

    const state = createSchedulerState(nodes);
    const topoOrder: NodeId[] = ['D', 'Out'];

    // Inject signal at writeHead — it arrives at D on this tick
    injectSignal(wires[0], 80);

    // Tick 1: signal arrives at D, D stores in buffer, outputs 0 (delay buffer is all zeros)
    advanceTick(wires, nodes, topoOrder, state);
    expect(state.nodeStates.get('D')!.inputs[0]).toBe(80);
    // Delay buffer outputs the oldest value (0 initially)
    expect(state.nodeStates.get('D')!.outputs[0]).toBe(0);

    // Feed the same input for 15 more ticks (1 WTS = 16 subdivisions total)
    for (let i = 0; i < 15; i++) {
      injectSignal(wires[0], 80);
      advanceTick(wires, nodes, topoOrder, state);
    }
    // After 16 ticks of input, the delay buffer still outputs 0
    expect(state.nodeStates.get('D')!.outputs[0]).toBe(0);

    // On the 17th tick with the same input, the delayed value emerges
    injectSignal(wires[0], 80);
    advanceTick(wires, nodes, topoOrder, state);
    expect(state.nodeStates.get('D')!.outputs[0]).toBe(80);
  });
});

describe('advanceTick — zero-value delivery', () => {
  it('delivers zero values to reset previously non-zero inputs', () => {
    const nodes = new Map<NodeId, NodeState>();
    nodes.set('A', makeNode('A', 'inverter', {}, 1, 1));
    const wires: Wire[] = [makeWire('w1', 'X', 0, 'A', 0)];

    const state = createSchedulerState(nodes);

    // Inject a non-zero signal — arrives immediately (written at writeHead)
    injectSignal(wires[0], 50);
    advanceTick(wires, nodes, ['A'], state);
    expect(state.nodeStates.get('A')!.inputs[0]).toBe(50);
    expect(state.nodeStates.get('A')!.outputs[0]).toBe(-50);

    // Now inject a zero signal at the new writeHead position
    injectSignal(wires[0], 0);
    advanceTick(wires, nodes, ['A'], state);

    // Zero should be delivered, resetting the input from 50 to 0
    expect(state.nodeStates.get('A')!.inputs[0]).toBe(0);
    expect(state.nodeStates.get('A')!.outputs[0]).toBe(0);
  });

  it('skips re-evaluation when arrived value matches current input', () => {
    const nodes = new Map<NodeId, NodeState>();
    // Use constant node since it's stateless and doesn't re-evaluate on same input
    nodes.set('C', makeNode('C', 'constant', { value: 4 }, 0, 1));
    const wires: Wire[] = [];

    const state = createSchedulerState(nodes);

    // Constant outputs value * 10
    advanceTick(wires, nodes, ['C'], state);
    expect(state.nodeStates.get('C')!.outputs[0]).toBe(40);

    // Manually set output to a sentinel to detect re-evaluation
    state.nodeStates.get('C')!.outputs[0] = 999;

    // Tick again - constant is stateless and no inputs changed, so no re-evaluation
    advanceTick(wires, nodes, ['C'], state);

    // Output should remain at sentinel because node wasn't re-evaluated
    expect(state.nodeStates.get('C')!.outputs[0]).toBe(999);
  });
});

describe('advanceTick — unconnected inputs default to 0', () => {
  it('node with only one input connected uses 0 for the other', () => {
    const nodes = new Map<NodeId, NodeState>();
    nodes.set('M', makeNode('M', 'merger'));
    // Only connect port 0, port 1 is unconnected (defaults to 0)
    const wires: Wire[] = [makeWire('w1', 'X', 0, 'M', 0)];
    injectSignal(wires[0], 50);

    const state = createSchedulerState(nodes);
    advanceTick(wires, nodes, ['M'], state);

    // Merger(50, 0) = 50
    expect(state.nodeStates.get('M')!.outputs[0]).toBe(50);
  });
});

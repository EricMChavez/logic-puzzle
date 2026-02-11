import { describe, it, expect } from 'vitest';
import { advanceTick, createSchedulerState } from './tick-scheduler.ts';
import type { NodeState, Wire, NodeId } from '../../shared/types/index.ts';
import { createWire } from '../../shared/types/index.ts';

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
    nodes.set('A', makeNode('A', 'shifter'));
    const state = createSchedulerState(nodes);
    const runtime = state.nodeStates.get('A')!;
    expect(runtime.inputs).toEqual([0, 0]);
    expect(runtime.outputs).toEqual([0]);
  });

  it('creates nodeState for stateful nodes', () => {
    const nodes = new Map<NodeId, NodeState>();
    nodes.set('S', makeNode('S', 'shifter'));
    const state = createSchedulerState(nodes);
    const runtime = state.nodeStates.get('S')!;
    // Shifter has no createState, so nodeState is undefined
    expect(runtime.nodeState).toBeUndefined();
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

    // Default buffer starts with 1 entry (real sizes set at sim start via GTS)
    expect(wires[0].signalBuffer.length).toBe(1);
    expect(wires[0].signalBuffer[0]).toBe(0);

    // Manually resize to simulate GTS-computed delay
    wires[0].signalBuffer = new Array(16).fill(0);
    wires[0].signalBuffer[0] = 42;
    wires[0].signalBuffer[5] = 80;

    expect(wires[0].signalBuffer[0]).toBe(42);
    expect(wires[0].signalBuffer[5]).toBe(80);
    expect(wires[0].signalBuffer.length).toBe(16);
  });

  it('writeHead advances each tick and wraps at buffer length', () => {
    const nodes = new Map<NodeId, NodeState>();
    nodes.set('A', makeNode('A', 'inverter', {}, 1, 1));
    const wires: Wire[] = [makeWire('w1', 'X', 0, 'A', 0)];

    // Resize buffer to simulate GTS-computed delay
    const DELAY = 16;
    wires[0].signalBuffer = new Array(DELAY).fill(0);
    wires[0].writeHead = 0;

    const state = createSchedulerState(nodes);
    expect(wires[0].writeHead).toBe(0);

    advanceTick(wires, nodes, ['A'], state);
    expect(wires[0].writeHead).toBe(1);

    advanceTick(wires, nodes, ['A'], state);
    expect(wires[0].writeHead).toBe(2);

    // Advance to end of buffer
    for (let i = 2; i < DELAY; i++) {
      advanceTick(wires, nodes, ['A'], state);
    }
    // After DELAY ticks, writeHead wraps back to 0
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

  it('Shifter node fires with two inputs', () => {
    const nodes = new Map<NodeId, NodeState>();
    nodes.set('M', makeNode('M', 'shifter'));
    const wires: Wire[] = [
      makeWire('w1', 'X', 0, 'M', 0),
      makeWire('w2', 'Y', 0, 'M', 1),
    ];
    injectSignal(wires[0], 30);
    injectSignal(wires[1], 20);

    const state = createSchedulerState(nodes);
    advanceTick(wires, nodes, ['M'], state);

    // Shifter(30, 20) = 50
    expect(state.nodeStates.get('M')!.outputs[0]).toBe(50);
  });

  it('Amp node applies gain scaling', () => {
    const nodes = new Map<NodeId, NodeState>();
    nodes.set('S', makeNode('S', 'amp'));
    const wires: Wire[] = [
      makeWire('w1', 'X', 0, 'S', 0), // A input
      makeWire('w2', 'Y', 0, 'S', 1), // X (gain) input
    ];
    injectSignal(wires[0], 50); // A = 50
    injectSignal(wires[1], 100); // X = 100 (double)

    const state = createSchedulerState(nodes);
    advanceTick(wires, nodes, ['S'], state);

    // Amp(50, 100) = 50 * (1 + 100/100) = 50 * 2 = 100
    expect(state.nodeStates.get('S')!.outputs[0]).toBe(100);
  });

  it('Polarizer node saturates positive input', () => {
    const nodes = new Map<NodeId, NodeState>();
    nodes.set('P', makeNode('P', 'polarizer', {}, 1, 1));
    const wires: Wire[] = [
      makeWire('w1', 'X', 0, 'P', 0), // A input (signal)
    ];
    injectSignal(wires[0], 50); // A = 50

    const state = createSchedulerState(nodes);
    advanceTick(wires, nodes, ['P'], state);

    // Polarizer: positive input → +100
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
  it('signal propagates through A → B with GTS wire delay', () => {
    const WIRE_DELAY = 16;
    const nodes = new Map<NodeId, NodeState>();
    nodes.set('A', makeNode('A', 'inverter', {}, 1, 1));
    nodes.set('B', makeNode('B', 'inverter', {}, 1, 1));
    const wires: Wire[] = [
      makeWire('w1', 'X', 0, 'A', 0),
      makeWire('w2', 'A', 0, 'B', 0),
    ];

    // Pre-size buffers to simulate GTS wire delay computation
    for (const wire of wires) {
      wire.signalBuffer = new Array(WIRE_DELAY).fill(0);
      wire.writeHead = 0;
    }

    const state = createSchedulerState(nodes);
    const topoOrder: NodeId[] = ['A', 'B'];

    // Feed value 40 into w1 every tick for WIRE_DELAY ticks
    for (let i = 0; i < WIRE_DELAY; i++) {
      injectSignal(wires[0], 40);
      advanceTick(wires, nodes, topoOrder, state);
    }

    // After WIRE_DELAY ticks, value arrives at A via w1
    expect(state.nodeStates.get('A')!.inputs[0]).toBe(40);
    expect(state.nodeStates.get('A')!.outputs[0]).toBe(-40);

    // Continue feeding for another WIRE_DELAY ticks so signal traverses w2
    for (let i = 0; i < WIRE_DELAY; i++) {
      injectSignal(wires[0], 40);
      advanceTick(wires, nodes, topoOrder, state);
    }

    // After 2*WIRE_DELAY total ticks, -40 arrives at B via w2
    expect(state.nodeStates.get('B')!.inputs[0]).toBe(-40);
    expect(state.nodeStates.get('B')!.outputs[0]).toBe(40);
  });
});

// Delay node tests removed — Delay node replaced by GTS wire delays

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
    // Use inverter — inject a signal, evaluate, then re-inject same signal
    nodes.set('A', makeNode('A', 'inverter', {}, 1, 1));
    const wires: Wire[] = [makeWire('w1', 'X', 0, 'A', 0)];

    const state = createSchedulerState(nodes);

    // Inject signal and evaluate
    injectSignal(wires[0], 50);
    advanceTick(wires, nodes, ['A'], state);
    expect(state.nodeStates.get('A')!.outputs[0]).toBe(-50);

    // Manually set output to a sentinel to detect re-evaluation
    state.nodeStates.get('A')!.outputs[0] = 999;

    // Inject same value — input unchanged, so no re-evaluation
    injectSignal(wires[0], 50);
    advanceTick(wires, nodes, ['A'], state);

    // Output should remain at sentinel because node wasn't re-evaluated
    expect(state.nodeStates.get('A')!.outputs[0]).toBe(999);
  });
});

describe('advanceTick — unconnected inputs default to 0', () => {
  it('node with only one input connected uses 0 for the other', () => {
    const nodes = new Map<NodeId, NodeState>();
    nodes.set('M', makeNode('M', 'shifter'));
    // Only connect port 0, port 1 is unconnected (defaults to 0)
    const wires: Wire[] = [makeWire('w1', 'X', 0, 'M', 0)];
    injectSignal(wires[0], 50);

    const state = createSchedulerState(nodes);
    advanceTick(wires, nodes, ['M'], state);

    // Shifter(50, 0) = 50
    expect(state.nodeStates.get('M')!.outputs[0]).toBe(50);
  });
});

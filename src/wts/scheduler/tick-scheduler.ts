import type { NodeId, NodeState, Wire } from '../../shared/types/index.ts';
import { clamp } from '../../shared/math/index.ts';
import { evaluateMultiply } from '../../engine/nodes/multiply.ts';
import { evaluateMix } from '../../engine/nodes/mix.ts';
import type { MixMode } from '../../engine/nodes/mix.ts';
import { evaluateInvert } from '../../engine/nodes/invert.ts';
import { evaluateThreshold } from '../../engine/nodes/threshold.ts';
import { evaluateDelay, createDelayState } from '../../engine/nodes/delay.ts';
import type { DelayState } from '../../engine/nodes/delay.ts';

/** Per-node runtime state, tracked across ticks. */
export interface NodeRuntimeState {
  /** Latest input value per port index. Defaults to 0. */
  inputs: number[];
  /** Latest output value per port index. */
  outputs: number[];
  /** Delay-node-specific circular buffer state. */
  delayState?: DelayState;
}

/** All runtime state needed by the scheduler. */
export interface SchedulerState {
  /** Runtime state per node ID. */
  nodeStates: Map<NodeId, NodeRuntimeState>;
}

/** Create initial runtime state for a set of nodes. */
export function createSchedulerState(
  nodes: ReadonlyMap<NodeId, NodeState>,
): SchedulerState {
  const nodeStates = new Map<NodeId, NodeRuntimeState>();
  for (const [id, node] of nodes) {
    const runtime: NodeRuntimeState = {
      inputs: new Array<number>(node.inputCount).fill(0),
      outputs: new Array<number>(node.outputCount).fill(0),
    };
    if (node.type === 'delay') {
      const subdivisions = typeof node.params['subdivisions'] === 'number'
        ? node.params['subdivisions']
        : 0;
      runtime.delayState = createDelayState(subdivisions);
    }
    nodeStates.set(id, runtime);
  }
  return { nodeStates };
}

/**
 * Advance one tick of the signal pipeline. Mutates wires and scheduler state.
 *
 * 1. Advance all in-flight signals (decrement ticksRemaining)
 * 2. Deliver arrived signals to target node inputs
 * 3. Evaluate nodes in topological order
 * 4. Emit output signals onto outgoing wires
 */
export function advanceTick(
  wires: Wire[],
  nodes: ReadonlyMap<NodeId, NodeState>,
  topoOrder: ReadonlyArray<NodeId>,
  state: SchedulerState,
): void {
  // Step 1 & 2: Advance signals and deliver arrivals
  const nodesWithNewInput = new Set<NodeId>();

  for (const wire of wires) {
    for (const signal of wire.signals) {
      signal.ticksRemaining--;
    }

    // Deliver arrived signals (ticksRemaining <= 0)
    const arrived = wire.signals.filter((s) => s.ticksRemaining <= 0);
    wire.signals = wire.signals.filter((s) => s.ticksRemaining > 0);

    if (arrived.length > 0) {
      const targetId = wire.to.nodeId;
      const portIndex = wire.to.portIndex;
      const runtime = state.nodeStates.get(targetId);
      if (runtime) {
        // Use the latest arrived signal value
        const latest = arrived[arrived.length - 1];
        runtime.inputs[portIndex] = clamp(latest.value);
        nodesWithNewInput.add(targetId);
      }
    }
  }

  // Step 3 & 4: Evaluate nodes in topo order and emit outputs
  for (const nodeId of topoOrder) {
    const node = nodes.get(nodeId);
    const runtime = state.nodeStates.get(nodeId);
    if (!node || !runtime) continue;

    // Only evaluate if this node received new input this tick
    if (!nodesWithNewInput.has(nodeId)) continue;

    const prevOutputs = [...runtime.outputs];
    evaluateNode(node, runtime);

    // Emit onto outgoing wires only if outputs changed
    const outputChanged = runtime.outputs.some(
      (v, i) => v !== prevOutputs[i],
    );
    if (outputChanged) {
      emitOutputs(nodeId, runtime, wires);
    }
  }
}

/** Evaluate a single node using its current input values. Mutates runtime.outputs. */
function evaluateNode(node: NodeState, runtime: NodeRuntimeState): void {
  switch (node.type) {
    case 'multiply': {
      const a = runtime.inputs[0] ?? 0;
      const b = runtime.inputs[1] ?? 0;
      runtime.outputs[0] = evaluateMultiply(a, b);
      break;
    }
    case 'mix': {
      const a = runtime.inputs[0] ?? 0;
      const b = runtime.inputs[1] ?? 0;
      const mode = (node.params['mode'] as MixMode) ?? 'Add';
      runtime.outputs[0] = evaluateMix(a, b, mode);
      break;
    }
    case 'invert': {
      const a = runtime.inputs[0] ?? 0;
      runtime.outputs[0] = evaluateInvert(a);
      break;
    }
    case 'threshold': {
      const a = runtime.inputs[0] ?? 0;
      const threshold = typeof node.params['threshold'] === 'number'
        ? node.params['threshold']
        : 0;
      runtime.outputs[0] = evaluateThreshold(a, threshold);
      break;
    }
    case 'delay': {
      const a = runtime.inputs[0] ?? 0;
      if (runtime.delayState) {
        runtime.outputs[0] = evaluateDelay(a, runtime.delayState);
      }
      break;
    }
    case 'connection-input':
    case 'connection-output':
      // Virtual CP nodes — no-op. Input CPs are driven by the simulation
      // controller as source nodes; output CPs just receive signals.
      break;
  }
}

/** Place output signals onto all outgoing wires from a node. */
function emitOutputs(
  nodeId: NodeId,
  runtime: NodeRuntimeState,
  wires: Wire[],
): void {
  for (const wire of wires) {
    if (wire.from.nodeId === nodeId) {
      const portIndex = wire.from.portIndex;
      const value = runtime.outputs[portIndex] ?? 0;
      wire.signals.push({
        value,
        ticksRemaining: wire.wtsDelay,
      });
    }
  }
}

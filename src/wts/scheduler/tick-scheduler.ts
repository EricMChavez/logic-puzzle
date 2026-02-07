import type { NodeId, NodeState, Wire } from '../../shared/types/index.ts';
import { WIRE_BUFFER_SIZE } from '../../shared/types/index.ts';
import { clamp } from '../../shared/math/index.ts';
import { getNodeDefinition } from '../../engine/nodes/registry.ts';
import type { NodeRuntimeState as FrameworkRuntimeState } from '../../engine/nodes/framework.ts';

/** Per-node runtime state, tracked across ticks. */
export interface NodeRuntimeState {
  /** Latest input value per port index. Defaults to 0. */
  inputs: number[];
  /** Latest output value per port index. */
  outputs: number[];
  /** Node-specific state (for stateful nodes like Shaper, Delay). */
  nodeState?: FrameworkRuntimeState;
  /** Baked evaluate closure for puzzle nodes. */
  bakedEvaluate?: (inputs: number[]) => number[];
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

    // Initialize node-specific state for stateful nodes
    const def = getNodeDefinition(node.type);
    if (def?.createState) {
      runtime.nodeState = def.createState();
    }

    nodeStates.set(id, runtime);
  }
  return { nodeStates };
}

/**
 * Advance one tick of the signal pipeline. Mutates wires and scheduler state.
 *
 * Ring buffer model: each wire holds 16 samples. On each tick:
 * 1. Read signalBuffer[writeHead] — the oldest value (16 ticks old, "arrived")
 * 2. Deliver that value to the target node's input port
 * 3. Evaluate target nodes in topological order
 * 4. Write new output values at signalBuffer[writeHead] on outgoing wires
 * 5. Advance all wire writeHeads
 */
export function advanceTick(
  wires: Wire[],
  nodes: ReadonlyMap<NodeId, NodeState>,
  topoOrder: ReadonlyArray<NodeId>,
  state: SchedulerState,
  tickIndex: number = 0,
): void {
  // Step 1: Deliver arrived signals from ring buffers to target node inputs
  const nodesWithNewInput = new Set<NodeId>();

  for (const wire of wires) {
    // Read the oldest sample (at writeHead position) — this has traveled 16 ticks
    const arrivedValue = wire.signalBuffer[wire.writeHead];
    const targetId = wire.target.nodeId;
    const portIndex = wire.target.portIndex;
    const runtime = state.nodeStates.get(targetId);
    if (runtime) {
      const clamped = clamp(arrivedValue);
      if (runtime.inputs[portIndex] !== clamped) {
        runtime.inputs[portIndex] = clamped;
        nodesWithNewInput.add(targetId);
      }
    }
  }

  // Step 2: Evaluate nodes in topo order and propagate outputs
  for (const nodeId of topoOrder) {
    const node = nodes.get(nodeId);
    const runtime = state.nodeStates.get(nodeId);
    if (!node || !runtime) continue;

    // Evaluate if inputs changed or node is stateful (needs tick-by-tick updates)
    const def = getNodeDefinition(node.type);
    const isStateful = def?.createState !== undefined;

    // Source nodes (0 inputs) need evaluation on first tick to initialize outputs.
    // We detect "first tick" by checking if all outputs are still at initial value (0).
    const isSource = runtime.inputs.length === 0;
    const needsInitialization = isSource && runtime.outputs.every((v) => v === 0);

    if (nodesWithNewInput.has(nodeId) || isStateful || needsInitialization) {
      evaluateNode(node, runtime, tickIndex);
    }

    // Always write current outputs onto outgoing wires so every ring-buffer
    // slot carries the steady-state value (required for correct zero delivery).
    for (const wire of wires) {
      if (wire.source.nodeId === nodeId) {
        const portIndex = wire.source.portIndex;
        const value = runtime.outputs[portIndex] ?? 0;
        wire.signalBuffer[wire.writeHead] = value;
      }
    }
  }

  // Step 3: Advance all wire writeHeads
  for (const wire of wires) {
    wire.writeHead = (wire.writeHead + 1) % WIRE_BUFFER_SIZE;
  }
}

/** Evaluate a single node using its current input values. Mutates runtime.outputs. */
function evaluateNode(node: NodeState, runtime: NodeRuntimeState, tickIndex: number): void {
  // Handle connection point nodes (virtual CP nodes for gameboard I/O)
  if (node.type === 'connection-input' || node.type === 'connection-output') {
    // Virtual CP nodes — no-op. Input CPs are driven by the simulation
    // controller as source nodes; output CPs just receive signals.
    return;
  }

  // Handle puzzle and utility nodes (baked closures)
  if (node.type.startsWith('puzzle:') || node.type.startsWith('utility:')) {
    if (runtime.bakedEvaluate) {
      const results = runtime.bakedEvaluate([...runtime.inputs]);
      for (let i = 0; i < results.length && i < runtime.outputs.length; i++) {
        runtime.outputs[i] = results[i];
      }
    }
    return;
  }

  // Handle fundamental nodes via registry
  const def = getNodeDefinition(node.type);
  if (!def) {
    console.warn(`Unknown node type: ${node.type}`);
    return;
  }

  const outputs = def.evaluate({
    inputs: runtime.inputs,
    params: node.params as Record<string, number | string | boolean>,
    state: runtime.nodeState,
    tickIndex,
  });

  for (let i = 0; i < outputs.length && i < runtime.outputs.length; i++) {
    runtime.outputs[i] = outputs[i];
  }
}

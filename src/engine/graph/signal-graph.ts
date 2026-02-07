import type { NodeId, NodeState, Wire } from '../../shared/types/index.ts';
import type { Result } from '../../shared/result/index.ts';
import { ok, err } from '../../shared/result/index.ts';
import { topologicalSort } from './topological-sort.ts';
import type { CycleError } from './topological-sort.ts';

/**
 * Signal graph: node map + wire list with automatic topological sort
 * on every structural edit. Pure data structure, no React/Canvas.
 */
export class SignalGraph {
  private nodes: Map<NodeId, NodeState>;
  private wires: Wire[];
  private sortedOrder: NodeId[];

  constructor() {
    this.nodes = new Map();
    this.wires = [];
    this.sortedOrder = [];
  }

  /** Current topological evaluation order */
  getOrder(): ReadonlyArray<NodeId> {
    return this.sortedOrder;
  }

  /** All nodes */
  getNodes(): ReadonlyMap<NodeId, NodeState> {
    return this.nodes;
  }

  /** All wires */
  getWires(): ReadonlyArray<Wire> {
    return this.wires;
  }

  /** Get a node by ID */
  getNode(id: NodeId): NodeState | undefined {
    return this.nodes.get(id);
  }

  /** Add a node and recalculate sort order. Always succeeds (no cycles from adding a node). */
  addNode(node: NodeState): void {
    this.nodes.set(node.id, node);
    this.recalculate();
  }

  /**
   * Remove a node and all its connected wires. Recalculates sort order.
   * Returns the removed wires.
   */
  removeNode(nodeId: NodeId): Wire[] {
    this.nodes.delete(nodeId);
    const removed = this.wires.filter(
      (w) => w.source.nodeId === nodeId || w.target.nodeId === nodeId,
    );
    this.wires = this.wires.filter(
      (w) => w.source.nodeId !== nodeId && w.target.nodeId !== nodeId,
    );
    this.recalculate();
    return removed;
  }

  /**
   * Add a wire. Performs cycle detection before committing.
   * Returns ok with the new sort order, or err with cycle path.
   */
  addWire(wire: Wire): Result<NodeId[], CycleError> {
    const testWires = [...this.wires, wire];
    const nodeIds = Array.from(this.nodes.keys());
    const result = topologicalSort(nodeIds, testWires);

    if (!result.ok) {
      return err(result.error);
    }

    this.wires.push(wire);
    this.sortedOrder = result.value;
    return ok(result.value);
  }

  /** Remove a wire by ID and recalculate sort order. */
  removeWire(wireId: string): void {
    this.wires = this.wires.filter((w) => w.id !== wireId);
    this.recalculate();
  }

  /** Recalculate topological order from current state. */
  private recalculate(): void {
    const nodeIds = Array.from(this.nodes.keys());
    const result = topologicalSort(nodeIds, this.wires);
    if (result.ok) {
      this.sortedOrder = result.value;
    }
    // If somehow a cycle exists after removal, keep the previous order.
    // This shouldn't happen since removals can't introduce cycles.
  }
}

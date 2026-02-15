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
  private chips: Map<NodeId, NodeState>;
  private paths: Wire[];
  private sortedOrder: NodeId[];

  constructor() {
    this.chips = new Map();
    this.paths = [];
    this.sortedOrder = [];
  }

  /** Current topological evaluation order */
  getOrder(): ReadonlyArray<NodeId> {
    return this.sortedOrder;
  }

  /** All nodes */
  getNodes(): ReadonlyMap<NodeId, NodeState> {
    return this.chips;
  }

  /** All wires */
  getWires(): ReadonlyArray<Wire> {
    return this.paths;
  }

  /** Get a node by ID */
  getNode(id: NodeId): NodeState | undefined {
    return this.chips.get(id);
  }

  /** Add a node and recalculate sort order. Always succeeds (no cycles from adding a node). */
  addNode(node: NodeState): void {
    this.chips.set(node.id, node);
    this.recalculate();
  }

  /**
   * Remove a node and all its connected wires. Recalculates sort order.
   * Returns the removed wires.
   */
  removeNode(chipId: NodeId): Wire[] {
    this.chips.delete(chipId);
    const removed = this.paths.filter(
      (w) => w.source.chipId === chipId || w.target.chipId === chipId,
    );
    this.paths = this.paths.filter(
      (w) => w.source.chipId !== chipId && w.target.chipId !== chipId,
    );
    this.recalculate();
    return removed;
  }

  /**
   * Add a wire. Performs cycle detection before committing.
   * Returns ok with the new sort order, or err with cycle path.
   */
  addWire(wire: Wire): Result<NodeId[], CycleError> {
    const testWires = [...this.paths, wire];
    const chipIds = Array.from(this.chips.keys());
    const result = topologicalSort(chipIds, testWires);

    if (!result.ok) {
      return err(result.error);
    }

    this.paths.push(wire);
    this.sortedOrder = result.value;
    return ok(result.value);
  }

  /** Remove a wire by ID and recalculate sort order. */
  removeWire(wireId: string): void {
    this.paths = this.paths.filter((w) => w.id !== wireId);
    this.recalculate();
  }

  /** Recalculate topological order from current state. */
  private recalculate(): void {
    const chipIds = Array.from(this.chips.keys());
    const result = topologicalSort(chipIds, this.paths);
    if (result.ok) {
      this.sortedOrder = result.value;
    }
    // If somehow a cycle exists after removal, keep the previous order.
    // This shouldn't happen since removals can't introduce cycles.
  }
}

import type { ChipId, ChipState, Path } from '../../shared/types/index.ts';
import type { Result } from '../../shared/result/index.ts';
import { ok, err } from '../../shared/result/index.ts';
import { topologicalSort } from './topological-sort.ts';
import type { CycleError } from './topological-sort.ts';

/**
 * Signal graph: chip map + path list with automatic topological sort
 * on every structural edit. Pure data structure, no React/Canvas.
 */
export class SignalGraph {
  private chips: Map<ChipId, ChipState>;
  private paths: Path[];
  private sortedOrder: ChipId[];

  constructor() {
    this.chips = new Map();
    this.paths = [];
    this.sortedOrder = [];
  }

  /** Current topological evaluation order */
  getOrder(): ReadonlyArray<ChipId> {
    return this.sortedOrder;
  }

  /** All chips */
  getChips(): ReadonlyMap<ChipId, ChipState> {
    return this.chips;
  }

  /** All paths */
  getPaths(): ReadonlyArray<Path> {
    return this.paths;
  }

  /** Get a chip by ID */
  getChip(id: ChipId): ChipState | undefined {
    return this.chips.get(id);
  }

  /** Add a chip and recalculate sort order. Always succeeds (no cycles from adding a chip). */
  addChip(chip: ChipState): void {
    this.chips.set(chip.id, chip);
    this.recalculate();
  }

  /**
   * Remove a chip and all its connected paths. Recalculates sort order.
   * Returns the removed paths.
   */
  removeChip(chipId: ChipId): Path[] {
    this.chips.delete(chipId);
    const removed = this.paths.filter(
      (p) => p.source.chipId === chipId || p.target.chipId === chipId,
    );
    this.paths = this.paths.filter(
      (p) => p.source.chipId !== chipId && p.target.chipId !== chipId,
    );
    this.recalculate();
    return removed;
  }

  /**
   * Add a path. Performs cycle detection before committing.
   * Returns ok with the new sort order, or err with cycle path.
   */
  addPath(path: Path): Result<ChipId[], CycleError> {
    const testPaths = [...this.paths, path];
    const chipIds = Array.from(this.chips.keys());
    const result = topologicalSort(chipIds, testPaths);

    if (!result.ok) {
      return err(result.error);
    }

    this.paths.push(path);
    this.sortedOrder = result.value;
    return ok(result.value);
  }

  /** Remove a path by ID and recalculate sort order. */
  removePath(pathId: string): void {
    this.paths = this.paths.filter((p) => p.id !== pathId);
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

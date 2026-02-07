# Story 5.3: Core Type Migrations & Connection Point Configuration

Status: done

## Story

As a developer,
I want the Wire and NodeState types updated for grid-based coordinates and signal ring buffers, and connection points configurable per puzzle,
so that the data model supports auto-routing, polarity rendering, and flexible puzzle design.

## Acceptance Criteria

1. Wire.from/to renamed to Wire.source/target across all code
2. Wire.signals replaced by signalBuffer (number[16]) + writeHead ring buffer
3. Wire gains path: GridPoint[] field (empty until Story 6.2 auto-routing)
4. NodeState.position changed from Vec2 to GridPoint; pixel coords computed at render time
5. Occupancy grid (boolean[32][18]) maintained in gameboard slice
6. Per-puzzle connection point configuration (which are active, input vs output)
7. VICTORY_CYCLES updated from 2 to 1
8. Signal type removed
9. All existing tests updated and passing

## Tasks / Subtasks

- [x] Task 1: Update type definitions
- [x] Task 2: Update engine (baking, graph, delay-calculator)
- [x] Task 3: Update scheduler and simulation
- [x] Task 4: Update rendering (render-nodes, wires, ports, hit-testing, connection-points, GameboardCanvas)
- [x] Task 5: Update puzzle construction and store (persistence, gameboard-slice)
- [x] Task 6: Add occupancy grid + connection point config
- [x] Task 7: Update VICTORY_CYCLES constant
- [x] Task 8: Update all tests
- [x] Task 9: TypeScript and test verification

## Dev Notes

### Wire Signal Model Change

Current: `wire.signals: Signal[]` (array of `{value, ticksRemaining}` objects)
New: `wire.signalBuffer: number[16]` ring buffer + `wire.writeHead: number`

Ring buffer tick sequence:
1. Read `signalBuffer[writeHead]` — oldest value, 16 ticks old (the "arrived" signal)
2. Evaluate destination node with arrived value
3. Write new output value at `signalBuffer[writeHead]`
4. Advance: `writeHead = (writeHead + 1) % 16`

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 5.3]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Completion Notes List

- Wire type fully migrated: source/target, signalBuffer ring buffer (16 entries), writeHead, path: GridPoint[]
- Signal type removed; createWire() helper creates initialized wires
- NodeState.position: Vec2 → GridPoint (col/row); all render functions accept cellSize for gridToPixel()
- VICTORY_CYCLES updated 2 → 1 in SIGNAL_CONFIG and VALIDATION_CONFIG
- Occupancy grid (boolean[32][18]) added to gameboard slice, maintained on add/remove node
- ConnectionPointConfig type added to puzzle/types.ts with buildConnectionPointConfig() and buildCustomNodeConnectionPointConfig()
- Tick scheduler rewritten for ring buffer model (read at writeHead, evaluate, write, advance)
- Persistence updated: serializes signalBuffer/writeHead, resets buffer on save
- 568 tests passing (16 new), 0 TypeScript errors

### File List

**New files:**
- src/shared/grid/occupancy.ts
- src/shared/grid/occupancy.test.ts
- src/puzzle/connection-point-config.test.ts

**Modified source files (~30):**
- src/shared/types/index.ts (Wire, NodeState, createWire, WIRE_BUFFER_SIZE)
- src/shared/constants/index.ts (VICTORY_CYCLES)
- src/shared/grid/index.ts (occupancy exports)
- src/engine/graph/topological-sort.ts
- src/engine/graph/signal-graph.ts
- src/engine/baking/bake.ts
- src/engine/baking/delay-calculator.ts
- src/wts/scheduler/tick-scheduler.ts
- src/simulation/simulation-controller.ts
- src/gameboard/canvas/render-nodes.ts
- src/gameboard/canvas/render-wires.ts
- src/gameboard/canvas/render-loop.ts
- src/gameboard/canvas/port-positions.ts
- src/gameboard/canvas/hit-testing.ts
- src/gameboard/canvas/GameboardCanvas.tsx
- src/puzzle/connection-point-nodes.ts
- src/puzzle/gameboard-from-metadata.ts
- src/puzzle/types.ts
- src/store/slices/gameboard-slice.ts
- src/store/persistence.ts
- src/ui/puzzle/LevelSelect.tsx

**Modified test files (~15):**
- All test files updated for source/target, col/row, signalBuffer, createWire, VICTORY_CYCLES

## Change Log

- 2026-02-04: Story completed. All 9 ACs met. 568 tests, 0 TS errors.

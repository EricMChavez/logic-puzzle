# Story 5.1: Grid Coordinate System & Viewport

Status: done

## Story

As a developer,
I want a 16:9 viewport with a 32x18 grid and clean coordinate conversion between grid and pixel spaces,
so that all rendering, placement, and routing share a single spatial foundation.

## Acceptance Criteria

1. **Given** the app loads in any viewport size, **When** the gameboard initializes, **Then** `cellSize = Math.floor(Math.min(viewportWidth / 32, viewportHeight / 18))` computes the grid cell size
2. **Given** the computed cellSize, **When** the canvas renders, **Then** the gameboard (32 * cellSize x 18 * cellSize) is centered in the viewport with remaining space filled with page background (#050508)
3. **Given** the canvas, **When** initialized, **Then** resolution is gameboard dimensions * `devicePixelRatio` for crisp rendering
4. **Given** the grid module, **When** imported, **Then** `src/shared/grid/` exports `GridPoint` ({col, row}), `GridRect`, `PixelPoint` ({x, y}), `PixelRect` types
5. **Given** conversion functions, **When** called, **Then** `gridToPixel(col, row, cellSize)` returns the top-left pixel of the cell, `pixelToGrid(x, y, cellSize)` returns the grid cell (floor), and `gridRectToPixels(gridRect, cellSize)` returns the full PixelRect
6. **Given** the grid, **When** zones are queried, **Then** left meter zone = cols 0-2, playable area = cols 3-28, right meter zone = cols 29-31
7. **Given** a very small viewport, **When** computed cellSize falls below 32px, **Then** the game shows a "viewport too small" warning
8. **Given** a window resize event, **When** the viewport changes, **Then** cellSize recomputes and all elements reposition (debounced)
9. **Given** conversion functions, **When** `gridToPixel` then `pixelToGrid` round-trips, **Then** the result matches the original grid cell

## Tasks / Subtasks

- [x] Task 1: Create grid types and conversion utilities (AC: #4, #5, #9)
  - [x] 1.1 Create `src/shared/grid/types.ts` with `GridPoint` ({col: number, row: number}), `GridRect` ({col, row, cols, rows}), `PixelPoint` ({x: number, y: number}), `PixelRect` ({x, y, width, height})
  - [x] 1.2 Create `src/shared/grid/conversions.ts` with `gridToPixel(col, row, cellSize): PixelPoint`, `pixelToGrid(x, y, cellSize): GridPoint`, `gridRectToPixels(rect: GridRect, cellSize: number): PixelRect`
  - [x] 1.3 Create `src/shared/grid/constants.ts` with `GRID_COLS = 32`, `GRID_ROWS = 18`, `MIN_CELL_SIZE = 32`, zone column ranges
  - [x] 1.4 Create `src/shared/grid/viewport.ts` with `computeCellSize(viewportWidth, viewportHeight): number`, `computeGameboardRect(cellSize): PixelRect`, `computeCenterOffset(viewportWidth, viewportHeight, cellSize): PixelPoint`
  - [x] 1.5 Create `src/shared/grid/index.ts` barrel export
  - [x] 1.6 Write unit tests in `src/shared/grid/grid.test.ts`: 25 tests covering round-trip conversions, viewport fitting, zone boundaries, min cellSize check

- [x] Task 2: Update GameboardCanvas for 16:9 viewport (AC: #1, #2, #3, #7, #8)
  - [x] 2.1 Modify `resize()` in `GameboardCanvas.tsx` to compute `cellSize` via `computeCellSize()` instead of using raw parent dimensions
  - [x] 2.2 Set canvas dimensions to `(GRID_COLS * cellSize * dpr)` x `(GRID_ROWS * cellSize * dpr)` and CSS size to `(GRID_COLS * cellSize)` x `(GRID_ROWS * cellSize)`
  - [x] 2.3 Center the canvas in parent container using absolute positioning with computed offset
  - [x] 2.4 Set parent container background to `#050508` for letterbox fill
  - [x] 2.5 Add cellSize < MIN_CELL_SIZE check — renders "viewport too small" warning overlay via React state
  - [x] 2.6 Debounce the resize handler using requestAnimationFrame coalescing (resizePending flag)
  - [x] 2.7 Store computed `cellSize` in ref + data attribute for passing to render loop and getCanvasLogicalSize

- [x] Task 3: Update render loop to pass cellSize (AC: #1, #6)
  - [x] 3.1 Modify `startRenderLoop()` signature to accept a `getCellSize: () => number` callback
  - [x] 3.2 Derive `logicalWidth = GRID_COLS * cellSize` and `logicalHeight = GRID_ROWS * cellSize` from getCellSize() instead of canvas dimensions / dpr

- [x] Task 4: TypeScript and test verification (AC: all)
  - [x] 4.1 Run `npx tsc --noEmit` — zero errors
  - [x] 4.2 Run `npx vitest run` — 530 tests passing across 35 suites, zero regressions
  - [x] 4.3 New grid tests: 25 tests all passing

## Dev Notes

### Architecture

- **New module**: `src/shared/grid/` — pure TypeScript, no React or Canvas imports (follows NFR9 pattern for engine-adjacent code)
- **Viewport state**: cellSize stored in a React ref inside GameboardCanvas (not in Zustand). Render loop reads it via closure callback. Zustand is for game state, not viewport geometry.
- **Letterbox**: CSS background on the canvas parent container (#050508). Canvas itself only covers the 32x18 gameboard area. No per-frame fill needed for the letterbox region.
- **DPI handling**: Existing pattern preserved — canvas physical size = logical size * devicePixelRatio, ctx.scale(dpr, dpr).

### Grid Zone Layout

```
  Col:  0  1  2 | 3  4  5 ... 26 27 28 | 29 30 31
  Zone: [meter-L] [   playable area   ] [meter-R]
```

- Meter zones: 3 columns each (for analog meters in Story 6.1)
- Playable area: 26 columns x 18 rows
- Total: 32 columns x 18 rows = 16:9 aspect ratio

### Viewport Fitting Examples

| Viewport | cellSize | Gameboard | Letterbox |
|----------|----------|-----------|-----------|
| 1280x720 | 40 | 1280x720 | None (exact fit) |
| 1920x1080 | 60 | 1920x1080 | None (exact fit) |
| 2560x1440 | 80 | 2560x1440 | None (exact fit) |
| 1600x900 | 50 | 1600x900 | None (exact fit) |
| 1366x768 | 42 | 1344x756 | 11px each side H, 6px each side V |
| 800x600 | 25 | 800x450 | 0 H, 75px each side V |
| 640x480 | 20 | ⚠ below 32px min | Warning shown |

### Conversion Functions

```typescript
function gridToPixel(col: number, row: number, cellSize: number): PixelPoint {
  return { x: col * cellSize, y: row * cellSize };
}

function pixelToGrid(x: number, y: number, cellSize: number): GridPoint {
  return { col: Math.floor(x / cellSize), row: Math.floor(y / cellSize) };
}

function gridRectToPixels(rect: GridRect, cellSize: number): PixelRect {
  return {
    x: rect.col * cellSize,
    y: rect.row * cellSize,
    width: rect.cols * cellSize,
    height: rect.rows * cellSize,
  };
}
```

### Anti-Patterns to Avoid

- DO NOT store cellSize in Zustand — it's viewport-derived geometry, not game state
- DO NOT recompute cellSize on every frame — use cached ref, update only on resize
- DO NOT modify existing render function signatures yet — Story 5.4 does the full refactor
- DO NOT change NodeState.position from Vec2 to GridPoint — Story 5.3 does that migration
- DO NOT add token parameters to render functions — Story 5.2 creates the token system

### Backward Compatibility

Story 5.1 is additive. Existing render functions continue to receive `logicalWidth` and `logicalHeight` as before, now derived from `GRID_COLS * cellSize` and `GRID_ROWS * cellSize` instead of `canvas.width / dpr`. The values change (locked 16:9 instead of arbitrary parent size), but the parameter types don't.

### File Structure

```
src/shared/grid/types.ts              (NEW)
src/shared/grid/conversions.ts        (NEW)
src/shared/grid/constants.ts          (NEW)
src/shared/grid/viewport.ts           (NEW)
src/shared/grid/index.ts              (NEW)
src/shared/grid/grid.test.ts          (NEW)
src/gameboard/canvas/GameboardCanvas.tsx  (MODIFY — viewport locking, letterbox, cellSize ref)
src/gameboard/canvas/render-loop.ts      (MODIFY — accept getCellSize callback, derive dimensions)
```

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 5.1]
- [Source: _bmad-output/planning-artifacts/architecture.md#Decision 6: Grid & Viewport]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Viewport]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

### Completion Notes List

- Created `src/shared/grid/` module with 5 files: types.ts, constants.ts, conversions.ts, viewport.ts, index.ts (barrel)
- Grid types: `GridPoint` ({col, row}), `GridRect`, `PixelPoint` ({x, y}), `PixelRect` — all pure interfaces, no coupling to Canvas or React
- Three conversion functions: `gridToPixel`, `pixelToGrid` (floor-based), `gridRectToPixels`
- Three viewport functions: `computeCellSize` (min of width/32 and height/18, floored), `computeGameboardRect`, `computeCenterOffset` (centered letterbox)
- Constants: GRID_COLS=32, GRID_ROWS=18, MIN_CELL_SIZE=32, zone boundaries (meter L: 0-2, playable: 3-28, meter R: 29-31), PAGE_BACKGROUND=#050508
- GameboardCanvas.tsx: resize() now computes cellSize, locks canvas to grid dimensions, centers with absolute positioning + computed offset. Parent gets PAGE_BACKGROUND. cellSize stored in ref + data attribute. Resize debounced via rAF coalescing. Viewport too small warning via React state when cellSize < 32.
- render-loop.ts: startRenderLoop now accepts getCellSize callback. Derives logicalWidth/Height from GRID_COLS/ROWS * cellSize instead of canvas.width/dpr. Backward-compatible — existing render functions receive same parameter types.
- getCanvasLogicalSize() updated to read cellSize from canvas data attribute for consistent hit-testing dimensions.
- 25 new grid tests: constants validation (16:9 ratio, zone coverage, contiguity), conversion round-trips (all cells at multiple cellSizes), viewport fitting (1280x720, 1920x1080, 2560x1440, edge cases), center offset symmetry.
- TypeScript clean, 530 total tests passing (25 new + 505 existing), zero regressions.

### File List

- `src/shared/grid/types.ts` (NEW)
- `src/shared/grid/constants.ts` (NEW)
- `src/shared/grid/conversions.ts` (NEW)
- `src/shared/grid/viewport.ts` (NEW)
- `src/shared/grid/index.ts` (NEW)
- `src/shared/grid/grid.test.ts` (NEW)
- `src/gameboard/canvas/GameboardCanvas.tsx` (MODIFIED — 16:9 viewport lock, letterbox, cellSize ref, too-small warning)
- `src/gameboard/canvas/render-loop.ts` (MODIFIED — getCellSize callback, grid-derived dimensions)

## Change Log

- 2026-02-04: Implemented Story 5.1 Grid Coordinate System & Viewport — grid module, viewport locking, 25 tests

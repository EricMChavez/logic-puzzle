# Project Instructions

## After Every BMAD Workflow Step

Update `development.md` to reflect the completed step:
- Mark the step as DONE with a summary of results
- Add any new artifacts to the Quick Reference table
- Update the "Next" marker to point to the next pending step
- Keep summaries concise (3-5 bullet points max)

---

## What This Game Is

A **recursive tool-building puzzle game** about signal processing. Players wire together nodes to transform input waveforms into target output waveforms. Every completed puzzle becomes a reusable node for future puzzles, creating a fractal, infinitely-nestable tool-building loop.

**Stack:** Canvas 2D + React 19 + Zustand + TypeScript + Vite. No server. Browser only.

---

## Game Mechanics

### Signal System

- Signal range: **[-100, +100]**. Clamp after EVERY node evaluation. No exceptions.
- Unconnected inputs default to **0**.
- Polarity: positive = amber (#F5AF28), negative = teal (#1ED2C3), neutral = gray.

### Five Fundamental Nodes

| Node | Inputs | Operation | Notes |
|------|--------|-----------|-------|
| **Multiply** | A, B | `clamp((A * B) / 100)` | Divides by 100 to stay in range |
| **Mix** | A, B | Mode-based: Add, Subtract, Average, Max, Min | All modes clamp output |
| **Invert** | A | `-A` | Phase flip |
| **Threshold** | A + param | `A > threshold ? +100 : -100` | Binary output, param range [-100,+100] |
| **Delay** | A + param | Delays signal by N subdivisions | 0-16 subdivisions of 1 WTS |

### Two Custom Node Types

**Puzzle nodes** — created by completing levels. Fixed behavior, auto-named, cannot be deleted. Auto-added to palette.

**Utility nodes** — player-created freeform. Player-named, editable, deletable. Convenience tools.

### WTS Timing

- **1 WTS = 1 second**, 16 subdivisions per WTS.
- All wires propagate in exactly 1 WTS.
- Only the active board's wires carry WTS delay. Nested boards are baked.

### Gameboard Layout

Every gameboard (root or nested) has the same structure:
- **Left:** 3 input connection points
- **Right:** 3 output connection points
- **Center:** Node/wire workspace
- Only ONE gameboard is live-evaluated at a time. Others are dormant baked formulas.

### Validation & Victory

- **Continuous** — no Submit button. Every tick compares output to target.
- **Victory:** All outputs within **±5** tolerance for **1 full waveform cycle**.
- Any graph mutation resets the streak to zero.
- On victory: ceremony animation plays, node named, zoom-out, node added to palette.

### Formula Baking

When a puzzle is completed, its internal gameboard is "baked" into a closure:
- Symbolic composition of internal node formulas
- Internal WTS delays stripped; relative timing preserved via per-input circular buffers
- **Equivalence contract:** Baked output must exactly match live settled output. Highest-priority test.
- Metadata is serializable. Closures reconstructed on load.
- Hot-replace: saving a puzzle node updates all instances across all gameboards.

### Connection Point States

Each port: **Wired** (connected to another port) | **Constant** (fixed value -100 to +100) | **Unconnected** (defaults to 0).

### Navigation

- **Edit** on a custom node → zoom in (lid-open animation)
- **Done** → zoom out (lid-close animation)
- **Breadcrumbs:** read-only depth indicator. NOT clickable.
- **No "Return to Puzzle" button.** One-level-at-a-time only.

### Undo/Redo

- Wire connect = ONE undoable action (not two clicks).
- History capped at ~50 entries. Full gameboard state snapshots.

---

## UI Decisions

### Full-Screen Immersion

No sidebar. Single full-screen canvas gameboard. All UI is overlay-based:
- **Palette** → modal (N or Space to open)
- **Parameters** → popover (Enter on selected node)
- **Actions** → context menu (right-click)
- Only ONE overlay at a time (discriminated union in store).
- When overlay active: canvas ignores input, overlay traps focus.

### Grid System (66x36, 16:9 locked, doubled density)

| Zone | Columns | Purpose |
|------|---------|---------|
| Left meters | 0-9 (10 cols) | Input analog meters |
| Playable area | 10-55 (46 cols) | Nodes and wires |
| Right meters | 56-65 (10 cols) | Output analog meters |

- 16:9 aspect ratio enforced. Letterbox on non-16:9 displays.
- `cellSize = Math.floor(Math.min(viewportWidth/66, viewportHeight/36))`

### Three-Channel Analog Meters

Each connection point gets a meter with 3 channels (left to right):
1. **Scrolling waveform** — polarity-colored fill, circular buffer (~128 samples)
2. **Level bar** — fills from center outward
3. **Needle** — red horizontal line (#E03838) with glow

Target overlay: dashed unfilled line showing expected waveform.

### Wire Rendering (Three-Pass)

Wires follow A*-routed grid paths (not bezier curves):
1. **Base pass:** neutral color, low opacity
2. **Glow pass:** |signal| > 75 gets shadowBlur proportional to intensity
3. **Color pass:** polarity-colored stroke per segment

Each wire stores 16 signal samples in a ring buffer. Renderer maps path segments to samples proportionally.

### Lid-Open Zoom Animation

Vertical clamshell: parent board splits at center, left/right halves compress toward edges revealing child board. ~500ms, ease-in-out cubic, token-driven duration. Closing reverses.

### Dual Themes

- **Signal Bench** (dark) and **Studio Monitor** (light)
- CSS custom properties as source of truth
- `buildThemeTokens()` reads CSS into a typed `ThemeTokens` cache object
- Canvas code receives `tokens` as parameter — NEVER reads CSS directly

### Keyboard & Accessibility

- Full Tab-order on canvas elements (nodes, ports, wires, connection points)
- Keyboard wiring mode (Enter to start, Tab to cycle targets, Enter to connect)
- Arrow-key placement ghost navigation
- Reduced motion: all animation tokens resolve to 0ms → instant transitions

---

## Architecture Rules

### Domain Boundaries (Strict)

| Domain | May Import From | Must NOT Import |
|--------|----------------|-----------------|
| `engine/` | `shared/` | React, Canvas, store, gameboard, ui, wts |
| `wts/` | `shared/`, `engine/` | React, Canvas, store, gameboard, ui |
| `shared/routing/` | `shared/grid/` | engine, wts, gameboard, store, ui |
| `gameboard/` | `shared/`, other `gameboard/` | engine, wts, store (except render-loop.ts) |
| `store/` | `shared/`, `engine/`, `wts/`, `puzzle/`, `palette/` | gameboard, ui |
| `ui/` | `store/` (hooks), `shared/` | engine, wts, gameboard |

**No lateral imports.** All cross-domain communication through `src/store/`.

### Rendering Bridge Pattern

`render-loop.ts` is the SOLE bridge between Zustand and Canvas:
- Only file that calls `getState()` in the rAF loop
- Only file that calls `getThemeTokens()`
- All draw functions receive state as parameters, never call getState()

### Canvas Draw Function Signature

```
drawThing(ctx, tokens, stateSlice, cellSize/rect) → void
```

1. `ctx: CanvasRenderingContext2D`
2. `tokens: ThemeTokens` (never read CSS directly)
3. Component-specific state slice
4. Position in **pixel coordinates** (converted from grid at render time)

### Two Coordinate Systems — Never Mix

**Grid coordinates** (`{col, row}`) — used in state, logic, store, routing, occupancy.
**Pixel coordinates** (`{x, y}`) — used only at render time and in hit testing.

Conversion: `gridToPixel(col, row, cellSize)` / `pixelToGrid(x, y, cellSize)` in `shared/grid/`.

Mouse events → convert to grid immediately in hit-test layer. Store always stores grid.

### State Management

- **Zustand single store** is the sole communication bus.
- All mutations via store actions: `useGameStore.getState().addNode(...)`
- Canvas reads: `getState()` in render-loop only.
- React reads: `useStore(selector)` hooks.
- **No separate event bus or pub/sub.** Zustand state change IS the event.

### Animation State Machines

All multi-phase animations use discriminated unions in Zustand:
```typescript
type LidAnimationState =
  | { type: 'idle' }
  | { type: 'opening'; progress: number; snapshot: OffscreenCanvas }
  | { type: 'closing'; progress: number; snapshot: OffscreenCanvas };
```
- Stored in Zustand slice, transitions are store actions
- rAF reads state, draws via `switch (state.type)`
- `progress` is 0-1, driven by rAF elapsed time + animation tokens
- Only one animation active at a time

### Occupancy Grid

- boolean[66][36] (GRID_COLS x GRID_ROWS) maintained in gameboard slice
- Updated on node add/move/delete
- Consumed by auto-router, placement ghost, drag validation
- Derived state — recompute from node positions on deserialization

### Error Handling

- Engine: `Result<T, E>`, never throw.
- Browser APIs (Canvas, localStorage): try-catch at boundaries.
- Invalid actions prevented in UI before reaching engine.
- Errors never crash the game.

---

## Anti-Patterns (DO NOT)

- Create separate event bus or pub/sub. Zustand IS the event system.
- Import between domains laterally. Route through `src/store/`.
- Use React hooks in `engine/` or `wts/`. Pure TS only.
- Forget to clamp signals after node evaluation. Every. Single. Time.
- Serialize closures. Serialize metadata; reconstruct closures on load.
- Create separate animation state for wire signals. Wire state IS animation state.
- Evaluate dormant gameboards. Only the active board runs.
- Allow circular node references. Cycle detection on every graph edit.
- Read CSS directly in Canvas code. Use the ThemeTokens cache.
- Call `getState()` outside render-loop.ts in any draw function.

---

## Naming Conventions

| Element | Convention | Example |
|---------|-----------|---------|
| Source files | kebab-case.ts | `topological-sort.ts` |
| React components | PascalCase.tsx | `PaletteModal.tsx` |
| CSS Modules | Component.module.css | `PaletteModal.module.css` |
| Tests | source + `.test` | `topological-sort.test.ts` |
| Barrel exports | `index.ts` | Public API per directory |
| Types/Interfaces | PascalCase | `NodeState`, `GameboardState` |
| Functions/variables | camelCase | `evaluateNode()`, `activeBoard` |
| Constants | UPPER_SNAKE_CASE | `SIGNAL_CONFIG` |
| Store actions | verb-first camelCase | `addNode`, `connectWire` |
| Node type IDs | kebab-case strings | `"multiply"`, `"low-pass-filter"` |
| Level IDs | `level-NN` | `"level-01"` |

---

## Testing Rules

### Priority (highest first)

1. Fundamental node operations (edge cases: -100, 0, +100, overflow clamping)
2. Topological sort + cycle detection
3. Formula baking equivalence (baked === live for any graph)
4. WTS tick accuracy (correct subdivisions, no off-by-one)
5. Lower: localStorage, undo stack, React components

### Patterns

- Engine tests are pure TS — no DOM, no Canvas, no React.
- Co-locate tests: `foo.test.ts` next to `foo.ts`.
- Integration tests spanning domains go in `tests/` root.
- Current: **976 tests across 66 suites**.

---

## Key Constants

```
GRID: 66 cols x 36 rows, playable area cols 10-55 (46 cols), meter zones 10 cols each
SIGNAL: [-100, +100], tolerance ±5, victory cycles 1
WTS: 1000ms base, 16 subdivisions, 16-sample ring buffer per wire
HISTORY: ~50 entries max
METERS: 256 sample circular buffer (16 WTS), 12 rows x 10 cols per meter
NODE SIZES: Fundamental 3x2, Puzzle 3xN, Utility 5x3
```

---

## Project Structure

```
src/
├── engine/          # Pure TS: nodes, graph eval, topological sort, baking
├── wts/             # Pure TS: clock, tick scheduler
├── gameboard/
│   ├── canvas/      # Render functions (render-loop.ts is the bridge)
│   ├── meters/      # Three-channel analog meter rendering
│   ├── animation/   # Lid, ceremony, zoom draw functions
│   └── interaction/ # Mouse, keyboard, focus, escape handler
├── puzzle/          # Puzzle definitions, waveform generators, validation
├── palette/         # Node definitions, library management
├── store/           # Zustand: 9+ slices, persistence, hot-replace
│   └── slices/      # gameboard, interaction, history, navigation, overlay,
│                    # animation, meter, routing, palette, zoom-transition
├── shared/
│   ├── grid/        # GridPoint/PixelPoint types, conversions, viewport
│   ├── tokens/      # ThemeTokens type, cache builder, theme manager
│   ├── routing/     # A* auto-router, grid graph, occupancy
│   ├── constants/   # SIGNAL_CONFIG, GRID_CONFIG, WTS_CONFIG
│   ├── types/       # Common types (Result, PortRef, etc.)
│   └── math/        # clamp(), utilities
├── ui/
│   ├── overlays/    # PaletteModal, ContextMenu, ParameterPopover
│   ├── puzzle/      # LevelSelect
│   └── controls/    # Navigation, simulation controls
├── simulation/      # Start/stop/step orchestration
└── assets/styles/   # CSS tokens, themes (dark/light), animations
```

---

## Progression (45+ Levels)

| Arc | Levels | Theme |
|-----|--------|-------|
| Tutorial | 1-5 | Rectifier, Amplifier, DC Offset, Clipper, Square Wave |
| Signal Shaping | 6-12 | Filters, gates, envelope follower, compressor |
| Timing Challenges | 13-20 | Phase, crossfade, delay networks, sequencers |
| Advanced Synthesis | 21+ | Parametric EQ, multi-band compressor, granular |

---

## Quick Reference

| What | Where |
|------|-------|
| Game Design Document | `signal_puzzle_game_design.md` (root) |
| UX Design Spec | `_bmad-output/planning-artifacts/ux-design-specification.md` |
| Redesign Architecture | `_bmad-output/planning-artifacts/architecture.md` |
| Original Architecture | `_bmad-output/game-architecture.md` |
| Project Context (34 rules) | `_bmad-output/project-context.md` |
| Epics & Stories | `_bmad-output/planning-artifacts/epics.md` |
| Sprint Status | `_bmad-output/implementation-artifacts/sprint-status.yaml` |
| Development Log | `development.md` |

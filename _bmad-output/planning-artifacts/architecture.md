---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
inputDocuments:
  - _bmad-output/planning-artifacts/ux-design-specification.md
  - _bmad-output/planning-artifacts/epics.md
  - _bmad-output/game-architecture.md
  - _bmad-output/project-context.md
workflowType: 'architecture'
project_name: 'logic-puzzle'
user_name: 'Eric Chavez'
date: '2026-02-04'
lastStep: 8
status: 'complete'
completedAt: '2026-02-04'
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements (33 FRs from epics.md):**

The FRs cover four domains: interactive sandbox (FR1-FR14), puzzle play (FR18-FR28), node building & navigation (FR15-FR17, FR19, FR24-FR25, FR29), and progression/persistence (FR30-FR33). The UX redesign doesn't alter the functional requirements themselves but fundamentally changes *how* they're rendered and interacted with.

**UX Redesign Requirements (new, from ux-design-specification.md):**

| Requirement Area | Architectural Impact |
|-----------------|---------------------|
| Three-channel analog meters | New Canvas rendering subsystem; per-frame needle/bar/waveform updates; scroll direction semantics; target overlay compositing |
| Grid-snapped auto-routing | A* pathfinding on grid; node bounding-box avoidance; segment constraint validation (H/V/45-degree); wire rerouting on node move |
| Lid-open zoom animation | Novel Canvas animation: rectangle split, hinge rotation, camera zoom; offscreen buffer management; ~400-600ms choreography |
| Full-screen immersion (no sidebar) | Palette becomes modal; parameters become popovers; context menus for all actions; focus management between Canvas and DOM |
| Three-tier design token system | CSS custom properties → ThemeTokens cache → Canvas rendering; cache refresh on theme switch; rendering recipes per element |
| Dual-theme support (Studio Monitor) | Six-layer depth palette per theme; gradient-based waveform fills with 3-stop gradients; per-theme shadow definitions |
| Custom node aspect ratio matching gameboard | Node sizing on grid derives from gameboard aspect ratio; affects placement, collision detection, zoom geometry |
| Connection point per-puzzle configuration | Puzzle definitions specify which of 6 connection points are active and their direction; replaces fixed left=input/right=output model |
| Keyboard-only gameplay | Full Tab-order on Canvas elements; focus rings; keyboard wiring mode; arrow-key placement ghost navigation |
| Reduced motion support | All animation tokens resolve to 0/reduced alternatives; static waveform snapshots; instant transitions |

**Non-Functional Requirements (10 NFRs):**

NFR1 (60fps) becomes more demanding -- meters, gradient waveform fills, wire path rendering, and needle glow all add per-frame work. NFR2 (smooth animation) now includes lid-open, validation ceremony phases, and waveform scroll. NFR4 (single active gameboard) remains critical and simplifies meter/routing scope. NFR9 (engine isolation) is unchanged -- the rendering complexity is in `gameboard/`, not `engine/`.

**Scale & Complexity:**

- Primary domain: Canvas 2D interactive application with React overlay
- Complexity level: **High**
- Estimated architectural components: ~15 core systems (up from 10 in original architecture)

### Technical Constraints & Dependencies

| Constraint | Source | Impact |
|-----------|--------|--------|
| Canvas 2D only (no WebGL) | Original architecture | Gradient waveform fills, needle glow (shadowBlur), and alpha compositing must all be Canvas 2D-performant |
| Single active gameboard | Original architecture + NFR4 | Meters, routing, and animation only needed for one board at a time |
| Zustand as sole state bus | Original architecture | Modal state, selection state, wiring mode, and zoom transition state all flow through store |
| localStorage persistence | Original architecture | Token theme preference persisted alongside game state |
| No third-party UI libraries | UX spec | All modals, popovers, context menus built from scratch with CSS Modules |

### Cross-Cutting Concerns Identified

| Concern | Systems Affected | Key Challenge |
|---------|-----------------|---------------|
| Design token system | Every Canvas draw call + all CSS | Cache invalidation on theme switch; ensuring Canvas and CSS stay in sync |
| Auto-routing | Wire creation, node placement, node deletion, node drag | Rerouting wires when nodes move; avoiding O(n^2) pathfinding on complex boards |
| Grid snap | Node placement, wire routing, placement ghost, collision detection | Single grid-cell-size token drives all spatial calculations |
| Focus management | Canvas, all modals, popovers, context menus | Two-context focus model (Canvas vs Overlay); Tab-order on Canvas elements |
| Validation state rendering | Output meters, completion overlay, wire glow | Multi-phase visual state (confirming, mismatch, streak, victory) affects meters and overlays |

### Resolved Contradictions

| # | Topic | Resolution | Rationale |
|---|-------|-----------|-----------|
| 1 | Breadcrumb navigation | **Read-only indicators** -- not clickable | Reinforces fractal nesting mental model; one-level-at-a-time via Edit/Done. UX spec breadcrumb component definition overridden. |
| 2 | Victory threshold | **1 full waveform cycle** | Follows UX spec. Epics (Story 2.2) and project-context to be updated from "2 cycles" to "1 cycle." |
| 3 | Escape key behavior | **Context-priority per UX spec** | Priority cascade: (1) close modal → (2) cancel wiring → (3) deselect → (4) zoom out one level → (5) no-op at root |

## Starter Template Evaluation

### Primary Technology Domain

Canvas 2D interactive application with React overlay -- established and implemented.

### Starter: Vite + React + TypeScript (Already Active)

**Initialization Command (already executed):**

```bash
npm create vite@latest logic-puzzle -- --template react-ts
```

**Stack Verified:**

| Component | Version | Status |
|-----------|---------|--------|
| React | 19.2.4 | Installed, in production use |
| TypeScript | 5.9.3 | Installed, in production use |
| Vite | 7.3.1 | Installed, in production use |
| Zustand | 5.0.10 | Installed, in production use |
| Vitest | Latest | Installed, in production use |

**No Additional Dependencies for Redesign:**

The UX redesign introduces no new npm dependencies. All new systems (auto-routing engine, analog meters, lid-open animation, three-tier design tokens, modal UI) are implemented as pure TypeScript + Canvas 2D + CSS Modules on the existing stack.

## Core Architectural Decisions

### Decision Summary

| # | Category | Decision | Rationale |
|---|----------|----------|-----------|
| 1 | Auto-Routing | A* on constrained grid graph | Well-understood; grid structure enforces H/V/45-degree constraints naturally |
| 2 | Meter Rendering | Canvas-rendered, circular buffer per meter | Meters live in Canvas coordinate space; avoids DOM-Canvas sync; waveform scroll via circular buffer (~128 samples) |
| 3 | Lid-Open Animation | Vertical clamshell (split + hinge) | Physical "double doors" feel; vertical split, left hinges left, right hinges right; 2D approximation via X-scale |
| 4 | Design Token Cache | Flat object with typed keys | Type-safe autocomplete; flat access for per-frame Canvas reads; `ThemeTokens['signalPositive']` |
| 5 | Wire Rendering | Polarity color + peak glow | Color ramps neutral→polarity over 0-75; glow kicks in beyond ±75, intensifying toward ±100 |
| 6 | Grid & Viewport | 16:9 locked, 32x18 grid | Fixed aspect ratio preserves puzzle integrity; letterbox on non-16:9; no responsive scaling |

### Decisions Carried Forward (Unchanged from Original Architecture)

| Category | Decision | Version |
|----------|----------|---------|
| State Management | Zustand | 5.0.10 |
| Signal Graph Engine | Node map + Edge list, tick-based pipeline | n/a |
| Formula Baking | Symbolic composition | n/a |
| Save/Persistence | localStorage (JSON) | n/a |
| CSS/Styling | CSS Modules | n/a |
| Testing | Vitest | n/a |
| Undo/Redo | State snapshots (50-deep history) | n/a |

### Decision 1: Auto-Routing Engine

**Approach:** A* pathfinding on a constrained grid graph

The grid graph is built from the 32x18 cell grid. Edges connect only H/V/45-degree neighbors. Node bounding boxes mark cells as impassable. The A* heuristic penalizes direction changes to produce clean paths with minimal jogs.

**Constraint enforcement:** The graph structure itself only contains legal edges (H, V, 45-degree). No 90-degree turns are possible because no such edges exist. Horizontal entry/exit at ports is enforced by the start/end nodes in the pathfinding.

**Rerouting:** When a node is placed, moved, or deleted, the occupancy grid updates and all affected wires re-run A*. "Affected" = wires whose current path passes through newly occupied or newly freed cells, plus wires connected to moved nodes.

**Performance:** At the scale of dozens of nodes and wires on a 32x18 grid (576 cells), A* is effectively instant. No optimization needed.

### Decision 2: Meter Rendering

**Approach:** Canvas-rendered with circular buffer

Each meter is a Canvas rendering function that reads from:
1. A circular buffer of ~128 recent signal samples (for scrolling waveform)
2. The current signal value (for needle position and level bar)
3. `ThemeTokens` cache (for all colors, dimensions, glow parameters)

**Circular buffer:** Fixed-size `Float64Array(128)`. New values push at the write head; the read head advances each frame. The waveform channel draws the buffer contents as a polarity-colored filled path scrolling in the configured direction.

**Meter channels (left to right within each meter housing):**
1. Scrolling waveform -- polarity-colored fill between zero-line and value, 3-stop gradient
2. Level bar -- fills from centerline outward, polarity-colored
3. Needle -- horizontal line at signal level, red (#E03838) with glow

**Target overlay (output meters in puzzle context):** Unfilled line on the waveform channel using `--color-target`.

### Decision 3: Lid-Open Animation

**Approach:** Vertical clamshell (double-door split + hinge)

**Animation sequence (zoom-in):**
1. Capture the node's current appearance
2. Split vertically down the center
3. Left half compresses toward left edge (X-scale → 0, simulating hinge on left side) while translating slightly left
4. Right half mirrors: compresses toward right edge, translates slightly right
5. Interior gameboard is revealed from center outward as the halves retract
6. Shadow on the closing edges and subtle highlight on hinge edges for physical depth
7. Interior begins live rendering when animation completes

**Zoom-out:** Reverse sequence. Interior freezes to snapshot, halves close from edges toward center.

**Timing:** ~500ms, ease-in-out. Token-driven via `--animation-zoom-duration`.

**2D approximation:** True 3D rotation isn't available in Canvas 2D. Compressing the X-scale of each half toward its hinge edge creates a convincing "doors opening" effect at the animation's speed.

### Decision 4: Design Token Cache

**Approach:** Flat TypeScript object with typed string-literal keys

```typescript
type TokenKey = 'signalPositive' | 'signalNegative' | 'surfaceNode' | 'meterNeedle' | /* ... */;
type ThemeTokens = Record<TokenKey, string>;
```

**Sync flow:**
1. CSS custom properties on `:root` / `[data-theme="light"]` are the source of truth
2. `buildThemeTokens()` reads all properties via `getComputedStyle` into a `ThemeTokens` object
3. Called once on init and once on theme switch
4. Canvas rAF loop reads `themeTokens.signalPositive` etc. -- direct property access, no parsing

### Decision 5: Wire Rendering

**Approach:** Polarity color gradient + peak glow halo

**Signal-to-visual mapping:**

| Signal Range | Color | Glow |
|-------------|-------|------|
| 0 | Neutral gray (#3a3a4a) | None |
| 0 to ±75 | Linear gradient from neutral toward full polarity color | None |
| ±75 | Full polarity color (amber #F5AF28 / teal #1ED2C3) | None |
| ±75 to ±100 | Full polarity color (continues) | Glow halo ramps from 0 to max (shadowBlur 0→12) |
| ±100 | Full polarity color | Maximum glow halo |

**Wire data model:** Each wire stores 1 WTS worth of signal values (16 samples, one per subdivision). The rendering function maps each segment of the wire path to the corresponding signal sample and applies the color+glow mapping.

**Per-frame rendering recipe:**
1. Draw base wire path at neutral color (thin, low-opacity)
2. Glow pass: for segments with signal |value| > 75, draw with `shadowBlur` proportional to glow intensity
3. Color pass: draw all segments with polarity-colored stroke

### Decision 6: Grid & Viewport

**Approach:** Fixed 16:9 aspect ratio, 32x18 grid, letterboxed

**Grid layout:**

| Zone | Columns | Rows | Purpose |
|------|---------|------|---------|
| Left meter zone | 3 | 18 | Up to 3 analog meters stacked vertically |
| Playable area | 26 | 18 | Node placement and wire routing |
| Right meter zone | 3 | 18 | Up to 3 analog meters stacked vertically |
| **Total** | **32** | **18** | **16:9 aspect ratio** |

**Viewport fitting:**
- Compute `cellSize = Math.floor(Math.min(viewportWidth / 32, viewportHeight / 18))`
- Total gameboard: `32 * cellSize` x `18 * cellSize`
- Center in viewport; fill remaining space with `--color-page-background` (#050508)
- Canvas resolution: gameboard dimensions * `devicePixelRatio` for crisp rendering

**No responsive behavior.** Grid dimensions are always 32x18. Cell size scales uniformly. The puzzle experience is identical at every resolution -- only the physical pixel size of cells changes.

**Minimum viable cell size:** Floor at ~32px (1024x576 viewport). Below this, the game warns "viewport too small."

## Implementation Patterns & Consistency Rules

### Patterns Carried Forward (from Original Architecture)

These patterns remain unchanged and binding:

| Pattern | Rule | Example |
|---------|------|---------|
| File naming | `kebab-case.ts` for source, `PascalCase.tsx` for React | `auto-router.ts`, `PaletteModal.tsx` |
| Code naming | camelCase functions/variables, PascalCase types, UPPER_SNAKE constants | `evaluateNode()`, `NodeState`, `SIGNAL_CONFIG` |
| Store actions | verb-first camelCase, defined in slice files | `addNode`, `connectWire`, `setActiveBoard` |
| Communication | Zustand store only, no separate event bus | State change IS the event |
| Engine isolation | `engine/` and `wts/` = zero React/Canvas imports | Pure TS, testable in isolation |
| Error handling | `Result<T, E>` for engine; try-catch at browser boundaries | Engine never throws |
| Signal clamping | `clamp()` after every node evaluation | No exceptions |
| ID generation | `crypto.randomUUID()` via single `generateId()` | Never `Math.random()` |
| Lateral imports | Forbidden between domains; everything through `store/` or `shared/` | `engine/` cannot import from `gameboard/` |

### New Patterns for Redesign

#### Canvas Rendering Function Signature

Every Canvas component follows this signature:

```typescript
function drawMeter(
  ctx: CanvasRenderingContext2D,
  tokens: ThemeTokens,
  state: MeterState,
  rect: GridRect,
): void
```

**Rules:**
- First arg: Canvas context (`ctx`)
- Second arg: `ThemeTokens` cache (never read CSS directly)
- Third arg: component-specific state (from Zustand or derived)
- Fourth arg: position/size in **pixel coordinates** (pre-computed from grid)
- Returns void. No side effects outside of drawing.
- Never calls `getState()` -- state is passed in by the caller (the main render loop)

The main render loop is the single place that calls `getState()` and `themeTokens`, then dispatches to component draw functions.

#### Coordinate System Convention

**Two coordinate systems. Never mix them.**

| System | Type | Used By | Example |
|--------|------|---------|---------|
| **Grid coordinates** | `{col: number, row: number}` | Store state, node positions, routing, occupancy | `{col: 5, row: 3}` |
| **Pixel coordinates** | `{x: number, y: number}` | Canvas rendering, hit testing, mouse events | `{x: 300, y: 180}` |

**Conversion functions** (in `shared/grid/`):
- `gridToPixel(col, row, cellSize): {x, y}` -- grid → top-left pixel of cell
- `pixelToGrid(x, y, cellSize): {col, row}` -- pixel → grid cell (floor)
- `gridRectToPixels(gridRect, cellSize): PixelRect` -- compute full rect for rendering

**Rule:** Zustand state always stores grid coordinates. Pixel coordinates are computed at render time only. Mouse events convert to grid coordinates immediately in the hit-test layer.

#### Occupancy Grid

**Owner:** Zustand gameboard slice. Stored as `occupancy: boolean[][]` (32x18).

**Update triggers:**
- Node placed → mark cells occupied
- Node moved → clear old cells, mark new cells
- Node deleted → clear cells

**Consumers:**
- Auto-router reads occupancy to compute valid paths
- Placement ghost reads occupancy to show valid/invalid
- Node drag reads occupancy to validate drop target

**Rule:** The occupancy grid is derived state. It can be recomputed from node positions at any time. On deserialization, recompute rather than serialize.

#### Wire Signal Buffer

**Location:** On the `Wire` object in Zustand state.

```typescript
interface Wire {
  id: string;
  source: PortRef;
  target: PortRef;
  path: GridPoint[];        // auto-routed grid cells
  signalBuffer: number[];   // 16 samples (1 WTS), ring-written by engine
  writeHead: number;        // current write position in buffer
}
```

**Rule:** The engine writes to `signalBuffer` via the WTS scheduler. The renderer reads it to color each wire segment. The buffer is always exactly 16 entries. The renderer maps path segments to buffer entries proportionally.

#### Animation State Machine Pattern

All multi-phase animations use discriminated union states in Zustand:

```typescript
type LidAnimationState =
  | { type: 'idle' }
  | { type: 'opening'; progress: number; snapshot: OffscreenCanvas }
  | { type: 'open' }
  | { type: 'closing'; progress: number; snapshot: OffscreenCanvas };

type ValidationCeremonyState =
  | { type: 'inactive' }
  | { type: 'streak'; tickCount: number }
  | { type: 'victory-burst'; progress: number }
  | { type: 'name-reveal'; progress: number }
  | { type: 'zoom-out'; progress: number };
```

**Rules:**
- State stored in Zustand slice
- Transitions are store actions (`startLidOpen`, `advanceLidOpen`, etc.)
- The rAF loop reads state and draws accordingly via `switch (state.type)`
- `progress` is 0-1, advanced by the rAF loop based on elapsed time and animation tokens
- Only one animation can be active at a time (idle check before starting)

#### Modal & Overlay State

**Single overlay stack in Zustand:**

```typescript
interface OverlayState {
  activeOverlay:
    | { type: 'none' }
    | { type: 'palette-modal' }
    | { type: 'parameter-popover'; nodeId: string }
    | { type: 'context-menu'; position: PixelPoint; target: ContextTarget }
    | { type: 'inspect-modal'; nodeId: string }
    | { type: 'save-dialog' }
    | { type: 'unsaved-changes' };
}
```

**Rules:**
- Only one overlay at a time. Opening a new one replaces the current.
- `activeOverlay.type === 'none'` → Canvas context receives input
- `activeOverlay.type !== 'none'` → overlay traps focus, Canvas ignores input
- All overlays dismiss on Escape (except save-dialog and unsaved-changes, which require explicit button click)
- React components read `activeOverlay` to conditionally render. Canvas render loop reads it to skip/dim interaction feedback.

#### Token Access in Canvas Code

**One way to access tokens. No alternatives.**

```typescript
// In the main render loop (the ONLY place getState and tokens are accessed):
function renderFrame(ctx: CanvasRenderingContext2D, tokens: ThemeTokens) {
  const state = useGameStore.getState();
  drawGrid(ctx, tokens, state.grid, gridRect);
  drawMeters(ctx, tokens, state.meters, meterRects);
  drawNodes(ctx, tokens, state.nodes, cellSize);
  drawWires(ctx, tokens, state.wires, cellSize);
  // ...
}
```

**Rules:**
- Canvas code never imports `useGameStore`
- Canvas code never calls `getComputedStyle`
- Canvas code never reads CSS variables
- Canvas code receives `tokens: ThemeTokens` as a function parameter
- Color values from tokens are used directly in `ctx.fillStyle`, `ctx.strokeStyle`, `ctx.shadowColor`

### Enforcement: All AI Agents MUST

1. Store positions in grid coordinates, convert to pixels only at render time
2. Use the Canvas rendering function signature (ctx, tokens, state, rect)
3. Use discriminated unions for all multi-state systems
4. Route all inter-domain communication through Zustand store
5. Never read CSS/DOM from Canvas rendering code
6. Never call `getState()` from inside a draw function -- receive state as parameter
7. Maintain the occupancy grid through store actions, never modify directly
8. Follow the wire signal buffer structure (16 entries, ring buffer on Wire object)

### Anti-Patterns

- **DO NOT** read `getComputedStyle` in the rAF loop. Token cache exists for this reason.
- **DO NOT** store pixel coordinates in Zustand. Grid coordinates only.
- **DO NOT** create a second animation system. All animations use the discriminated union pattern in Zustand.
- **DO NOT** manage overlay state outside Zustand. No React useState for modal visibility.
- **DO NOT** have draw functions call `getState()`. They receive state.
- **DO NOT** create Canvas rendering functions with different signatures than the standard pattern.

## Project Structure & Boundaries

### Complete Project Directory Structure

```
logic-puzzle/
├── index.html
├── package.json
├── package-lock.json
├── tsconfig.json
├── tsconfig.app.json
├── tsconfig.node.json
├── vite.config.ts
├── vitest.config.ts
├── eslint.config.js
├── .gitignore
├── public/
│   ├── fonts/
│   └── vite.svg
│
├── src/
│   ├── main.tsx                            # App entry point
│   ├── App.tsx                             # Root component, theme provider
│   ├── index.css                           # Global CSS reset
│   ├── App.css                             # App-level layout
│   │
│   ├── assets/
│   │   └── styles/
│   │       ├── tokens.css                  # CSS custom properties (token source of truth)
│   │       ├── theme-dark.css              # Signal Bench theme overrides
│   │       ├── theme-light.css             # Studio Monitor theme overrides
│   │       └── animations.css              # Animation duration/easing tokens
│   │
│   ├── shared/                             # Cross-domain utilities (no domain logic)
│   │   ├── constants/
│   │   │   └── index.ts                    # SIGNAL_CONFIG, GRID_COLS, GRID_ROWS, etc.
│   │   ├── generate-id.ts                  # crypto.randomUUID() wrapper
│   │   ├── grid/
│   │   │   ├── index.ts
│   │   │   ├── grid-types.ts               # GridPoint, GridRect, PixelPoint, PixelRect
│   │   │   ├── grid-conversion.ts          # gridToPixel, pixelToGrid, gridRectToPixels
│   │   │   └── grid-conversion.test.ts
│   │   ├── logger/
│   │   │   ├── index.ts
│   │   │   └── logger.test.ts
│   │   ├── math/
│   │   │   ├── index.ts                    # clamp()
│   │   │   └── clamp.test.ts
│   │   ├── result/
│   │   │   ├── index.ts                    # Result<T, E>, ok(), err()
│   │   │   └── result.test.ts
│   │   ├── routing/
│   │   │   ├── index.ts
│   │   │   ├── auto-router.ts              # A* pathfinding on constrained grid
│   │   │   ├── auto-router.test.ts
│   │   │   ├── grid-graph.ts               # Edge generation (H/V/45-deg only)
│   │   │   ├── grid-graph.test.ts
│   │   │   ├── occupancy.ts                # Mark/clear cells, recompute helpers
│   │   │   └── occupancy.test.ts
│   │   ├── tokens/
│   │   │   ├── index.ts
│   │   │   ├── token-types.ts              # TokenKey union, ThemeTokens type
│   │   │   ├── build-theme-tokens.ts       # getComputedStyle → ThemeTokens cache
│   │   │   └── build-theme-tokens.test.ts
│   │   └── types/
│   │       └── index.ts                    # NodeState, Wire, PortRef, Signal, etc.
│   │
│   ├── engine/                             # Pure TS -- ZERO React/Canvas imports
│   │   ├── baking/
│   │   │   ├── index.ts
│   │   │   ├── bake.ts
│   │   │   ├── bake.test.ts
│   │   │   ├── delay-calculator.ts
│   │   │   └── types.ts
│   │   ├── graph/
│   │   │   ├── index.ts
│   │   │   ├── signal-graph.ts
│   │   │   ├── signal-graph.test.ts
│   │   │   ├── topological-sort.ts
│   │   │   └── topological-sort.test.ts
│   │   └── nodes/
│   │       ├── index.ts
│   │       ├── delay.ts / delay.test.ts
│   │       ├── invert.ts / invert.test.ts
│   │       ├── mix.ts / mix.test.ts
│   │       ├── multiply.ts / multiply.test.ts
│   │       └── threshold.ts / threshold.test.ts
│   │
│   ├── wts/                                # Pure TS -- ZERO React/Canvas imports
│   │   ├── clock/
│   │   │   ├── index.ts
│   │   │   ├── wts-clock.ts
│   │   │   └── wts-clock.test.ts
│   │   └── scheduler/
│   │       ├── index.ts
│   │       ├── tick-scheduler.ts
│   │       ├── tick-scheduler.test.ts
│   │       └── puzzle-node-evaluation.test.ts
│   │
│   ├── gameboard/                          # Canvas rendering + interaction layer
│   │   ├── canvas/
│   │   │   ├── index.ts
│   │   │   ├── GameboardCanvas.tsx         # React wrapper (useRef, rAF lifecycle)
│   │   │   ├── render-loop.ts             # Single getState()+tokens dispatch point
│   │   │   ├── render-grid.ts             # Grid lines, zone backgrounds
│   │   │   ├── render-nodes.ts            # Node rects, labels, ports, focus rings
│   │   │   ├── render-wires.ts            # Polarity color + peak glow rendering
│   │   │   ├── render-wire-preview.ts     # In-progress wire drawing feedback
│   │   │   ├── render-connection-points.ts
│   │   │   ├── render-waveforms.ts        # Waveform at connection points
│   │   │   ├── hit-testing.ts             # Pixel → grid, element identification
│   │   │   └── port-positions.ts          # Port pixel coord computation
│   │   ├── meters/
│   │   │   ├── index.ts
│   │   │   ├── meter-types.ts             # MeterState, MeterChannel enums
│   │   │   ├── circular-buffer.ts         # Float64Array(128) ring buffer
│   │   │   ├── circular-buffer.test.ts
│   │   │   ├── render-meter.ts            # drawMeter(ctx, tokens, state, rect)
│   │   │   ├── render-waveform-channel.ts # Scrolling polarity-colored fill
│   │   │   ├── render-level-bar.ts        # Centerline-outward level bar
│   │   │   ├── render-needle.ts           # Red needle with glow
│   │   │   └── render-target-overlay.ts   # Unfilled target line (puzzle output)
│   │   ├── animation/
│   │   │   ├── index.ts
│   │   │   ├── lid-animation.ts           # Clamshell split/hinge draw functions
│   │   │   ├── lid-animation.test.ts
│   │   │   ├── validation-ceremony.ts     # Multi-phase victory rendering
│   │   │   └── zoom-transition.ts         # Offscreen snapshot zoom in/out
│   │   ├── interaction/
│   │   │   ├── index.ts
│   │   │   ├── mouse-handlers.ts          # Click, drag, hover → store actions
│   │   │   ├── keyboard-handlers.ts       # Tab-order, arrows, keyboard wiring
│   │   │   ├── placement-ghost.ts         # Valid/invalid placement preview
│   │   │   └── focus-manager.ts           # Canvas ↔ Overlay focus context
│   │   ├── navigation/
│   │   │   ├── index.ts
│   │   │   └── gameboard-tree.ts          # Root, activeBoard, parentMap
│   │   └── visualization/
│   │       ├── waveform-buffer.ts
│   │       └── waveform-buffer.test.ts
│   │
│   ├── puzzle/                             # Puzzle definitions + waveform generators
│   │   ├── index.ts
│   │   ├── types.ts
│   │   ├── puzzle-gameboard.ts / .test.ts
│   │   ├── utility-gameboard.ts / .test.ts
│   │   ├── gameboard-from-metadata.ts / .test.ts
│   │   ├── connection-point-nodes.ts / .test.ts
│   │   ├── waveform-generators.ts / .test.ts
│   │   ├── validation.ts / .test.ts
│   │   └── levels/
│   │       ├── index.ts
│   │       ├── tutorial-levels.ts / .test.ts
│   │       ├── signal-shaping-levels.ts / .test.ts
│   │       ├── timing-levels.ts / .test.ts
│   │       └── advanced-levels.ts / .test.ts
│   │
│   ├── palette/                            # Node definitions + library management
│   │   ├── fundamental/
│   │   │   ├── index.ts
│   │   │   └── node-defs.ts
│   │   └── library/
│   │       ├── index.ts
│   │       └── node-library.ts             # Puzzle + Utility node storage logic
│   │
│   ├── simulation/
│   │   └── simulation-controller.ts        # Start/stop/step orchestration
│   │
│   ├── persistence/
│   │   ├── serialization/
│   │   │   ├── index.ts
│   │   │   └── state-serializer.ts
│   │   ├── migration/
│   │   │   ├── index.ts
│   │   │   └── schema-migrator.ts
│   │   └── storage/
│   │       ├── index.ts
│   │       └── local-storage-adapter.ts
│   │
│   ├── progression/
│   │   ├── ceremonies/
│   │   │   ├── index.ts
│   │   │   └── ceremony-controller.ts
│   │   ├── levels/
│   │   │   ├── index.ts
│   │   │   └── level-manager.ts
│   │   └── unlocks/
│   │       ├── index.ts
│   │       └── unlock-tracker.ts
│   │
│   ├── validation/
│   │   ├── matching/
│   │   │   ├── index.ts
│   │   │   └── signal-matcher.ts
│   │   └── suites/
│   │       ├── index.ts
│   │       └── test-suite-runner.ts
│   │
│   ├── store/                              # Zustand -- sole communication bus
│   │   ├── index.ts                        # Combined store creation
│   │   ├── hot-replace.ts / .test.ts
│   │   ├── persistence.ts / .test.ts
│   │   ├── middleware/
│   │   │   └── undo.ts                     # Undo/redo middleware
│   │   └── slices/
│   │       ├── gameboard-slice.ts          # Nodes, wires, occupancy grid
│   │       ├── interaction-slice.ts        # Selection, wiring mode, drag
│   │       ├── navigation-slice.ts / .test.ts
│   │       ├── palette-slice.ts / .test.ts
│   │       ├── puzzle-slice.ts             # Validation streak, puzzle state
│   │       ├── simulation-slice.ts
│   │       ├── ceremony-slice.ts / .test.ts
│   │       ├── progression-slice.ts / .test.ts
│   │       ├── history-slice.ts / .test.ts
│   │       ├── overlay-slice.ts            # activeOverlay discriminated union
│   │       ├── animation-slice.ts          # LidAnimationState, ValidationCeremonyState
│   │       ├── meter-slice.ts              # Meter state + circular buffer refs
│   │       └── routing-slice.ts            # Wire paths, reroute triggers
│   │
│   ├── ui/                                 # React DOM overlays + chrome
│   │   ├── overlays/
│   │   │   ├── PaletteModal.tsx / .module.css
│   │   │   ├── ParameterPopover.tsx / .module.css
│   │   │   ├── ContextMenu.tsx / .module.css
│   │   │   ├── InspectModal.tsx / .module.css
│   │   │   ├── SaveDialog.tsx / .module.css
│   │   │   └── UnsavedChangesDialog.tsx / .module.css
│   │   ├── breadcrumbs/
│   │   │   ├── Breadcrumbs.tsx
│   │   │   └── Breadcrumbs.module.css
│   │   ├── controls/
│   │   │   ├── NavigationBar.tsx / .module.css
│   │   │   ├── SimulationControls.tsx / .module.css
│   │   │   ├── NodeControls.tsx / .module.css
│   │   │   └── PortConstantInput.tsx / .module.css
│   │   ├── puzzle/
│   │   │   ├── LevelSelect.tsx / .module.css
│   │   │   ├── PuzzleInfoBar.tsx / .module.css
│   │   │   ├── CompletionCeremony.tsx / .module.css
│   │   │   └── ZoomTransition.tsx / .module.css
│   │   └── layout/
│   │       ├── GameLayout.tsx              # Top-level layout + overlay host
│   │       └── GameLayout.module.css
│   │
│   └── debug/                              # NFR10: tree-shaken in production
│       ├── bake-inspector/
│       │   └── BakeInspector.tsx
│       ├── graph-inspector/
│       │   └── GraphInspector.tsx
│       ├── level-skip/
│       │   └── LevelSkip.tsx
│       └── tick-debugger/
│           └── TickDebugger.tsx
│
└── tests/                                  # Integration tests (if needed)
```

### Architectural Boundaries

**Domain Isolation Rules:**

| Domain | May Import From | Must NOT Import From |
|--------|----------------|---------------------|
| `engine/` | `shared/` | React, Canvas, `gameboard/`, `store/`, `ui/`, `wts/` |
| `wts/` | `shared/`, `engine/` | React, Canvas, `gameboard/`, `store/`, `ui/` |
| `shared/routing/` | `shared/grid/` | `engine/`, `wts/`, `gameboard/`, `store/`, `ui/` |
| `gameboard/meters/` | `shared/grid/`, `shared/tokens/` | `engine/`, `wts/`, `ui/`, `store/` |
| `gameboard/canvas/` | `shared/`, `gameboard/*` (sibling modules) | `engine/`, `wts/`, `store/` (except `render-loop.ts`) |
| `gameboard/canvas/render-loop.ts` | `store/` (sole `getState()` caller), `shared/tokens/` | -- (this is the bridge) |
| `store/` | `shared/`, `engine/`, `wts/`, `puzzle/`, `palette/`, `persistence/`, `progression/`, `validation/` | `gameboard/`, `ui/` |
| `ui/` | `store/` (via hooks), `shared/` | `engine/`, `wts/`, `gameboard/` (never reads Canvas state directly) |
| `puzzle/` | `shared/`, `engine/` | `gameboard/`, `store/`, `ui/` |
| `palette/` | `shared/` | `engine/`, `gameboard/`, `store/`, `ui/` |
| `debug/` | anything (dev-only) | -- |

**The Bridge Pattern:**

`render-loop.ts` is the sole file that bridges Zustand and Canvas. It calls `getState()` once per frame and passes state slices + `ThemeTokens` down to all draw functions. No other Canvas code touches the store.

**Overlay Focus Boundary:**

```
activeOverlay.type === 'none'  →  Canvas receives all input
activeOverlay.type !== 'none'  →  React overlay traps focus, Canvas ignores input
```

React overlays and Canvas never compete for input. `overlay-slice.ts` is the arbiter.

### Requirements to Structure Mapping

**Epic 1: Interactive Signal Sandbox → Core pipeline**

| Story | Primary Location | Supporting |
|-------|-----------------|------------|
| 1.1 Project Setup | `shared/`, `store/` | root configs |
| 1.2 Node Evaluation | `engine/nodes/` | `shared/math/` |
| 1.3 Signal Graph | `engine/graph/` | `shared/types/` |
| 1.4 WTS Clock | `wts/clock/`, `wts/scheduler/` | `shared/constants/` |
| 1.5 Canvas Rendering | `gameboard/canvas/` | `shared/grid/`, `shared/tokens/` |
| 1.6 Palette & Placement | `palette/`, `ui/overlays/PaletteModal` | `store/slices/palette-slice` |
| 1.7 Wire Drawing | `gameboard/canvas/render-wires`, `shared/routing/` | `store/slices/gameboard-slice` |
| 1.8 Waveform Viz | `gameboard/visualization/`, `gameboard/meters/` | `gameboard/canvas/render-waveforms` |

**Epic 2: Puzzle Play → Puzzle + validation pipeline**

| Story | Primary Location | Supporting |
|-------|-----------------|------------|
| 2.1 Puzzle Loading | `puzzle/puzzle-gameboard`, `puzzle/levels/` | `store/slices/puzzle-slice` |
| 2.2 Validation Engine | `puzzle/validation`, `validation/` | `store/slices/puzzle-slice` |
| 2.3 Formula Baking | `engine/baking/` | `shared/types/` |
| 2.4 Completion Ceremony | `gameboard/animation/validation-ceremony`, `ui/puzzle/CompletionCeremony` | `store/slices/ceremony-slice` |
| 2.5 Baked Node Runtime | `engine/baking/`, `wts/scheduler/` | `palette/library/` |

**Epic 3: Node Building & Navigation → Navigation + library**

| Story | Primary Location | Supporting |
|-------|-----------------|------------|
| 3.1 Zoom Navigation | `gameboard/navigation/`, `gameboard/animation/` | `store/slices/navigation-slice` |
| 3.2 Zoom Transitions | `gameboard/animation/lid-animation`, `gameboard/animation/zoom-transition` | `store/slices/animation-slice` |
| 3.3 Breadcrumbs | `ui/breadcrumbs/` | `store/slices/navigation-slice` |
| 3.4 Utility Nodes | `puzzle/utility-gameboard`, `palette/library/` | `store/slices/palette-slice` |
| 3.5 Library Sync | `store/hot-replace`, `palette/library/` | `store/slices/gameboard-slice` |

**Epic 4: Progression & Persistence → Meta-game**

| Story | Primary Location | Supporting |
|-------|-----------------|------------|
| 4.1-4.2 Levels | `puzzle/levels/` | `progression/levels/` |
| 4.3 Progression | `progression/`, `store/slices/progression-slice` | `palette/` |
| 4.4 Save/Load | `persistence/` | `store/persistence` |
| 4.5 Undo/Redo | `store/slices/history-slice`, `store/middleware/undo` | -- |

### Cross-Cutting Concerns Mapping

| Concern | Files Affected |
|---------|---------------|
| Design Token System | `assets/styles/tokens.css`, `shared/tokens/`, every `render-*.ts` in `gameboard/` |
| Grid Coordinate System | `shared/grid/`, `store/slices/gameboard-slice`, all `gameboard/` modules |
| Occupancy Grid | `store/slices/gameboard-slice` (owner), `shared/routing/occupancy` (helpers), `gameboard/interaction/placement-ghost` |
| Focus Management | `gameboard/interaction/focus-manager`, `store/slices/overlay-slice`, all `ui/overlays/` |
| Reduced Motion | `assets/styles/animations.css` (tokens resolve to 0), `shared/tokens/` (includes animation tokens), `gameboard/animation/` |

### Data Flow

```
User Input (mouse/keyboard)
  → gameboard/interaction/ (pixel → grid conversion)
    → store action (grid coordinates)
      → Zustand state update
        → derived updates (occupancy, routing, validation streak)

rAF Loop (gameboard/canvas/render-loop.ts)
  → getState() once
  → buildThemeTokens() (cached, refreshed on theme switch)
  → dispatch to draw functions: (ctx, tokens, stateSlice, rect)

Engine Tick (wts/scheduler/)
  → read wire inputs → evaluate nodes (engine/) → write wire outputs
  → update signalBuffer on Wire objects → store update
  → rAF reads new signal state next frame

Theme Switch
  → CSS class on root element changes
  → buildThemeTokens() called → new ThemeTokens object
  → rAF loop picks up new tokens next frame
  → no DOM reads in render path
```

### New Modules (Redesign Additions)

These modules do not exist in the current codebase and must be created:

| Module | Purpose | Decision # |
|--------|---------|-----------|
| `shared/grid/` | Coordinate types + conversion functions | D6 |
| `shared/tokens/` | ThemeTokens type + cache builder | D4 |
| `gameboard/meters/` | Three-channel analog meter rendering | D2 |
| `shared/routing/` | A* auto-router + occupancy helpers | D1 |
| `gameboard/animation/` | Lid, ceremony, zoom draw functions | D3 |
| `gameboard/interaction/` | Mouse, keyboard, focus, placement ghost | UX spec |
| `gameboard/canvas/render-grid.ts` | Grid zone rendering | D6 |
| `assets/styles/tokens.css` | CSS custom properties (all themes) | D4 |
| `assets/styles/theme-dark.css` | Signal Bench overrides | D4 |
| `assets/styles/theme-light.css` | Studio Monitor overrides | D4 |
| `assets/styles/animations.css` | Animation tokens (reduced-motion aware) | D3 |
| `store/slices/overlay-slice.ts` | activeOverlay discriminated union | UX spec |
| `store/slices/animation-slice.ts` | Lid + ceremony state machines | D3 |
| `store/slices/meter-slice.ts` | Meter state + circular buffer refs | D2 |
| `store/slices/routing-slice.ts` | Wire paths, reroute triggers | D1 |
| `ui/overlays/` | All modal/popover/context-menu components | UX spec |
| `ui/layout/GameLayout.tsx` | Top-level layout + overlay host | UX spec |

## Architecture Validation Results

### Coherence Validation

**Decision Compatibility:** All 6 redesign decisions and 7 carried-forward decisions are mutually compatible. D1 (A* routing) operates on D6's 32x18 grid. D2 (meters) occupy D6's 3-column zones. D3 (lid animation) and D5 (wire rendering) consume D4 (token cache). All decisions stay within the Canvas 2D constraint. Zustand as sole state bus is consistently referenced across all patterns and decisions.

**Pattern Consistency:** The Canvas function signature `(ctx, tokens, state, rect)` applies uniformly to meters, wires, nodes, grid, and animations. Grid-vs-pixel coordinate separation is enforced at every store/render boundary. All multi-phase animations use discriminated unions. Overlay state uses a single discriminated union. No contradictions between patterns.

**Structure Alignment:** Each decision maps to specific modules. `shared/routing/` resolved the boundary conflict where store actions need to call the auto-router. `render-loop.ts` remains the sole Zustand-Canvas bridge. Domain isolation rules are consistent with the import graph.

### Requirements Coverage

**All 33 FRs covered.** Every FR maps to at least one module in the project structure (see Requirements to Structure Mapping). No orphaned requirements.

**All 10 NFRs covered:**

| NFR | Architectural Support |
|-----|----------------------|
| NFR1 (60fps) | Token cache eliminates DOM reads; single rAF loop |
| NFR2 (smooth animation) | Discriminated union state machines with token-driven timing |
| NFR3 (baked closures) | `engine/baking/` |
| NFR4 (single active board) | `gameboard/navigation/gameboard-tree` |
| NFR5 (WTS precision) | `wts/clock/`, `wts/scheduler/` |
| NFR6-7 (topo sort, cycle detection) | `engine/graph/topological-sort` |
| NFR8 (localStorage <1MB) | `persistence/` |
| NFR9 (engine isolation) | Domain boundary table enforces zero Canvas/React imports in `engine/` and `wts/` |
| NFR10 (debug tree-shaken) | `debug/` directory isolation |

### Implementation Readiness

**Decision Completeness:** All 6 decisions include concrete implementation details -- TypeScript interfaces for Wire, ThemeTokens, animation states, and overlay state. Rendering recipes documented for wire 3-pass rendering and meter channels. Timing and easing specified for lid animation. Signal-to-visual mapping table for wire rendering. Grid math for viewport fitting.

**Pattern Completeness:** 7 new patterns and 9 carried-forward patterns documented with examples. 6 explicit anti-patterns listed. 8 enforcement rules for AI agents. Code examples provided for key patterns (token access, animation state machines, overlay state, wire data model).

**Structure Completeness:** Every module has file-level granularity. New modules distinguished from existing ones. Domain boundary table is complete and consistent after the `shared/routing/` resolution.

### Issues Found & Resolved

| # | Issue | Resolution |
|---|-------|-----------|
| 1 | `store/` cannot import from `gameboard/routing/` per boundary rules, but store actions need to call the auto-router | Moved routing to `shared/routing/` -- pure utility algorithm, importable by both `store/` and `gameboard/` |

### Architecture Completeness Checklist

**Requirements Analysis**

- [x] Project context thoroughly analyzed (33 FRs, 10 NFRs, 10 UX redesign requirements)
- [x] Scale and complexity assessed (High, ~15 core systems)
- [x] Technical constraints identified (Canvas 2D, single board, Zustand, localStorage, no 3rd-party UI)
- [x] Cross-cutting concerns mapped (tokens, routing, grid, focus, validation state)
- [x] Contradictions resolved (breadcrumbs, victory threshold, Escape key)

**Architectural Decisions**

- [x] 6 new decisions documented with implementation details
- [x] 7 carried-forward decisions documented with versions
- [x] Technology stack fully specified (React 19, TS 5.9, Vite 7.3, Zustand 5.0, Vitest)
- [x] No new dependencies required

**Implementation Patterns**

- [x] 9 carried-forward patterns (naming, communication, engine isolation, etc.)
- [x] 7 new patterns (Canvas signature, coordinates, occupancy, wire buffer, animations, overlays, token access)
- [x] 8 enforcement rules for AI agents
- [x] 6 anti-patterns documented

**Project Structure**

- [x] Complete directory structure with file-level granularity
- [x] Domain boundary table with import rules
- [x] Requirements-to-structure mapping for all 4 epics
- [x] Cross-cutting concerns mapped to files
- [x] Data flow documented (user input, rAF, engine tick, theme switch)
- [x] 17 new modules identified for redesign

### Architecture Readiness Assessment

**Overall Status:** READY FOR IMPLEMENTATION

**Confidence Level:** High

**Key Strengths:**

- Zero new dependencies -- entire redesign implemented on existing stack
- Clean domain boundaries with single documented exception (render-loop.ts bridge)
- Token cache pattern eliminates DOM reads from render path
- Discriminated unions provide exhaustive type checking for all multi-state systems
- Occupancy grid as derived state eliminates serialization/sync issues

**Areas for Future Enhancement:**

- Keyboard wiring mode interaction details (Tab-order on Canvas elements) -- implementable from current patterns but not specified at protocol level
- Reduced motion behavior in animation state machines (jump-to-final vs. skip) -- resolvable at implementation time via animation token values
- Error recovery for corrupted localStorage -- persistence module can handle gracefully within existing `Result<T,E>` pattern

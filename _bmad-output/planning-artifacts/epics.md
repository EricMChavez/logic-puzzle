---
stepsCompleted: [1, 2, 3, 4]
status: 'updated'
revision: 'ux-redesign'
inputDocuments:
  - signal_puzzle_game_design.md
  - _bmad-output/game-architecture.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/ux-design-specification.md
---

# logic-puzzle - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for logic-puzzle (Signal Processing Puzzle Game). Epics 1-4 cover the original implementation (complete, 505 tests passing). Epics 5-7 cover the UX redesign that replaces the sidebar-based UI with a full-screen immersive experience featuring analog meters, auto-routed wires, lid-open zoom animations, and a design token system with dual themes.

---

## Requirements Inventory

### Functional Requirements (Original)

FR1: Gameboard displays full-screen with 3 connection points on each side (left/right)
FR2: Players can place nodes from palette onto gameboard
FR3: Players can connect nodes via wires (click output port, then input port)
FR4: Connection points support 3 states: wired, constant (-100 to +100), unconnected (defaults to 0)
FR5: Multiply node: (A x B) / 100, 2 inputs, 1 output
FR6: Mix node: 2 inputs, 1 output, mode parameter (Add, Subtract, Average, Max, Min)
FR7: Invert node: -A, 1 input, 1 output
FR8: Threshold node: +100 if A > threshold else -100, 1 input, threshold param, 1 output
FR9: Delay node: delays input by 0-16 WTS subdivisions, 1 input, delay param, 1 output
FR10: Signal values clamped to [-100, +100] after every operation
FR11: All wires transfer signals in exactly 1 WTS (1 second); nodes process instantly
FR12: Delay node supports 16 subdivisions per WTS cycle
FR13: Signal pulses animate along wires synchronized to WTS rhythm
FR14: Waveform visualization with centerline at 0, animated display
FR15: Zoom-in: click Edit on custom node -> internal gameboard fills screen
FR16: Zoom-out: click Done -> return to parent gameboard (one level at a time)
FR17: Breadcrumb trail shows nesting depth (read-only indicator)
FR18: Puzzle gameboard provides input source waveform and target output waveform
FR19: Custom node gameboard is freeform (no input source, no target)
FR20: Puzzle validation: output matches target within +/-5, sustained 1 full waveform cycle, across multiple test waveforms *(updated from 2 cycles per UX spec)*
FR21: Continuous validation with real-time per-port match feedback (no Submit button)
FR22: Puzzle completion: name/description revealed, zoom-out animation, node added to palette
FR23: Puzzle nodes cannot be deleted; automatically added to palette on completion
FR24: Utility nodes: player creates anytime via "Create Custom Node" button
FR25: Utility nodes: player names, edits, deletes; saved to library
FR26: Node palette has 3 sections: Fundamental (always), Puzzle (unlocked), Utility (player-created)
FR27: Node parameters adjustable after placement (Mix mode, Delay subdivision, Threshold value)
FR28: Solved puzzles bake into reusable formula-nodes (every puzzle becomes a node)
FR29: Custom nodes can contain other custom nodes (recursive nesting)
FR30: 25+ levels across 4 progression arcs (Tutorial, Signal Shaping, Timing, Advanced)
FR31: Puzzle completion unlocks nodes available in future puzzles
FR32: Undo/redo for gameboard edits
FR33: Save/load player state (progression, node library, settings)

### Functional Requirements (UX Redesign)

FR34: 16:9 viewport with 32x18 grid, letterboxed on non-matching displays
FR35: Three-tier design token system (CSS custom properties -> ThemeTokens cache -> Canvas), dual themes (Signal Bench dark, Studio Monitor light)
FR36: Wires auto-route via A* on grid graph, constrained to horizontal, vertical, and 45-degree segments only; no 90-degree turns
FR37: Three-channel analog meters (needle, level bar, scrolling waveform) at each active connection point
FR38: Wire segments colored by signal polarity (neutral -> amber/teal over 0-75; glow halo beyond +/-75)
FR39: Lid-open clamshell zoom animation for custom (utility) nodes; vertical split, halves hinge outward
FR40: Full-screen immersion -- palette as modal, parameters as popovers, context menus for all actions; no persistent sidebar or toolbar
FR41: Per-puzzle connection point configuration -- puzzle definitions specify which of 6 connection points are active and whether each is input or output
FR42: Full keyboard-only gameplay -- Tab order on Canvas elements, arrow-key placement ghost, keyboard wiring mode
FR43: Reduced motion support -- `prefers-reduced-motion` respected; all animation tokens resolve to 0 or reduced equivalents
FR44: Occupancy grid (32x18 boolean[][]) derived from node positions; drives auto-routing and placement validation
FR45: Custom (utility) nodes match gameboard aspect ratio; puzzle and fundamental nodes use compact sizing
FR46: Meter scroll direction encodes role -- output meters scroll toward graph, input meters scroll away
FR47: Target waveform overlay on output meters (unfilled line on waveform channel)
FR48: Validation ceremony multi-phase animation (streak -> victory-burst -> name-reveal -> zoom-out)

### NonFunctional Requirements

NFR1: Real-time signal graph evaluation at 60fps
NFR2: Smooth waveform animation via Canvas 2D (includes lid-open, ceremony phases, meter needle swing)
NFR3: Baked formula closures execute at native JS speed
NFR4: Only one active gameboard rendered at a time; nested boards dormant
NFR5: WTS timing precision with 16 subdivisions
NFR6: Topological sort for evaluation order, re-sorted on graph edit
NFR7: Cycle detection and prevention on every graph edit
NFR8: Persistence data under 1MB in localStorage
NFR9: Engine code (engine/, wts/) is pure TypeScript -- no React or Canvas imports
NFR10: Debug tools tree-shaken from production builds
NFR11: ThemeTokens cache eliminates per-frame DOM reads (getComputedStyle called once per theme switch, not per frame)
NFR12: WCAG AA contrast ratios (4.5:1 text, 3:1 non-text) in both themes

### Additional Requirements

AR1: Project initialized via `npm create vite@latest logic-puzzle -- --template react-ts`
AR2: Zustand 5.0.10 for state management
AR3: Domain-driven project structure with isolated directories
AR4: Unidirectional data flow through Zustand store
AR5: Result<T, E> error handling for engine functions
AR6: Structured logger with namespaces (Graph, WTS, Bake, Render, Save, UI)
AR7: CSS Modules for UI chrome styling
AR8: Vitest for testing
AR9: Undo history capped at ~50 state snapshots
AR10: Wire connect = single undoable action
AR11: Modified detection via version hash for node instances
AR12: Puzzle node hot-replacement on re-solve
AR13: One-level-at-a-time navigation only (no breadcrumb jumps, no Return to Puzzle)
AR14: Canvas draw function signature: `(ctx, tokens, state, rect) => void` -- never call getState() from draw functions
AR15: Grid coordinates in Zustand state; pixel coordinates computed at render time only
AR16: All multi-phase animations use discriminated union state machines in Zustand
AR17: Single overlay at a time via Zustand `activeOverlay` discriminated union
AR18: render-loop.ts is the sole Zustand-Canvas bridge (single getState() per frame)
AR19: No new npm dependencies for the redesign

### FR Coverage Map (Original)

FR1: Epic 1 (Story 1.5) - Gameboard canvas rendering with 3+3 connection points
FR2: Epic 1 (Story 1.6) - Node placement from palette
FR3: Epic 1 (Story 1.7) - Wire drawing between ports
FR4: Epic 1 (Story 1.7) - Connection point states (wired, constant, unconnected)
FR5: Epic 1 (Story 1.2) - Multiply node evaluation
FR6: Epic 1 (Story 1.2) - Mix node evaluation (all 5 modes)
FR7: Epic 1 (Story 1.2) - Invert node evaluation
FR8: Epic 1 (Story 1.2) - Threshold node evaluation
FR9: Epic 1 (Story 1.2) - Delay node evaluation
FR10: Epic 1 (Story 1.2) - Signal clamping [-100, +100]
FR11: Epic 1 (Story 1.4) - WTS wire transfer timing
FR12: Epic 1 (Story 1.4) - Delay node 16 subdivisions
FR13: Epic 1 (Story 1.8) -> Epic 6 (Story 6.3) - Wire signal rendering replaces pulse animation
FR14: Epic 1 (Story 1.8) -> Epic 6 (Story 6.1) - Analog meters replace connection point waveforms
FR15: Epic 3 (Story 3.1) - Zoom-in navigation
FR16: Epic 3 (Story 3.1) - Zoom-out navigation
FR17: Epic 3 (Story 3.3) - Breadcrumb trail (read-only)
FR18: Epic 2 (Story 2.1) - Puzzle input/target waveforms
FR19: Epic 3 (Story 3.4) - Freeform custom node gameboard
FR20: Epic 2 (Story 2.2) - Puzzle validation (tolerance, cycles, test suites)
FR21: Epic 2 (Story 2.2) - Continuous validation with per-port feedback
FR22: Epic 2 (Story 2.4) - Puzzle completion ceremony
FR23: Epic 2 (Story 2.4) - Puzzle nodes permanent in palette
FR24: Epic 3 (Story 3.4) - Utility node creation
FR25: Epic 3 (Story 3.4) - Utility node edit/delete/library
FR26: Epic 1 (Story 1.6, fundamental) -> Epic 2 (Story 2.5, puzzle) -> Epic 3 (Story 3.4, utility) -> Epic 4 (Story 4.3, full)
FR27: Epic 1 (Story 1.6) - Node parameter controls
FR28: Epic 2 (Story 2.3) - Formula baking
FR29: Epic 3 (Story 3.5) - Recursive nesting
FR30: Epic 4 (Stories 4.1, 4.2) - 25+ levels across 4 arcs
FR31: Epic 2 (Story 2.4) + Epic 4 (Story 4.3) - Puzzle unlock progression
FR32: Epic 4 (Story 4.5) - Undo/redo
FR33: Epic 4 (Story 4.4) - Save/load

### FR Coverage Map (Redesign)

FR34: Epic 5 (Story 5.1) - Grid coordinate system and viewport
FR35: Epic 5 (Story 5.2) - Design token system and dual themes
FR36: Epic 6 (Story 6.2) - Auto-routing engine
FR37: Epic 6 (Story 6.1) - Analog meter rendering
FR38: Epic 6 (Story 6.3) - Wire signal rendering
FR39: Epic 7 (Story 7.3) - Lid-open zoom animation
FR40: Epic 7 (Story 7.1, 7.2) - Overlay system
FR41: Epic 5 (Story 5.3) - Per-puzzle connection point configuration
FR42: Epic 7 (Story 7.5) - Keyboard navigation
FR43: Epic 7 (Story 7.5) - Reduced motion support
FR44: Epic 5 (Story 5.3) - Occupancy grid
FR45: Epic 6 (Story 6.4) - Node grid rendering
FR46: Epic 6 (Story 6.1) - Meter scroll direction
FR47: Epic 6 (Story 6.1) - Target waveform overlay
FR48: Epic 7 (Story 7.4) - Validation ceremony animation

---

## Epic List

### Epic 1: Interactive Signal Sandbox *(Implemented)*
Player can place fundamental nodes on a gameboard, connect them with wires, configure parameters, and watch real-time signal flow through the graph.
**FRs covered:** FR1, FR2, FR3, FR4, FR5, FR6, FR7, FR8, FR9, FR10, FR11, FR12, FR13, FR14, FR26 (fundamental), FR27

### Epic 2: Puzzle Play *(Implemented)*
Player can load a puzzle with input/target waveforms, solve it using continuous real-time validation, experience the completion ceremony, and receive the solved puzzle as a reusable node.
**FRs covered:** FR18, FR20, FR21, FR22, FR23, FR26 (puzzle), FR28, FR31

### Epic 3: Node Building & Navigation *(Implemented)*
Player can create utility nodes, zoom into any custom node to edit its internals, navigate between nested gameboards via breadcrumbs, and manage their node library.
**FRs covered:** FR15, FR16, FR17, FR19, FR24, FR25, FR26 (utility), FR29

### Epic 4: Progression & Persistence *(Implemented)*
Player progresses through 25+ levels across 4 arcs, with full save/load and undo/redo, creating a complete game experience.
**FRs covered:** FR26 (full), FR30, FR32, FR33

### Epic 5: Redesign Foundation
Establish the infrastructure layer that all redesign features depend on: grid coordinate system, viewport fitting, design token pipeline, core type migrations, and the refactored render loop.
**FRs covered:** FR34, FR35, FR41, FR44

### Epic 6: Redesign Signal Visualization
Replace connection-point waveforms and wire pulse animation with three-channel analog meters, auto-routed wire paths, polarity-colored wire rendering, and grid-aware node placement.
**FRs covered:** FR36, FR37, FR38, FR45, FR46, FR47

### Epic 7: Redesign Interaction & Navigation
Replace sidebar UI with full-screen overlay system, implement lid-open zoom animation, add multi-phase validation ceremony, and provide keyboard-only gameplay with reduced motion support.
**FRs covered:** FR39, FR40, FR42, FR43, FR48

---

## Epic 1: Interactive Signal Sandbox *(Implemented)*

Player can place fundamental nodes on a gameboard, connect them with wires, configure parameters, and watch real-time signal flow through the graph.

### Story 1.1: Project Setup & Shared Foundation *(Implemented)*

As a developer,
I want a properly initialized project with core types and utilities,
So that all future stories build on a consistent foundation.

**Acceptance Criteria:**

**Given** a fresh checkout
**When** `npm install && npm run dev` is run
**Then** Vite dev server starts with a blank React app
**And** `src/shared/types/` contains `NodeState`, `Wire`, `PortRef`, `Signal`, `GameboardState` interfaces
**And** `src/shared/math/` exports `clamp(value, -100, 100)` utility
**And** `src/shared/result/` exports `Result<T, E>` type with `ok()` and `err()` helpers
**And** `src/shared/logger/` exports structured logger with namespace and level support
**And** `src/store/` exports a Zustand store shell with gameboard slice
**And** directory structure matches architecture document
**And** Vitest runs with `npm test`

*Covers: AR1, AR2, AR3, AR5, AR6, AR7, AR8*

### Story 1.2: Fundamental Node Evaluation Engine *(Implemented)*

As a developer,
I want all 5 fundamental node types implemented as pure functions,
So that the signal processing core is testable and correct.

**Acceptance Criteria:**

**Given** a Multiply node with inputs (50, 50)
**When** evaluated
**Then** output is 25 ((50x50)/100)
**And** Mix node supports all 5 modes (Add, Subtract, Average, Max, Min) with clamping
**And** Invert node outputs -A for any input
**And** Threshold node outputs +100 if A > threshold, else -100
**And** Delay node stores input and emits after specified subdivision count
**And** all outputs are clamped to [-100, +100]
**And** edge cases tested: -100, 0, +100, overflow beyond range
**And** 100% test coverage on all node evaluation functions

*Covers: FR5, FR6, FR7, FR8, FR9, FR10*

### Story 1.3: Signal Graph & Topological Sort *(Implemented)*

As a developer,
I want a graph data structure with topological sort and cycle detection,
So that nodes evaluate in the correct order.

**Acceptance Criteria:**

**Given** a node map and edge list
**When** topological sort runs
**Then** nodes are ordered so every node evaluates after its dependencies
**And** adding a wire that creates a cycle returns `Result.err` with cycle path
**And** topological order is recalculated on every graph edit (add/remove node or wire)
**And** disconnected nodes are included in the sort order
**And** tests cover: linear chain, diamond merge, parallel paths, single node, cycle detection

*Covers: NFR6, NFR7*

### Story 1.4: WTS Clock & Signal Transport *(Implemented)*

As a developer,
I want a tick-based timing system that advances signals along wires,
So that signal propagation has the correct rhythmic timing.

**Acceptance Criteria:**

**Given** a WTS clock running
**When** 16 ticks elapse
**Then** exactly 1 WTS (1 second at default speed) has passed
**And** each wire carries in-flight signal state (`{value, ticksRemaining}`)
**And** signals advance 1 tick per clock tick, arriving after 16 ticks (1 WTS)
**And** Delay node adds its parameter value (0-16 subdivisions) to the signal's remaining ticks
**And** nodes fire when input signals arrive, outputting results onto outgoing wires
**And** wire state is the canonical source for signal pulse animation (no duplicate state)

*Covers: FR11, FR12, NFR5*

### Story 1.5: Gameboard Canvas Rendering *(Implemented)*

As a player,
I want to see a gameboard with nodes and wires drawn on screen,
So that I can visually understand my signal processing graph.

**Acceptance Criteria:**

**Given** the app loads
**When** a gameboard state exists in the store
**Then** a full-screen Canvas renders the gameboard
**And** 3 connection points are visible on the left side and 3 on the right side
**And** nodes render as labeled rectangles with input/output ports
**And** wires render as lines/curves between connected ports
**And** the rAF loop reads Zustand via `getState()` each frame (not React hooks)
**And** rendering maintains 60fps with dozens of nodes and wires

*Covers: FR1, NFR1, NFR2*

**Redesign impact:** Superseded by Stories 5.1, 5.4, 6.1, 6.4. Viewport becomes 16:9 letterboxed 32x18 grid. Connection points become analog meters. Render functions adopt `(ctx, tokens, state, rect)` signature. COLORS constants replaced by ThemeTokens cache.

### Story 1.6: Node Palette & Placement *(Implemented)*

As a player,
I want to pick nodes from a palette and place them on the gameboard,
So that I can start building signal processing chains.

**Acceptance Criteria:**

**Given** the palette sidebar is visible
**When** the player views it
**Then** all 5 fundamental nodes are listed (Multiply, Mix, Invert, Threshold, Delay)
**And** clicking a palette item then clicking the gameboard places a new node instance at that position
**And** placed nodes display parameter controls: Mix mode dropdown, Delay subdivision dropdown, Threshold slider
**And** parameters are adjustable after placement
**And** node IDs are generated via `crypto.randomUUID()`

*Covers: FR2, FR26 (fundamental section), FR27*

**Redesign impact:** Superseded by Stories 7.1, 7.2. Palette becomes a modal (right-click or hotkey). Placement uses grid-snapped placement ghost. Parameter controls become popovers.

### Story 1.7: Wire Drawing & Connection Points *(Implemented)*

As a player,
I want to draw wires between nodes and set constant values on ports,
So that I can route signals through my processing chain.

**Acceptance Criteria:**

**Given** a node on the gameboard
**When** the player clicks an output port then clicks an input port
**Then** a wire connects them
**And** clicking a connection point that has no wire opens a numeric input for constant value (-100 to +100)
**And** unconnected inputs without a constant default to 0
**And** visual feedback shows during wire drawing (line follows cursor from source port)
**And** hit testing correctly identifies port clicks vs gameboard clicks
**And** invalid connections (input-to-input, output-to-output) are prevented

*Covers: FR3, FR4*

**Redesign impact:** Superseded by Story 6.2. Wires become auto-routed (A* on grid). Manual wire path drawing replaced by click-source-then-click-target with automatic grid-snapped routing.

### Story 1.8: Waveform Visualization & Signal Animation *(Implemented)*

As a player,
I want to see animated waveforms and signal pulses flowing through my graph,
So that I can understand what my signal chain is doing in real time.

**Acceptance Criteria:**

**Given** signals are flowing through the graph
**When** the canvas renders
**Then** waveform paths display at connection points with a centerline at 0
**And** signal pulses animate along wires synchronized to the WTS clock
**And** the animation state is read directly from wire state (`{value, ticksRemaining}`)
**And** multiple signals at different timing positions on the same wire render as separate pulses
**And** signal flow is visually clear at 1 WTS per wire transfer rate

*Covers: FR13, FR14*

**Redesign impact:** Superseded by Stories 6.1, 6.3. Connection point waveforms replaced by three-channel analog meters. Wire pulse animation replaced by polarity-colored wire segments with peak glow.

---

## Epic 2: Puzzle Play *(Implemented)*

Player can load a puzzle with input/target waveforms, solve it using continuous real-time validation, experience the completion ceremony, and receive the solved puzzle as a reusable node.

### Story 2.1: Puzzle Definition & Loading *(Implemented)*

As a player,
I want to see a puzzle with input waveforms feeding into my gameboard and a target output to match,
So that I have a clear goal to work toward.

**Acceptance Criteria:**

**Given** a puzzle level is loaded
**When** the gameboard renders
**Then** input waveforms are visible on the left-side connection points cycling continuously
**And** target output waveforms display on the right side as overlay/preview
**And** level data structure contains: input waveform definitions, target waveform definitions, multi-waveform test suite
**And** waveform generators produce sine, square, triangle, and sawtooth waves as pure functions
**And** input signals feed into the graph at the gameboard's left-side connection points each tick

*Covers: FR18*

**Redesign impact:** Story 5.3 changes connection point model to per-puzzle configuration. Input/output sides are no longer fixed left/right. Story 6.1 replaces waveform overlays with analog meter target overlays.

### Story 2.2: Puzzle Validation Engine *(Implemented)*

As a player,
I want real-time feedback showing whether my output matches the target,
So that I can iteratively adjust my solution without guessing.

**Acceptance Criteria:**

**Given** signals reach the gameboard's output ports
**When** each tick completes
**Then** each output port shows a correct/incorrect indicator comparing actual vs target
**And** match tolerance is +/-5 units
**And** a streak counter tracks consecutive ticks where ALL outputs match within tolerance
**And** victory triggers when streak reaches ~~2~~ **1** full waveform cycle *(updated per UX spec)*
**And** any graph mutation (wire add/remove, node add/remove/move, parameter change) resets the streak to zero
**And** validation runs against the full multi-waveform test suite (not just the displayed waveform)

*Covers: FR20, FR21*

**Redesign impact:** `VICTORY_CYCLES` constant must be updated from 2 to 1. Story 7.4 adds multi-phase visual ceremony.

### Story 2.3: Formula Baking *(Implemented)*

As a developer,
I want solved puzzles to compile into instant-evaluation baked nodes,
So that custom nodes execute efficiently without re-evaluating their internal graph.

**Acceptance Criteria:**

**Given** a gameboard with connected nodes
**When** baking is triggered
**Then** the graph is walked in topological order and fundamental operations are composed into a single `(inputs: number[]) => number[]` closure
**And** per-input-path delays are accumulated (wire count x 16 ticks + Delay param values) and normalized (shortest path = 0 buffer)
**And** circular buffers are created per input port, pre-filled with 0
**And** bake metadata (topo order, node configs, edges, input delays) is serializable to JSON
**And** closure is reconstructable from metadata alone
**And** equivalence test passes: for any graph, `bakedFunction(inputs)` matches live graph steady-state output exactly

*Covers: FR28, NFR3*

### Story 2.4: Puzzle Completion Ceremony *(Implemented)*

As a player,
I want a rewarding moment when I solve a puzzle -- the node's name is revealed and it becomes a tool I own,
So that each victory feels meaningful and compounds my capabilities.

**Acceptance Criteria:**

**Given** validation reaches victory state
**When** the completion ceremony triggers
**Then** the puzzle node's name and description are revealed with animation
**And** a zoom-out animation plays (gameboard shrinks into a node using offscreen canvas snapshot)
**And** the baked node is automatically added to the palette's Puzzle section
**And** the puzzle node cannot be deleted from the palette
**And** on first completion, the next puzzle loads automatically with the new node available
**And** on subsequent completions, player is prompted to save new solution or keep current

*Covers: FR22, FR23, FR31*

**Redesign impact:** Superseded by Story 7.4. Ceremony becomes multi-phase state machine (streak -> victory-burst -> name-reveal -> zoom-out) with discriminated union in Zustand.

### Story 2.5: Baked Node Runtime on Gameboard *(Implemented)*

As a player,
I want to place puzzle nodes I've earned onto new gameboards and have them work correctly,
So that I can use my growing toolkit to solve harder puzzles.

**Acceptance Criteria:**

**Given** a baked puzzle node is placed on a gameboard
**When** signals arrive at its inputs each tick
**Then** input values are pushed into circular buffers and buffered values feed into the composed evaluate function
**And** the baked node's output appears after the appropriate buffer delay (preserving internal timing relationships)
**And** from the outside, the baked node behaves like any other node (one tick per wire)
**And** puzzle nodes appear in the Puzzle section of the palette

*Covers: FR26 (puzzle section)*

---

## Epic 3: Node Building & Navigation *(Implemented)*

Player can create utility nodes, zoom into any custom node to edit its internals, navigate between nested gameboards via breadcrumbs, and manage their node library.

### Story 3.1: Gameboard Tree & Zoom Navigation *(Implemented)*

As a player,
I want to click Edit on a custom node to see inside it and Done to go back,
So that I can explore and modify nested signal chains.

**Acceptance Criteria:**

**Given** a custom node on the gameboard
**When** the player clicks Edit
**Then** the view transitions to that node's internal gameboard (child board fills screen)
**And** clicking Done returns to the parent gameboard (one level up)
**And** navigation is strictly one level at a time (no skip-to-root)
**And** only the active gameboard is evaluated and rendered; all other boards are dormant
**And** the GameboardTree tracks root, activeBoard, and parentMap

*Covers: FR15, FR16, NFR4, AR13*

### Story 3.2: Zoom Transition Animations *(Implemented)*

As a player,
I want smooth animated transitions when zooming in and out of nodes,
So that navigation feels spatial and I maintain context of where I am.

**Acceptance Criteria:**

**Given** the player triggers zoom-in or zoom-out
**When** the transition starts
**Then** the departing board is captured to an offscreen canvas as a frozen snapshot
**And** the snapshot animates (scale/position/fade) over ~0.5 seconds
**And** the arriving board begins live rendering only after the transition completes
**And** exactly one board is live-evaluated at all times during the transition
**And** puzzle completion zoom-out uses the same snapshot mechanism

**Redesign impact:** Superseded by Story 7.3. Zoom animation changes from generic scale/fade to lid-open clamshell (vertical split, halves hinge outward).

### Story 3.3: Breadcrumb Bar *(Implemented)*

As a player,
I want to see where I am in the nesting hierarchy,
So that I don't get lost when editing nodes inside nodes.

**Acceptance Criteria:**

**Given** the player is inside a nested gameboard
**When** the breadcrumb bar renders
**Then** it shows the full path (e.g., "Main Puzzle > Low-Pass Filter > Smoother")
**And** breadcrumbs update on every navigation (zoom in/out)
**And** breadcrumbs are read-only indicators (not clickable for navigation)

*Covers: FR17*

### Story 3.4: Utility Node Creation & Management *(Implemented)*

As a player,
I want to create my own reusable nodes for patterns I use frequently,
So that I can reduce tedium and manage complexity my own way.

**Acceptance Criteria:**

**Given** the palette is visible
**When** the player clicks "Create Custom Node"
**Then** a zoom-in animation transitions to a blank gameboard (no input source, no target)
**And** the player can build any node configuration on the blank gameboard
**And** clicking Save prompts for a name and saves the node to the Utility section of the palette
**And** the player can edit any utility node by clicking Edit on it in the palette
**And** the player can delete utility nodes from their library
**And** the Utility section appears in the palette below Fundamental and Puzzle sections

*Covers: FR19, FR24, FR25, FR26 (utility section)*

**Redesign impact:** Custom (utility) nodes will use gameboard-aspect-ratio sizing on the grid (Story 6.4). Connection points in custom node gameboards default to output; player can toggle to input and select a test waveform (Story 5.3).

### Story 3.5: Node Instance Model & Library Sync *(Implemented)*

As a player,
I want placed nodes to track whether their library version has changed,
So that I know when an instance differs from the latest saved version.

**Acceptance Criteria:**

**Given** a node is placed on a gameboard
**When** it is created
**Then** it is a deep clone from the palette library with a stored `libraryVersionHash`
**And** each library entry has a version hash updated on every save
**And** when `instance.libraryVersionHash !== library.currentVersionHash`, a modified indicator is shown
**And** utility node save: player chooses to overwrite (keep name) or rename (new library entry)
**And** puzzle node re-solve: hot-replaces all active instances across all gameboards with the new baked version
**And** custom nodes can contain other custom nodes (recursive nesting supported by GameboardTree)

*Covers: FR29, AR11, AR12*

---

## Epic 4: Progression & Persistence *(Implemented)*

Player progresses through 25+ levels across 4 arcs, with full save/load and undo/redo, creating a complete game experience.

### Story 4.1: Level Definitions -- Tutorial Arc (Levels 1-5) *(Implemented)*

*(Unchanged -- see original acceptance criteria above)*

*Covers: FR30 (partial)*

### Story 4.2: Level Definitions -- Remaining Arcs (Levels 6-25+) *(Implemented)*

*(Unchanged -- see original acceptance criteria above)*

*Covers: FR30 (complete)*

### Story 4.3: Progression System *(Implemented)*

*(Unchanged -- see original acceptance criteria above)*

*Covers: FR26 (full), FR31*

### Story 4.4: Save/Load System *(Implemented)*

*(Unchanged -- see original acceptance criteria above)*

*Covers: FR33, NFR8*

**Redesign impact:** Serialization must handle new Wire type (path, signalBuffer, writeHead instead of signals array). Theme preference persisted. Occupancy grid recomputed on deserialize (not serialized).

### Story 4.5: Undo/Redo System *(Implemented)*

*(Unchanged -- see original acceptance criteria above)*

*Covers: FR32, AR9, AR10*

---

## Epic 5: Redesign Foundation

Establish the infrastructure layer that all redesign features depend on: grid coordinate system, viewport fitting, design token pipeline, core type migrations, and the refactored render loop.

**Dependencies:** None (builds on existing codebase)
**FRs covered:** FR34, FR35, FR41, FR44

### Story 5.1: Grid Coordinate System & Viewport

As a developer,
I want a 16:9 viewport with a 32x18 grid and clean coordinate conversion between grid and pixel spaces,
So that all rendering, placement, and routing share a single spatial foundation.

**Acceptance Criteria:**

**Given** the app loads in any viewport size
**When** the gameboard initializes
**Then** `cellSize = Math.floor(Math.min(viewportWidth / 32, viewportHeight / 18))` computes the grid cell size
**And** the gameboard (32 * cellSize x 18 * cellSize) is centered in the viewport
**And** remaining viewport space fills with page background color (#050508)
**And** Canvas resolution is gameboard dimensions * `devicePixelRatio` for crisp rendering
**And** `src/shared/grid/` exports `GridPoint` ({col, row}), `GridRect`, `PixelPoint` ({x, y}), `PixelRect` types
**And** `gridToPixel(col, row, cellSize)` returns the top-left pixel of the cell
**And** `pixelToGrid(x, y, cellSize)` returns the grid cell (floor)
**And** `gridRectToPixels(gridRect, cellSize)` returns the full PixelRect
**And** the grid has 3 zones: left meter (cols 0-2), playable area (cols 3-28), right meter (cols 29-31)
**And** if computed cellSize falls below 32px, the game shows a "viewport too small" warning
**And** window resize recomputes cellSize and repositions all elements (debounced)

**Tests:**
- gridToPixel and pixelToGrid round-trip correctly
- Viewport fitting produces centered gameboard for common resolutions (1280x720, 1920x1080, 2560x1440)
- Zone boundaries computed correctly from cellSize

*Covers: FR34, AR15*

### Story 5.2: Design Token System & Dual Themes

As a developer,
I want a three-tier design token system with dark and light themes,
So that Canvas rendering and CSS styling read from a single, cached, typed token source.

**Acceptance Criteria:**

**Given** the app loads
**When** the theme initializes (default: dark / Signal Bench)
**Then** `assets/styles/tokens.css` defines CSS custom properties for all tiers (primitive -> semantic -> component)
**And** `assets/styles/theme-dark.css` defines Signal Bench primitive overrides (near-black surfaces, amber/teal polarity)
**And** `assets/styles/theme-light.css` defines Studio Monitor primitive overrides (warm gray surfaces, deeper amber/teal)
**And** `assets/styles/animations.css` defines animation duration/easing tokens
**And** `src/shared/tokens/token-types.ts` exports `TokenKey` union and `ThemeTokens` type as flat `Record<TokenKey, string>`
**And** `src/shared/tokens/build-theme-tokens.ts` reads CSS custom properties via `getComputedStyle` and builds a `ThemeTokens` object
**And** `buildThemeTokens()` is called once on init and once on theme switch (not per frame)
**And** theme switch sets `data-theme` attribute on the root element, then calls `buildThemeTokens()`
**And** Canvas code never calls `getComputedStyle` -- it receives `tokens: ThemeTokens` as a parameter
**And** polarity colors meet WCAG AA contrast (4.5:1 text, 3:1 non-text) against their backgrounds in both themes
**And** `animations.css` respects `prefers-reduced-motion` -- all durations resolve to 0 or reduced values when active
**And** reduced motion listener updates tokens on media query change

**Token keys include at minimum:**
- Surfaces: `pageBackground`, `gameboardSurface`, `gridArea`, `meterHousing`, `meterInterior`, `surfaceNode`, `surfaceNodeBottom`
- Signals: `signalPositive`, `signalNegative`, `colorNeutral`, `colorTarget`, `meterNeedle`
- Depth: `depthRaised`, `depthSunken`
- Selection: `colorSelection`
- Wire: `wireWidthBase`
- Animation: `animationZoomDuration`, `animationNodeScaleDuration`, `animationWireDrawDuration`

**Tests:**
- buildThemeTokens produces all expected keys
- Theme switch produces different values for surface tokens
- Token values are valid CSS color/length strings

*Covers: FR35, NFR11, NFR12*

### Story 5.3: Core Type Migrations & Connection Point Configuration

As a developer,
I want the Wire and NodeState types updated for grid-based coordinates and signal ring buffers, and connection points configurable per puzzle,
So that the data model supports auto-routing, polarity rendering, and flexible puzzle design.

**Acceptance Criteria:**

**Wire type migration:**
**Given** the existing Wire type (`from`/`to`, `wtsDelay`, `signals: Signal[]`)
**When** migrated
**Then** Wire becomes `{ id, source: PortRef, target: PortRef, path: GridPoint[], signalBuffer: number[], writeHead: number }`
**And** `path` stores the auto-routed grid cells (set by routing-slice)
**And** `signalBuffer` is a fixed-size array of 16 entries (1 WTS), ring-written by the engine
**And** `writeHead` is the current write position in the buffer
**And** the `Signal` type (`{value, ticksRemaining}`) is removed if unused after migration
**And** all existing code referencing `Wire.from`/`.to` is updated to `Wire.source`/`.target`
**And** engine tick scheduler writes to `signalBuffer` instead of `signals` array

**NodeState position migration:**
**Given** the existing `NodeState.position` as `Vec2` ({x, y} pixels)
**When** migrated
**Then** `NodeState.position` becomes `GridPoint` ({col, row})
**And** all code reading `node.position.x`/`.y` is updated to `node.position.col`/`.row`
**And** pixel positions are computed at render time via `gridToPixel()`

**Occupancy grid:**
**Given** a gameboard with placed nodes
**When** the gameboard slice initializes or a node is placed/moved/deleted
**Then** `occupancy: boolean[][]` (32x18) is maintained in the gameboard slice
**And** node bounding boxes mark their cells as occupied
**And** the occupancy grid is derived state -- recomputed from node positions on deserialization

**Connection point configuration:**
**Given** a puzzle definition
**When** the puzzle loads
**Then** the puzzle specifies which of 6 connection points (3 left, 3 right) are active
**And** each active connection point has a configured direction (input or output)
**And** inactive connection points are hidden (not rendered)
**And** in custom node gameboards, all 6 connection points default to output; player can toggle input/output

**And** `VICTORY_CYCLES` constant in `shared/constants/index.ts` is updated from 2 to 1

**Tests:**
- Wire signalBuffer ring write/read produces correct values
- NodeState grid position stores col/row, not pixels
- Occupancy grid correctly marks cells for nodes of various sizes
- Occupancy recompute from node positions matches incremental updates
- Connection point configuration respects puzzle definition
- Custom node connection points toggle correctly

*Covers: FR41, FR44, partial FR20 (victory threshold)*

### Story 5.4: Render Loop & Draw Function Refactor

As a developer,
I want all Canvas render functions to follow the `(ctx, tokens, state, rect)` signature and the render loop to be the sole Zustand-Canvas bridge,
So that rendering is consistent, testable, and token-driven.

**Acceptance Criteria:**

**Given** the render loop runs each frame
**When** `renderFrame` executes
**Then** `render-loop.ts` calls `getState()` exactly once per frame
**And** `render-loop.ts` reads `themeTokens` from the cached ThemeTokens object (not from constants or CSS)
**And** it dispatches to draw functions with signature: `drawX(ctx, tokens, stateSlice, rect)`
**And** draw functions never import `useGameStore`
**And** draw functions never call `getComputedStyle`
**And** draw functions never read COLORS constants (COLORS object removed or deprecated)
**And** all existing render functions (`render-nodes.ts`, `render-wires.ts`, `render-connection-points.ts`, `render-waveforms.ts`, `render-wire-preview.ts`) are refactored to the new signature
**And** the render loop checks `activeOverlay.type` and dims/skips interaction feedback when an overlay is open
**And** the render loop checks animation state and delegates to animation draw functions when active

**Tests:**
- Draw functions receive tokens and state as params (no global reads)
- Render loop calls getState() once (verified via mock)

*Covers: AR14, AR18*

### Story 5.5: Grid Zone & Background Rendering

As a player,
I want to see the gameboard grid with distinct zones for meters and the playable area,
So that the spatial layout is clear before I start building.

**Acceptance Criteria:**

**Given** the gameboard renders
**When** the grid is drawn
**Then** the playable area (cols 3-28) shows subtle grid lines at cell boundaries using `tokens.gridArea` color
**And** left meter zone (cols 0-2) and right meter zone (cols 29-31) render with `tokens.meterHousing` background
**And** grid lines are drawn behind all other elements (lowest z-order)
**And** grid opacity may reduce during zoom animations
**And** `gameboard/canvas/render-grid.ts` exports `drawGrid(ctx, tokens, gridState, rect)`

**Tests:**
- Grid lines render at correct pixel positions for various cellSizes
- Zone backgrounds fill correct column ranges

*Covers: FR34 (visual)*

---

## Epic 6: Redesign Signal Visualization

Replace connection-point waveforms and wire pulse animation with three-channel analog meters, auto-routed wire paths, polarity-colored wire rendering, and grid-aware node placement.

**Dependencies:** Epic 5 (grid system, tokens, type migrations, render loop)
**FRs covered:** FR36, FR37, FR38, FR45, FR46, FR47

### Story 6.1: Analog Meter Rendering

As a player,
I want to see three-channel analog meters at each active connection point showing needle, level bar, and scrolling waveform,
So that I can read signal state at a glance without hovering or inspecting.

**Acceptance Criteria:**

**Given** a connection point is active (per puzzle config or custom node setup)
**When** the meter renders each frame
**Then** the meter housing renders as a recessed panel in the meter zone using `tokens.meterHousing` and `tokens.meterInterior`
**And** the three channels render left to right within the housing:

**Scrolling waveform channel:**
**And** a circular buffer (`Float64Array(128)`) stores recent signal samples per meter
**And** the waveform draws as a polarity-colored fill between zero-line and value using 3-stop gradient (full opacity at peak -> 0.6 at 30% -> 0.1 at tail)
**And** output meters scroll toward the graph (toward needle); input meters scroll away from the graph
**And** in puzzle context, output meters overlay the target waveform as an unfilled line using `tokens.colorTarget`

**Level bar channel:**
**And** the level bar fills from centerline outward using polarity color (`tokens.signalPositive` for positive, `tokens.signalNegative` for negative)
**And** fill direction encodes polarity (up = positive, down = negative)

**Needle channel:**
**And** the needle renders as a horizontal line at signal level using `tokens.meterNeedle` (#E03838 dark / #CC3030 light)
**And** the needle has a `shadowBlur: 8` glow in the needle color at 0.6 alpha
**And** the needle is visually distinct from both polarity colors

**And** a centerline at 50% height renders across all channels using `tokens.colorNeutral`
**And** unused meters are hidden (puzzle context) or dimmed (custom node context)

**Store support:**
**And** `store/slices/meter-slice.ts` exports meter state and circular buffer references per connection point
**And** meter state updates each engine tick with the latest signal value

**Tests:**
- Circular buffer correctly wraps and produces expected sample sequences
- Meter state updates on each tick
- Draw function produces correct visual output for known signal values (snapshot or property tests)

*Covers: FR37, FR46, FR47*

### Story 6.2: Wire Auto-Routing Engine

As a developer,
I want wires to be auto-routed via A* on the grid graph with H/V/45-degree constraints,
So that wire paths are clean, avoid node bounding boxes, and update automatically.

**Acceptance Criteria:**

**A* pathfinding:**
**Given** a source port and target port on the grid
**When** the auto-router runs
**Then** `shared/routing/grid-graph.ts` generates the graph with edges connecting only H/V/45-degree neighbor cells
**And** `shared/routing/auto-router.ts` runs A* on this graph using the occupancy grid to mark impassable cells
**And** the heuristic penalizes direction changes to produce clean paths with minimal jogs
**And** wires enter and exit ports horizontally (horizontal-only start/end segments)
**And** no 90-degree turns are possible (enforced by graph edge structure)
**And** if no path exists, the router returns an error result

**Occupancy integration:**
**And** `shared/routing/occupancy.ts` provides helpers to mark/clear cells and check availability
**And** node bounding boxes mark their cells as impassable in the occupancy grid
**And** wire paths themselves do NOT mark cells as impassable (wires can cross)

**Rerouting:**
**And** `store/slices/routing-slice.ts` manages wire paths and reroute triggers
**And** when a node is placed, moved, or deleted, the occupancy grid updates
**And** all affected wires (paths through newly occupied/freed cells + wires connected to moved nodes) re-run A*
**And** rerouted paths are written back to the Wire's `path` field in the store

**Performance:**
**And** A* on a 576-cell grid is effectively instant at the scale of dozens of nodes and wires
**And** batch rerouting (multiple wires affected by one node move) runs in a single store action

**Tests:**
- A* finds shortest valid path on empty grid
- A* routes around occupied cells
- A* produces only H/V/45-degree segments
- A* returns error when no path exists
- Rerouting triggers on node place/move/delete
- Direction change penalty produces clean paths (fewer jogs than unconstrained A*)

*Covers: FR36*

### Story 6.3: Wire Signal Rendering

As a player,
I want wires colored by the signal they carry -- neutral gray at zero, polarity-colored as amplitude increases, with a glow halo at peak levels,
So that I can read signal flow by looking at wire colors.

**Acceptance Criteria:**

**Signal-to-visual mapping:**
**Given** a wire with a signal value
**When** the wire renders
**Then** signal 0 = neutral gray (`tokens.colorNeutral` / #3a3a4a)
**And** signal 0 to +/-75 = linear gradient from neutral toward full polarity color (amber `tokens.signalPositive` / teal `tokens.signalNegative`)
**And** signal +/-75 = full polarity color, no glow
**And** signal +/-75 to +/-100 = full polarity color, glow halo ramps from `shadowBlur: 0` to `shadowBlur: 12`
**And** signal +/-100 = full polarity color with maximum glow

**Per-segment rendering:**
**And** the wire reads its `signalBuffer` (16 samples) and maps path segments to buffer entries proportionally
**And** each segment is colored independently based on its corresponding signal sample

**Three-pass rendering recipe:**
**And** pass 1: draw base wire path at neutral color (thin, low-opacity)
**And** pass 2 (glow): for segments with |value| > 75, draw with `shadowBlur` proportional to glow intensity
**And** pass 3 (color): draw all segments with polarity-colored stroke

**And** wire rendering follows the `drawWires(ctx, tokens, wiresState, cellSize)` signature
**And** in-progress wire drawing (during wiring interaction) renders as a dashed line from source port to cursor

**Tests:**
- Signal 0 produces neutral color
- Signal +50 produces intermediate amber
- Signal -75 produces full teal, no glow
- Signal +100 produces full amber with maximum glow
- Per-segment coloring varies across buffer entries

*Covers: FR38*

### Story 6.4: Node Grid Rendering & Sizing

As a player,
I want nodes rendered on the grid with correct sizing per type -- custom nodes matching gameboard aspect ratio, puzzle and fundamental nodes compact,
So that node types are visually distinct and the layout is spatially organized.

**Acceptance Criteria:**

**Node sizing on grid:**
**Given** a node is placed on the gameboard
**When** it renders
**Then** custom (utility) nodes occupy a fixed number of grid cells matching the 16:9 gameboard aspect ratio
**And** puzzle (earned) nodes use compact sizing -- dynamic, fits active port count
**And** fundamental nodes use minimal footprint -- compact rectangle
**And** all node positions are in grid coordinates; pixel positions computed at render time

**Node rendering:**
**And** node body renders as a rounded rectangle with gradient fill (`tokens.surfaceNode` top -> `tokens.surfaceNodeBottom`)
**And** node body has a drop shadow using `tokens.depthRaised`
**And** label renders in geometric sans-serif
**And** sublabel (type or parameter value) renders in monospace
**And** ports render as circles along left and right edges, colored by signal polarity or neutral
**And** focus ring (2px `tokens.colorSelection` outline) renders when node is focused via keyboard

**Node states:**
**And** default: standard gradient + shadow
**And** hover: brightened surface + highlighted border
**And** selected: accent border stroke, intensified shadow
**And** dragging: elevated shadow, slight scale

**And** `gameboard/canvas/render-nodes.ts` exports `drawNodes(ctx, tokens, nodesState, cellSize)`

**Tests:**
- Custom node occupies correct grid cells for gameboard aspect ratio
- Puzzle node sizing adapts to port count
- Fundamental node uses minimum footprint
- All visual states produce distinct rendering

*Covers: FR45*

---

## Epic 7: Redesign Interaction & Navigation

Replace sidebar UI with full-screen overlay system, implement lid-open zoom animation, add multi-phase validation ceremony, and provide keyboard-only gameplay with reduced motion support.

**Dependencies:** Epic 5 (tokens, overlay slice), Epic 6 (meters, wires, nodes render on grid)
**FRs covered:** FR39, FR40, FR42, FR43, FR48

### Story 7.1: Overlay System & Focus Management

As a developer,
I want a single-overlay-at-a-time state system with clean focus management between Canvas and DOM overlays,
So that input never competes between Canvas and React.

**Acceptance Criteria:**

**Overlay state:**
**Given** the overlay system initializes
**When** any overlay is opened
**Then** `store/slices/overlay-slice.ts` manages `activeOverlay` as a discriminated union:
  `{ type: 'none' } | { type: 'palette-modal' } | { type: 'parameter-popover', nodeId } | { type: 'context-menu', position, target } | { type: 'inspect-modal', nodeId } | { type: 'save-dialog' } | { type: 'unsaved-changes' }`
**And** only one overlay is active at a time -- opening a new one replaces the current
**And** `activeOverlay.type === 'none'` -> Canvas receives all input
**And** `activeOverlay.type !== 'none'` -> overlay traps focus, Canvas ignores input

**Focus management:**
**And** `gameboard/interaction/focus-manager.ts` tracks which context has focus (Canvas or Overlay)
**And** opening an overlay calls `element.focus()` on the overlay's first focusable element
**And** closing an overlay restores focus to the previously focused Canvas element
**And** overlay focus trapping prevents Tab from escaping to Canvas

**Escape key cascade (per UX spec):**
**And** Escape priority: (1) close overlay -> (2) cancel wiring -> (3) deselect -> (4) zoom out one level -> (5) no-op at root

**And** all overlays dismiss on Escape except `save-dialog` and `unsaved-changes` which require explicit button click
**And** React components read `activeOverlay` to conditionally render
**And** render loop reads `activeOverlay` to dim/skip interaction feedback

**Tests:**
- Only one overlay active at a time
- Focus moves to overlay on open, returns on close
- Escape cascade follows priority order
- Canvas ignores input when overlay is open

*Covers: FR40 (partial), AR17*

### Story 7.2: Palette Modal, Parameter Popover & Context Menu

As a player,
I want a modal to browse and select nodes, a popover to adjust parameters, and a context menu for element actions,
So that I can interact with the gameboard without persistent UI chrome.

**Acceptance Criteria:**

**Palette modal:**
**Given** the player right-clicks empty space or presses N/Space
**When** the palette modal opens
**Then** it shows three sections: Fundamental Nodes, Puzzle Nodes (earned), Utility Nodes (player-created)
**And** a search input has keyboard focus on open, filtering nodes as the player types
**And** arrow keys navigate items, Enter selects, Escape closes
**And** selecting a node dismisses the modal and activates a placement ghost
**And** "Create Custom Node" action at bottom of Utility section triggers utility node creation flow
**And** `ui/overlays/PaletteModal.tsx` renders with CSS Modules and focus trap

**Placement ghost:**
**And** after selecting from palette, a semi-transparent (40% opacity) node preview follows the cursor on the grid
**And** the ghost snaps to valid grid positions
**And** valid positions show normal ghost; overlapping positions show red-tinted ghost
**And** click places the node; Escape cancels placement

**Parameter popover:**
**Given** the player clicks a placed node (or selects + Enter)
**When** the popover opens
**Then** it anchors adjacent to the node with an arrow pointing to it
**And** it shows controls per node type: Mix mode dropdown, Delay subdivision dropdown, Threshold slider, Constant numeric input
**And** value changes apply immediately (real-time signal feedback)
**And** Tab cycles controls, Escape closes
**And** `ui/overlays/ParameterPopover.tsx` renders with CSS Modules

**Context menu:**
**Given** the player right-clicks an element
**When** the context menu opens
**Then** it shows actions based on target:
  - Node: Inspect (puzzle), Edit (utility), Delete, Set Parameters
  - Wire: Delete
  - Empty space: Open Palette, Create Custom Node
  - Connection point (custom node): Toggle Input/Output
**And** arrow keys navigate, Enter activates, Escape closes
**And** `ui/overlays/ContextMenu.tsx` renders at click position

**Tests:**
- Palette modal filters nodes by search text
- Placement ghost snaps to grid and validates position
- Parameter changes propagate to store immediately
- Context menu shows correct items per target type
- All overlays dismiss on Escape

*Covers: FR40, FR42 (partial -- overlay keyboard)*

### Story 7.3: Lid-Open Clamshell Zoom Animation

As a player,
I want zooming into a custom node to feel like physically opening a component -- the node splits vertically and the halves hinge outward like double doors,
So that abstraction hierarchy feels spatial and tangible.

**Acceptance Criteria:**

**Animation state machine:**
**Given** `store/slices/animation-slice.ts`
**When** a zoom animation triggers
**Then** `LidAnimationState` uses a discriminated union:
  `{ type: 'idle' } | { type: 'opening', progress: number, snapshot: OffscreenCanvas } | { type: 'open' } | { type: 'closing', progress: number, snapshot: OffscreenCanvas }`
**And** `progress` is 0-1, advanced by the rAF loop based on elapsed time and `tokens.animationZoomDuration`
**And** only one animation can be active at a time (idle check before starting)

**Zoom-in sequence (opening):**
**And** the node's current appearance is captured to an OffscreenCanvas
**And** the snapshot splits vertically down the center
**And** the left half compresses toward the left edge (X-scale -> 0) while translating slightly left
**And** the right half mirrors: compresses toward right edge, translates slightly right
**And** the interior gameboard is revealed from center outward as halves retract
**And** shadow renders on closing edges and subtle highlight on hinge edges for depth
**And** the interior begins live rendering when animation completes (progress = 1)
**And** total duration: ~500ms, ease-in-out

**Zoom-out sequence (closing):**
**And** interior freezes to an OffscreenCanvas snapshot
**And** halves close from edges toward center (reverse of opening)
**And** parent gameboard resumes live rendering when animation completes

**And** `gameboard/animation/lid-animation.ts` exports draw functions following `(ctx, tokens, state, rect)` signature
**And** reduced motion: instant crossfade (~100ms) instead of lid animation

**Tests:**
- Animation state transitions: idle -> opening -> open, open -> closing -> idle
- Progress advances correctly based on elapsed time
- Reduced motion skips to final state
- Only one animation active at a time

*Covers: FR39, AR16*

### Story 7.4: Validation Ceremony Animation

As a player,
I want the victory moment to build through multiple phases -- streak counting, victory burst, name reveal, and zoom-out,
So that puzzle completion feels earned and celebratory.

**Acceptance Criteria:**

**Ceremony state machine:**
**Given** `store/slices/animation-slice.ts` (or ceremony-slice.ts)
**When** validation triggers victory
**Then** `ValidationCeremonyState` uses a discriminated union:
  `{ type: 'inactive' } | { type: 'streak', tickCount } | { type: 'victory-burst', progress } | { type: 'name-reveal', progress } | { type: 'zoom-out', progress }`

**Phase 1 - Streak:**
**And** as validation streak builds, output meter waveforms pulse between polarity color and confirming variant
**And** streak tick count is visible to the player (rising anticipation)

**Phase 2 - Victory burst:**
**And** when streak reaches 1 full cycle, both polarity colors flash at full intensity
**And** progress 0-1 over ~300ms

**Phase 3 - Name reveal:**
**And** puzzle node name and description appear with a fade/scale animation
**And** progress 0-1 over ~500ms

**Phase 4 - Zoom-out:**
**And** gameboard shrinks into a compact puzzle node using offscreen canvas snapshot
**And** reuses the lid-close mechanism (reverse clamshell)
**And** baked node added to palette when animation completes

**And** `gameboard/animation/validation-ceremony.ts` exports draw functions following `(ctx, tokens, state, rect)` signature
**And** reduced motion: skip burst animation, instant name reveal, simplified zoom-out

**Tests:**
- Ceremony state transitions through all phases in order
- Each phase advances with correct timing
- Reduced motion skips to final state per phase
- Baked node added to palette after zoom-out completes

*Covers: FR48, AR16*

### Story 7.5: Keyboard Navigation & Reduced Motion

As a player,
I want to play the entire game using only the keyboard, and I want the game to respect my reduced motion preferences,
So that the game is accessible regardless of input method or motion sensitivity.

**Acceptance Criteria:**

**Canvas Tab order:**
**Given** the Canvas gameboard is focused
**When** the player presses Tab
**Then** focus cycles through gameboard elements: nodes (left-to-right, top-to-bottom) -> ports on focused node -> wires connected to focused node
**And** Shift+Tab reverses the order
**And** all focusable Canvas elements show a visible focus ring (2px `tokens.colorSelection` outline, offset)

**Keyboard equivalents for all mouse actions:**
| Action | Mouse | Keyboard |
|--------|-------|----------|
| Open palette | Right-click empty space | N or Space |
| Place node | Click grid position | Arrow keys move ghost + Enter |
| Start wiring | Click output port | Tab to port + Enter |
| Complete wiring | Click input port | Tab to target port + Enter |
| Adjust parameter | Click node | Select node + Enter opens popover |
| Delete element | Right-click -> Delete | Select + Delete key |
| Navigate hierarchy | Double-click utility node | Select + Enter |
| Zoom out | N/A | Escape |

**Keyboard wiring mode:**
**And** after pressing Enter on a source port, a "wiring mode" activates
**And** Tab cycles through valid target ports (highlighted)
**And** Enter on a target port completes the wire
**And** Escape cancels wiring mode

**Reduced motion:**
**Given** `prefers-reduced-motion: reduce` is active
**When** the game initializes
**Then** all animation duration tokens resolve to 0 or reduced equivalents
**And** lid-open animation becomes instant crossfade (~100ms)
**And** node scale-in becomes instant appear
**And** wire draw animation becomes instant appear
**And** waveform scrolling becomes static snapshot (still shows current signal shape)
**And** needle jumps to position (no easing)
**And** validation streak glow is static at final intensity
**And** completion ceremony skips burst, instant name reveal
**And** the Canvas rAF loop still runs (signal state must update)
**And** reduced motion state updates if the user changes their OS preference mid-session

**Tests:**
- Tab order cycles through nodes in spatial order
- Keyboard wiring completes a connection
- All mouse actions have keyboard equivalents
- Reduced motion resolves durations to 0
- Focus ring renders on keyboard-focused elements
- Reduced motion listener responds to mid-session changes

*Covers: FR42, FR43*

---

## Redesign Dependency Graph

```
Epic 5: Foundation
  5.1 Grid System ─────────────────────┐
  5.2 Token System ────────────────────┤
  5.3 Type Migrations ─────────────────┤
  5.4 Render Loop Refactor ────────────┤
  5.5 Grid Zone Rendering ─────────────┘
         │
         ▼
Epic 6: Signal Visualization
  6.1 Analog Meters ───────────────────┐
  6.2 Auto-Routing ────────────────────┤
  6.3 Wire Signal Rendering ───────────┤
  6.4 Node Grid Rendering ────────────┘
         │
         ▼
Epic 7: Interaction & Navigation
  7.1 Overlay System ──────────────────┐
  7.2 Palette/Popover/Context Menu ────┤
  7.3 Lid-Open Animation ─────────────┤
  7.4 Validation Ceremony ─────────────┤
  7.5 Keyboard & Reduced Motion ───────┘
```

**Within-epic dependencies:**
- 5.4 depends on 5.1 + 5.2
- 5.5 depends on 5.1 + 5.2 + 5.4
- 6.1 depends on 5.2 (tokens) + 5.3 (meter-slice)
- 6.2 depends on 5.1 (grid) + 5.3 (occupancy, wire type)
- 6.3 depends on 5.3 (wire signal buffer) + 5.2 (tokens)
- 6.4 depends on 5.1 (grid) + 5.2 (tokens)
- 7.1 depends on 5.2 (tokens) + 5.4 (render loop overlay check)
- 7.2 depends on 7.1 (overlay system)
- 7.3 depends on 5.4 (render loop) + 7.1 (animation slice)
- 7.4 depends on 7.3 (reuses lid-close for zoom-out phase)
- 7.5 depends on 7.1 (focus manager) + 5.2 (animation tokens)

---

## Summary

| Epic | Stories | Status | Scope |
|------|---------|--------|-------|
| 1: Interactive Signal Sandbox | 1.1-1.8 | Implemented | Original |
| 2: Puzzle Play | 2.1-2.5 | Implemented | Original |
| 3: Node Building & Navigation | 3.1-3.5 | Implemented | Original |
| 4: Progression & Persistence | 4.1-4.5 | Implemented | Original |
| 5: Redesign Foundation | 5.1-5.5 | Planned | Redesign |
| 6: Redesign Signal Visualization | 6.1-6.4 | Planned | Redesign |
| 7: Redesign Interaction & Navigation | 7.1-7.5 | Planned | Redesign |
| **Total** | **32 stories** | | |

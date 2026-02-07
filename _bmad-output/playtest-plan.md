# Playtest Plan: Signal Processing Puzzle Game

**Version**: Post-Redesign (Epics 1-7 Complete)
**Created**: 2026-02-04
**Author**: Eric Chavez
**Platform**: Desktop Web Browser (Canvas 2D + React 19)

---

## Overview

### Objective

Validate the end-to-end player experience of the signal processing puzzle game after the UX redesign (Epics 5-7). The redesign replaced the sidebar-based UI with a full-screen immersive canvas experience featuring analog meters, auto-routed wires, lid-open zoom animations, and keyboard navigation. This playtest verifies that the new interactions are intuitive, the gameplay loop is satisfying, and the 15 puzzle levels provide a well-paced difficulty curve.

### Build Information

- **Stack**: Canvas 2D + React 19 + Zustand + TypeScript + Vite
- **Content**: 15 puzzle levels across 4 arcs, 5 fundamental node types, utility node creation, undo/redo, save/load, dual themes
- **Test Suite**: 976 tests passing across 66 suites
- **Known Limitations**:
  - Some puzzle levels described in the GDD (45+) are not yet implemented (15 exist)
  - Persistent UI chrome has been fully removed -- all interaction is context-menu/modal/keyboard driven
  - No audio/SFX yet

### Success Criteria

- Players can complete Tutorial Arc (Levels 1-5) without external help
- Players understand the recursive "every puzzle becomes a node" concept by Level 3
- Signal meters provide readable feedback without hover/inspect
- Wire auto-routing produces clean, traceable paths
- Zoom transitions (lid animation) feel spatial and intuitive
- Keyboard-only play is functional for all core actions
- No critical bugs blocking progression

---

## Playtest Type: Internal / Focused

This is an **internal focused playtest** -- the tester plays through the full game sequence while observing specific UX quality targets.

| Aspect | Details |
|--------|---------|
| Participants | Developer (self-playtest), plus 1-2 trusted testers if available |
| Duration | 60-90 minutes per full playthrough |
| Frequency | Once after each major fix cycle |
| Setup | `npm run dev`, open in Chrome/Firefox, full-screen recommended |

---

## Complete Level Walkthrough

### How to Read This Section

Each level lists:
- **What the player should do** (expected solution path)
- **What to observe** (UX quality signals)
- **Red flags** (things that indicate a problem)

---

### Arc 1: Tutorial (Levels 1-5)

**Goal**: Teach fundamental nodes while building essential processors. By the end, the player should understand: node placement, wiring, connection point constants, parameter configuration, and the "puzzle becomes a node" loop.

---

#### Level 1: Rectifier

**ID**: `tutorial-rectifier` | **Inputs**: 1 | **Outputs**: 1 | **Allowed Nodes**: Mix

**What it teaches**: The Mix node in Max mode; using constant values on connection points.

**Expected gameplay**:
1. Player sees the gameboard: one active input meter on the left showing a sine wave, one active output meter on the right showing a target waveform (positive half only)
2. Player opens the palette (press N, Space, or right-click empty space)
3. Player selects a Mix node and places it on the grid
4. Player connects the input connection point to Mix input A
5. Player sets Mix input B to constant 0 (click the port, set value)
6. Player sets Mix mode to "Max" (click node or press Enter to open parameter popover)
7. Output meter shows rectified sine -- positive values pass through, negatives become 0
8. Validation streak begins counting. After 1 full cycle of match, victory ceremony fires
9. Name reveal: "Rectifier" -- zoom-out animation plays, node added to palette

**Observe**:
- [ ] Can the player figure out how to open the palette?
- [ ] Is the target waveform overlay visible and distinguishable from the actual output?
- [ ] Does the player understand what "Max mode" does by watching the meter?
- [ ] Is the victory ceremony satisfying? Does the name reveal feel earned?
- [ ] Does the zoom-out animation clearly show "gameboard becomes a node"?

**Red flags**:
- Player doesn't know how to place a node (palette discoverability failure)
- Player can't figure out how to set a constant on a connection point
- Player can't tell the difference between target overlay and actual waveform
- Victory fires but the player doesn't understand what happened

---

#### Level 2: Amplifier 2x

**ID**: `tutorial-amplifier` | **Inputs**: 1 | **Outputs**: 1 | **Allowed Nodes**: Mix

**What it teaches**: Mix Add mode; the concept of routing one signal to both inputs.

**Expected gameplay**:
1. Input: sine wave amplitude 50. Target: sine wave amplitude 100
2. Player places Mix node, sets mode to "Add"
3. Player wires the input to BOTH Mix input A and Mix input B
4. Output doubles: 50 + 50 = 100
5. Validation passes, "Amplifier 2x" revealed

**Observe**:
- [ ] Can the player wire one source to two destinations?
- [ ] Do the meters clearly show the amplitude doubling?
- [ ] Does auto-routing handle two wires from the same source cleanly?

**Red flags**:
- Player doesn't realize they can wire one output to multiple inputs
- Two wires from the same port overlap visually and become unreadable
- Player tries to use Multiply instead (not available for this level)

---

#### Level 3: DC Offset +50

**ID**: `tutorial-dc-offset` | **Inputs**: 1 | **Outputs**: 1 | **Allowed Nodes**: Mix

**What it teaches**: Mix Add with a constant; shifting a signal's baseline.

**Expected gameplay**:
1. Input: sine wave amp 50 (oscillates -50 to +50). Target: same wave shifted up (0 to +100)
2. Player places Mix node (Add mode)
3. Player wires input to Mix input A
4. Player sets Mix input B to constant +50
5. Output is the original wave shifted up by 50
6. "DC Offset +50" revealed

**Observe**:
- [ ] Does the player understand that adding a constant shifts the wave?
- [ ] Is the level bar on the output meter clearly showing the new range?
- [ ] Is the needle position intuitive (centered higher)?
- [ ] **Tutorial moment**: At this point the player should start feeling comfortable with the core loop

**Red flags**:
- Player sets the constant on the wrong port
- Player tries negative constant (misreads the target)
- Meters don't clearly show the shift relative to the zero line

---

#### Level 4: Clipper +/-50

**ID**: `tutorial-clipper` | **Inputs**: 1 | **Outputs**: 1 | **Allowed Nodes**: Mix

**What it teaches**: Chaining nodes; using Min and Max modes in sequence.

**Expected gameplay**:
1. Input: sine wave full range (-100 to +100). Target: clipped to +/-50
2. Player places TWO Mix nodes
3. First Mix: Min mode with constant +50 (caps the top)
4. Second Mix: Max mode with constant -50 (caps the bottom)
5. Wire: Input -> Mix(Min, +50) -> Mix(Max, -50) -> Output
6. "Clipper +/-50" revealed

**Observe**:
- [ ] Does the player understand they need TWO nodes chained together?
- [ ] Does auto-routing produce clean paths for a 3-node chain?
- [ ] Is the clipped waveform visually distinct on the output meter?
- [ ] Can the player read the intermediate signal on the wire between the two Mix nodes?

**Red flags**:
- Player tries to solve with one Mix node and gets stuck
- Wire routing creates confusing overlapping paths
- Player can't distinguish clipped flat tops from the original peaks

---

#### Level 5: Square Wave Generator

**ID**: `tutorial-square-gen` | **Inputs**: 1 | **Outputs**: 1 | **Allowed Nodes**: Threshold

**What it teaches**: The Threshold node; binary signal conversion.

**Expected gameplay**:
1. Input: sine wave. Target: square wave (+100 / -100)
2. Player places Threshold node
3. Player sets threshold to 0 (default)
4. Wire: Input -> Threshold(0) -> Output
5. Output snaps to +100 when input is positive, -100 when negative
6. "Square Wave Generator" revealed

**Observe**:
- [ ] Is the threshold parameter adjustment intuitive?
- [ ] Does the square wave look crisp on the output meter?
- [ ] Does the wire between input and threshold show the smooth sine, while the wire after threshold shows the square wave? (Wire signal coloring validation)

**Red flags**:
- Player doesn't know how to adjust the threshold parameter
- Wire signal rendering doesn't visually differ between sine and square sections

---

### Arc 2: Signal Shaping (Levels 6-9)

**Goal**: Introduce remaining fundamental nodes. Player now has Rectifier, Amplifier, DC Offset, Clipper, and Square Wave Generator as earned puzzle nodes in their palette.

---

#### Level 6: Inverter

**ID**: `signal-inverter` | **Inputs**: 1 | **Outputs**: 1 | **Allowed Nodes**: Invert

**Expected gameplay**:
1. Input: sine wave. Target: inverted sine (180-degree phase flip)
2. Player places Invert node
3. Wire: Input -> Invert -> Output
4. "Inverter" revealed

**Observe**:
- [ ] Trivial level -- should take <30 seconds
- [ ] Validates that the Invert node concept is clear
- [ ] Meter needle should swing opposite to input needle

---

#### Level 7: Attenuator

**ID**: `signal-attenuator` | **Inputs**: 1 | **Outputs**: 1 | **Allowed Nodes**: Multiply

**Expected gameplay**:
1. Input: sine amp 100. Target: sine amp 50
2. Player places Multiply node
3. Player sets one input to constant 50
4. Multiply logic: (input x 50) / 100 = half amplitude
5. "Attenuator" revealed

**Observe**:
- [ ] Does the player understand the Multiply scaling formula?
- [ ] Is the halved amplitude clearly visible on the output meter level bar?

---

#### Level 8: Full-Wave Rectifier

**ID**: `signal-fullwave-rectifier` | **Inputs**: 1 | **Outputs**: 1 | **Allowed Nodes**: Mix, Invert

**Expected gameplay**:
1. Input: sine wave. Target: absolute value (all positive, double frequency appearance)
2. Player places Invert node + Mix(Max) node
3. Wire: Input -> both Mix(Max) input A directly AND through Invert to Mix input B
4. max(signal, -signal) = |signal|
5. "Full-Wave Rectifier" revealed

**Observe**:
- [ ] This is the first level requiring creative problem-solving (combine two node types)
- [ ] Does the player discover the max(x, -x) = |x| insight?
- [ ] Does auto-routing handle the split-and-rejoin pattern cleanly?

**Red flags**:
- Player gets stuck and has no hint mechanism
- The two wires merging into the Mix node visually overlap

---

#### Level 9: Signal Delay

**ID**: `signal-delay` | **Inputs**: 1 | **Outputs**: 1 | **Allowed Nodes**: Delay

**Expected gameplay**:
1. Input: sine wave. Target: same sine, shifted 4 ticks later
2. Player places Delay node set to 4 subdivisions
3. "Signal Delay" revealed

**Observe**:
- [ ] Is the delay subdivision selector intuitive?
- [ ] Can the player see the phase shift on the output meter waveform?
- [ ] Does the wire signal rendering show the delay (older signal values on the wire)?

---

### Arc 3: Timing Challenge (Levels 10-12)

**Goal**: Introduce multi-input puzzles. Player now uses two inputs for the first time.

---

#### Level 10: Difference Amplifier

**ID**: `timing-difference` | **Inputs**: 2 | **Outputs**: 1 | **Allowed Nodes**: Mix

**Expected gameplay**:
1. TWO input signals provided (different amplitudes). Target: their difference
2. Player places Mix(Subtract) node
3. Wire: Input A -> Mix input A, Input B -> Mix input B
4. "Difference Amplifier" revealed

**Observe**:
- [ ] **First 2-input level** -- does the player notice both active input meters?
- [ ] Does the player understand which input is A and which is B in subtraction?
- [ ] Are the two input meters visually distinct and clearly labeled?

**Red flags**:
- Player only wires one input and doesn't notice the second
- Player wires inputs in wrong order (A-B vs B-A) and gets inverted result

---

#### Level 11: Crossfader

**ID**: `timing-crossfader` | **Inputs**: 2 | **Outputs**: 1 | **Allowed Nodes**: Mix

**Expected gameplay**:
1. Two inputs with different amplitudes. Target: their average
2. Player places Mix(Average) node
3. Wires both inputs
4. "Crossfader" revealed

**Observe**:
- [ ] Does the average result make visual sense on the meters?
- [ ] Player should be gaining confidence with multi-input routing by now

---

#### Level 12: Ring Modulator

**ID**: `timing-ring-modulator` | **Inputs**: 2 | **Outputs**: 1 | **Allowed Nodes**: Multiply

**Expected gameplay**:
1. Two inputs (e.g., sine x square). Target: their product
2. Player places Multiply node
3. Multiplying sine by square creates a complex waveform
4. "Ring Modulator" revealed

**Observe**:
- [ ] Does the player understand why sine x square produces the target shape?
- [ ] Is the resulting waveform readable on the meter?
- [ ] This is a conceptual leap -- multiplying two dynamic signals vs. multiplying by a constant

---

### Arc 4: Advanced Synthesis (Levels 13-15)

**Goal**: Open-ended problem solving. All node types available. First multi-output puzzle.

---

#### Level 13: Signal Splitter

**ID**: `advanced-splitter` | **Inputs**: 1 | **Outputs**: 2 | **Allowed Nodes**: All

**Expected gameplay**:
1. Input: sine wave. Targets: TWO outputs -- positive half on output A, negative half (rectified) on output B
2. Player builds positive rectifier path (Mix Max with 0) and negative rectifier path (Invert + Mix Max with 0, or similar)
3. "Signal Splitter" revealed

**Observe**:
- [ ] **First 2-output level** -- does the player check both target meters?
- [ ] **First "all nodes allowed" level** -- does the palette feel overwhelming or empowering?
- [ ] Does the player reuse mental models from Level 1 (Rectifier) and Level 8 (Full-Wave Rectifier)?

**Red flags**:
- Player only matches one output and doesn't notice the second target
- Player builds a correct solution for one output that interferes with the other

---

#### Level 14: Gain Stage

**ID**: `advanced-gain-stage` | **Inputs**: 1 | **Outputs**: 1 | **Allowed Nodes**: All

**Expected gameplay**:
1. Input: sine amp 100. Target: sine amp 50, offset +50 (range 0-100)
2. Player chains: Multiply(constant 50) -> Mix(Add, constant 50)
3. Halve the signal, then shift up
4. "Gain Stage" revealed

**Observe**:
- [ ] Does the player decompose the target into "half amplitude" + "shift up"?
- [ ] Could the player use their earned Attenuator and DC Offset nodes instead of building from fundamentals? (Multiple valid approaches)

---

#### Level 15: Quadrupler

**ID**: `advanced-quadrupler` | **Inputs**: 1 | **Outputs**: 1 | **Allowed Nodes**: Mix

**Expected gameplay**:
1. Input: sine amp 25. Target: sine amp 100 (4x amplification)
2. Player chains: Mix(Add) to double, then Mix(Add) again to double again
3. 25 -> 50 -> 100
4. "Quadrupler" revealed

**Observe**:
- [ ] Does the player figure out the doubling chain?
- [ ] Is the 4-node wiring chain (input -> add -> add -> output) cleanly routed?
- [ ] Does this feel like a satisfying capstone? Player has now built 15 tools

---

## Cross-Cutting Quality Checks

Run these checks during ANY level, not tied to a specific puzzle.

### Meter Readability

| Check | Pass Criteria |
|-------|---------------|
| Needle position readable at a glance | Needle clearly shows signal level without squinting |
| Level bar shows polarity | Positive/negative fill directions are distinguishable |
| Scrolling waveform smooth | No jitter, tearing, or frame drops |
| Target overlay distinct from actual | Target line is visually different (unfilled/dashed) from actual (filled) |
| Meter scale (-100 to +100) intuitive | Player never asks "what do these numbers mean?" |

### Wire Rendering

| Check | Pass Criteria |
|-------|---------------|
| Auto-routed paths are clean | No overlapping wires on same grid cells where avoidable |
| Wire signal coloring visible | Polarity gradient (warm/cool) readable along wire path |
| Glow effect on strong signals | Signals >75 show visible glow halo |
| Multiple wires from same port distinguishable | Two wires from one output visually separate |
| Wire hit-testing for context menu works | Right-clicking a wire opens the correct context menu |

### Node Interaction

| Check | Pass Criteria |
|-------|---------------|
| Placement ghost shows grid snap | Semi-transparent preview follows mouse, snaps to grid |
| Invalid placement shows red tint | Overlapping existing node shows red/invalid visual |
| Context menu appears on right-click | Node context menu has correct options (edit, delete, params) |
| Parameter popover opens on Enter/click | Mix mode, Delay value, Threshold value editable |
| Node hover state visible | Hovered node has visual distinction (brighter/outlined) |
| Node selection state visible | Selected node clearly highlighted |

### Navigation & Zoom

| Check | Pass Criteria |
|-------|---------------|
| Breadcrumbs show nesting depth | When inside a custom node, breadcrumb trail is visible |
| Lid-open animation plays on zoom-in | Entering a custom node shows vertical clamshell split |
| Lid-close animation plays on zoom-out | Exiting shows halves compressing back together |
| Escape key navigates up one level | Press Escape inside a node to zoom out |
| "Return to Puzzle" works from any depth | Can jump back to main puzzle from nested custom node |

### Keyboard Navigation

| Check | Pass Criteria |
|-------|---------------|
| Tab cycles through focusable elements | Nodes, ports, connection points, wires reachable via Tab |
| Focus ring visible | Dashed outline clearly marks the focused element |
| Enter activates context-appropriate action | Enter on node = open params, on port = start wiring |
| Arrow keys navigate within context | After Tab-focusing a node, arrows move between its ports |
| N or Space opens palette | Works from keyboard without mouse |
| Escape cancels current action | Wiring, placement, and menu dismiss on Escape |
| Ctrl+Z / Ctrl+Shift+Z for undo/redo | Works during all interaction states |

### Victory & Ceremony

| Check | Pass Criteria |
|-------|---------------|
| Streak counter visible during validation | Progress bar builds as outputs match tick-by-tick |
| Meter borders pulse during streak | Confirming outputs have glowing/pulsing border |
| Victory burst fires on completion | Radial gradient flash visible |
| Name reveal readable | Puzzle name fades in centered, legible |
| Zoom-out after ceremony feels complete | Gameboard compresses into a node smoothly |
| New node appears in palette | Earned puzzle node immediately available |

### Overlay System

| Check | Pass Criteria |
|-------|---------------|
| Palette modal opens and closes cleanly | No visual artifacts, search works, keyboard nav works |
| Context menu appears at correct position | Near the clicked element, not off-screen |
| Parameter popover positions correctly | Doesn't clip off screen edges, flip logic works |
| Escape dismisses overlays in correct priority | Menu first, then wiring, then zoom level |
| Canvas dims when overlay is active | Semi-transparent dark overlay visible behind modal |

### Theme & Visual

| Check | Pass Criteria |
|-------|---------------|
| Dark theme (Signal Bench) renders correctly | All tokens applied, no missing colors or white flashes |
| Light theme (Studio Monitor) renders correctly | Contrast sufficient, meters readable, wires visible |
| Theme switch works without reload | If implemented: tokens rebuild, canvas redraws |
| Reduced motion respected | Animations complete in single frame when prefers-reduced-motion is set |

### Save / Load / Persistence

| Check | Pass Criteria |
|-------|---------------|
| Progress saves automatically | Refreshing the page preserves completed levels |
| Undo/redo works within a level | Ctrl+Z undoes last action, Ctrl+Shift+Z redoes |
| Utility nodes persist across sessions | Created utility nodes survive page reload |
| Level select shows correct completion state | Completed levels marked, next level accessible |

---

## Utility Node Workflow Check

In addition to the puzzle progression, verify the utility node creation flow:

1. **Create**: Press N/Space or right-click -> palette -> "+ Create Custom Node"
2. **Blank gameboard opens** with zoom-in animation
3. **Build freely**: Place any nodes, wire them, set constants
4. **Save**: Press "Save" or use breadcrumb/Escape to exit
5. **Name prompt**: Player names their utility node
6. **Returns to parent**: Zoom-out animation, node appears in palette
7. **Reuse**: Place the utility node in a puzzle, verify it works
8. **Edit**: Right-click utility node -> Edit -> zoom into its internals
9. **Delete**: Right-click utility node -> Delete -> confirm removal

---

## Observation Template

```
Participant: ___  Date: ___  Observer: ___

LEVEL | TIME | OBSERVATION               | PLAYER REACTION    | SEVERITY
------|------|---------------------------|--------------------|--------
1     |      |                           |                    |
2     |      |                           |                    |
...   |      |                           |                    |

CROSS-CUTTING ISSUES:
1.
2.
3.

BEST MOMENTS (what felt great):
1.
2.
3.

WORST MOMENTS (what felt frustrating):
1.
2.
3.

Overall Flow Rating: [ ] Smooth  [ ] Minor bumps  [ ] Significant friction  [ ] Blocked
Signal Readability: [ ] Crystal clear  [ ] Good  [ ] Needs work  [ ] Confusing
Wire Routing Quality: [ ] Clean  [ ] Acceptable  [ ] Messy  [ ] Broken
Keyboard Navigation: [ ] Fully functional  [ ] Mostly works  [ ] Gaps  [ ] Not usable
```

---

## Severity Classification

| Severity | Definition | Example |
|----------|-----------|---------|
| **P0 - Blocker** | Cannot progress; game-breaking | Validation never triggers, crash on level load |
| **P1 - Critical** | Major UX failure; player likely to quit | Can't figure out how to place first node, meters unreadable |
| **P2 - Major** | Noticeable problem; degrades experience | Wire routing overlaps badly, ceremony animation glitches |
| **P3 - Minor** | Polish issue; doesn't block anything | Focus ring slightly misaligned, theme color slightly off |
| **P4 - Enhancement** | Not a bug; potential improvement | "It would be nice if..." suggestions |

---

## Post-Playtest Analysis Template

```markdown
## Playtest Report: [Date]

### Summary
- Levels completed: ___ / 15
- Critical issues found: ___
- Overall sentiment: [ ] Positive  [ ] Mixed  [ ] Negative

### Key Findings
1. [Finding with evidence]
2. [Finding with evidence]

### Issues by Severity

| # | Severity | Level/Area | Issue | Recommendation |
|---|----------|-----------|-------|----------------|
| 1 | P_      |           |       |                |

### What Worked Well
1.
2.

### What Needs Improvement
1.
2.

### Action Items
- [ ] [Action]
- [ ] [Action]
```

---

## Notes

- The GDD describes 45+ levels but only 15 are currently implemented. The 4-arc structure (Tutorial 5, Signal Shaping 4, Timing Challenge 3, Advanced Synthesis 3) covers all fundamental mechanics but the difficulty curve may feel truncated.
- The game has no tutorial text or hint system -- all learning is through experimentation and meter observation. Watch for moments where players get stuck with no recourse.
- The redesign removed ALL persistent UI chrome. If a player can't discover the palette (N/Space/right-click), they cannot play. Discoverability of this first action is the single highest-risk UX question.
- Connection points on puzzle gameboards are per-puzzle configured (which are active, which are input vs output). Verify that inactive connection points are truly hidden and don't cause confusion.

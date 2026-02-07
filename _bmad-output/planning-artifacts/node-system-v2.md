# Node System v2 - Design Specification

## Overview

This document defines the redesigned node system for the signal puzzle game. The new system prioritizes:

1. **Visual clarity** - Node shapes communicate function at a glance
2. **Intuitive operations** - Each node has one clear purpose
3. **Extensibility** - Framework makes adding nodes trivial
4. **Consistency** - All nodes follow the same patterns

---

## Signal System (Unchanged)

- **Range**: [-100, +100] - clamp after EVERY evaluation
- **Polarity**: positive (amber), negative (teal), zero (neutral)
- **Unconnected inputs**: default to 0
- **Wire propagation**: 1 WTS (16 subdivisions)

---

## Node Catalog

### 1. Constant

**Purpose**: Emit a fixed value set by the player.

| Inputs | Outputs | Parameters |
|--------|---------|------------|
| 0 | 1 | `value: number` (-100 to +100) |

**Evaluation**:
```
Output = value
```

**Visual**: Small node, no left ports, one right port.

**Use cases**: DC offset, test signals, fixed thresholds.

---

### 2. Inverter

**Purpose**: Flip signal polarity.

| Inputs | Outputs | Parameters |
|--------|---------|------------|
| 1 | 1 | None |

**Evaluation**:
```
Output = clamp(-A)
```

**Visual**: Compact 1→1 node.

**Use cases**: Phase inversion, sign flip.

---

### 3. Scaler

**Purpose**: Adjust amplitude by a percentage.

| Inputs | Outputs | Parameters |
|--------|---------|------------|
| 2 (A, B) | 1 | None |

**Evaluation**:
```
Output = clamp(A * (1 + B / 100))
```

| B Value | Effect |
|---------|--------|
| +100 | Double amplitude (A × 2) |
| +50 | 150% amplitude (A × 1.5) |
| 0 | No change (A × 1) |
| -50 | 50% amplitude (A × 0.5) |
| -100 | Muted (A × 0) |

**Visual**: 2→1 node, compact.

**Use cases**: Volume control, amplitude modulation, ducking.

---

### 4. Merger

**Purpose**: Combine two signals additively.

| Inputs | Outputs | Parameters |
|--------|---------|------------|
| 2 (A, B) | 1 | None |

**Evaluation**:
```
Output = clamp(A + B)
```

**Visual**: 2→1 node, compact.

**Use cases**: Mixing signals, summing branches, recombining splits.

---

### 5. Splitter

**Purpose**: Divide one signal into two half-amplitude copies.

| Inputs | Outputs | Parameters |
|--------|---------|------------|
| 1 | 2 | None |

**Evaluation**:
```
Output1 = clamp(A / 2)
Output2 = clamp(A / 2)
```

**Conservation**: Splitter → Merger restores original value (before clamping).

**Visual**: 1→2 node, mirrors Merger shape.

---

### 6. Shaper

**Purpose**: Dual-mode signal shaping controlled by input B.

| Inputs | Outputs | Parameters |
|--------|---------|------------|
| 2 (A, B) | 1 | None |

**Mode Selection** (based on B):
- **B ≥ 0**: Smoother mode
- **B < 0**: Polarizer mode

#### Smoother Mode (B ≥ 0)

Averages recent samples for smoothing/filtering effect.

**State**: Rolling buffer of 100 samples.

**Evaluation**:
```
windowSize = max(1, round(B))  // B=0 → 1 sample, B=100 → 100 samples
buffer.push(A)
Output = clamp(average(buffer.last(windowSize)))
```

| B Value | Window | Effect |
|---------|--------|--------|
| 0-1 | 1 | No smoothing (pass-through) |
| 10 | 10 | Light smoothing |
| 50 | 50 | Medium smoothing |
| 100 | 100 | Heavy smoothing (slow response) |

#### Polarizer Mode (B < 0)

Applies power-curve shaping to push values toward extremes or center.

**Evaluation**:
```
s = |B| / 100                           // 0 to 1
exponent = 1 - s                        // 1 (linear) to 0 (extreme)
normalized = |A| / 100                  // 0 to 1
Output = clamp(sign(A) * 100 * pow(normalized, exponent))
```

| B Value | Exponent | Effect |
|---------|----------|--------|
| -1 | 0.99 | Nearly linear |
| -50 | 0.5 | Square root curve (expand quiet) |
| -100 | 0 | Extreme polarization (all ±100) |

**Visual**: 2→1 node, slightly larger to indicate complexity.

**Use cases**: Low-pass filtering, signal smoothing, compression, expansion.

---

### 7. Switch

**Purpose**: Route two inputs to two outputs, swappable via control signal.

| Inputs | Outputs | Parameters |
|--------|---------|------------|
| 3 (A, B, Control) | 2 | None |

**Evaluation**:
```
if Control >= 0:
    Output1 = A
    Output2 = B
else:
    Output1 = B
    Output2 = A
```

**Visual**: Taller 3→2 node, distinct shape.

**Use cases**: Signal routing, A/B switching, conditional paths.

---

### 8. Delay

**Purpose**: Delay signal by a fraction of one WTS.

| Inputs | Outputs | Parameters |
|--------|---------|------------|
| 1 | 1 | `subdivisions: number` (0-16) |

**State**: Circular buffer sized to subdivision count.

**Evaluation**:
```
buffer.write(A)
Output = buffer.read(subdivisions_ago)
```

**Visual**: 1→1 node with parameter indicator.

**Use cases**: Phase alignment, echo effects, timing adjustment.

---

### 9. Custom (Puzzle/Utility Node)

**Purpose**: Encapsulated gameboard that players can create and edit.

| Inputs | Outputs | Parameters |
|--------|---------|------------|
| 1-3 | 1-3 | Internal board |

**Evaluation**: Baked closure from internal graph.

**Visual**: Larger node, width based on port count, distinct "container" appearance.

**Use cases**: Abstraction, reusable components, level solutions.

---

## Visual Design Language

### Node Shapes

Nodes communicate their function through shape and port arrangement:

| Pattern | Meaning | Nodes |
|---------|---------|-------|
| No left ports | Source/generator | Constant |
| 1→1 compact | Simple transform | Inverter, Delay |
| 2→1 compact | Combine/process | Scaler, Merger, Shaper |
| 1→2 compact | Split/distribute | Splitter |
| 3→2 tall | Routing/control | Switch |
| Large rectangle | Container | Custom |

### Port Positions

- **Inputs**: Left side of node
- **Outputs**: Right side of node
- **Vertical centering**: Ports distributed evenly along node height
- **Consistent spacing**: Same port-to-port distance across all nodes

### Size Guidelines (Grid Cells)

| Node Type | Width | Height |
|-----------|-------|--------|
| Constant | 2 | 2 |
| Inverter | 2 | 2 |
| Scaler | 3 | 2 |
| Merger | 3 | 2 |
| Splitter | 3 | 2 |
| Shaper | 3 | 2 |
| Switch | 3 | 3 |
| Delay | 2 | 2 |
| Custom | 5+ | 3+ |

---

## Node Categories

For palette organization:

| Category | Nodes | Color Hint |
|----------|-------|------------|
| **Sources** | Constant | Blue |
| **Math** | Scaler, Merger, Inverter | Green |
| **Routing** | Splitter, Switch | Orange |
| **Shaping** | Shaper | Purple |
| **Timing** | Delay | Yellow |
| **Custom** | Puzzle, Utility | Gray |

---

## State Requirements

### Stateless Nodes
Evaluation depends only on current inputs:
- Constant, Inverter, Scaler, Merger, Splitter, Switch

### Stateful Nodes
Evaluation depends on history:
- **Shaper** (Smoother mode): 100-sample rolling buffer
- **Delay**: Circular buffer sized by subdivisions parameter

### State Reset
Node state resets when:
- Graph structure changes (wire add/remove, node add/remove)
- Simulation restarts
- Parameter changes

---

## Parameter Constraints

| Node | Parameter | Type | Range | Default |
|------|-----------|------|-------|---------|
| Constant | value | number | -100 to +100 | 0 |
| Delay | subdivisions | number | 0 to 16 | 0 |

---

## Removed Nodes

The following nodes from v1 are removed:

| Old Node | Replacement |
|----------|-------------|
| Multiply | Use Scaler (B as percentage) |
| Mix | Use Merger (Add mode only) |
| Invert | Renamed to Inverter |
| Threshold | Use Shaper (Polarizer at B=-100) |

---

## Migration Path

1. Existing puzzles using old nodes will need level redesign
2. Player-created utility nodes using old nodes will be invalidated
3. Clean break - no backwards compatibility layer

---

## Open Questions

1. Should Shaper have a parameter to set buffer size (instead of fixed 100)? No 100 is to accomidate the maximum window size from input B
2. Should Splitter have a parameter for split ratio (instead of fixed 50/50)? No
3. Should there be a "Pass-through" node for wire organization? No
4. Should Custom nodes show a preview of their internal waveform? We should save a preview for the zoom-in animation but let's not worry about that yet.

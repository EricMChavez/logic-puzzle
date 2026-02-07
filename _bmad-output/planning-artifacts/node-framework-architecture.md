# Node Framework Architecture

## Goals

1. **Single source of truth** - Define a node once, everything else derives from it
2. **Type-safe** - TypeScript catches errors at compile time
3. **Testable** - Pure evaluation functions, isolated from rendering
4. **Extensible** - Adding a node = adding one file + one registry line

---

## Core Concept: Node Definition

Every node is defined by a single `NodeDefinition` object:

```typescript
interface NodeDefinition<TParams extends Record<string, ParamValue> = {}> {
  // Identity
  type: string;                          // Unique identifier: 'constant', 'scaler', etc.
  category: NodeCategory;                // For palette grouping

  // Interface
  inputs: PortDefinition[];              // Input port metadata
  outputs: PortDefinition[];             // Output port metadata

  // Parameters (optional)
  params?: ParamDefinition<TParams>[];   // Player-adjustable values

  // Evaluation
  evaluate: NodeEvaluator<TParams>;      // Pure function: inputs → outputs

  // State (optional, for stateful nodes)
  createState?: () => NodeRuntimeState;  // Factory for runtime state

  // Rendering
  size: GridSize;                        // Width x height in grid cells
  render?: CustomNodeRenderer;           // Optional custom draw function
}
```

---

## Type Definitions

```typescript
// Core types
type ParamValue = number | string | boolean;
type Signal = number;  // Always in [-100, +100]

type NodeCategory =
  | 'source'    // Constant
  | 'math'      // Scaler, Merger, Inverter
  | 'routing'   // Splitter, Switch
  | 'shaping'   // Shaper
  | 'timing'    // Delay
  | 'custom';   // Puzzle, Utility

interface GridSize {
  width: number;   // Grid cells
  height: number;  // Grid cells
}

interface PortDefinition {
  name: string;           // Display name: 'A', 'B', 'Control', 'Out'
  description?: string;   // Tooltip text
}

interface ParamDefinition<TParams> {
  key: keyof TParams;
  type: 'number' | 'string' | 'boolean';
  default: ParamValue;
  label: string;
  // For numbers:
  min?: number;
  max?: number;
  step?: number;
  // For strings:
  options?: string[];  // Enum-like selection
}

// Evaluation context
interface EvalContext<TParams> {
  inputs: readonly Signal[];           // Current input values
  params: Readonly<TParams>;           // Current parameter values
  state?: NodeRuntimeState;            // Mutable state (if stateful)
  tickIndex: number;                   // Current simulation tick
}

// Evaluator signature
type NodeEvaluator<TParams> = (ctx: EvalContext<TParams>) => Signal[];

// Runtime state for stateful nodes
interface NodeRuntimeState {
  [key: string]: unknown;
}
```

---

## Example Node Definitions

### Constant (Simplest - Source Node)

```typescript
// src/engine/nodes/definitions/constant.ts

import { NodeDefinition } from '../framework';
import { clamp } from '@/shared/math';

interface ConstantParams {
  value: number;
}

export const constantNode: NodeDefinition<ConstantParams> = {
  type: 'constant',
  category: 'source',

  inputs: [],  // No inputs
  outputs: [{ name: 'Out' }],

  params: [{
    key: 'value',
    type: 'number',
    default: 0,
    label: 'Value',
    min: -100,
    max: 100,
    step: 1,
  }],

  evaluate: ({ params }) => [clamp(params.value)],

  size: { width: 2, height: 2 },
};
```

### Inverter (Simple Transform)

```typescript
// src/engine/nodes/definitions/inverter.ts

export const inverterNode: NodeDefinition = {
  type: 'inverter',
  category: 'math',

  inputs: [{ name: 'A' }],
  outputs: [{ name: 'Out' }],

  evaluate: ({ inputs }) => [clamp(-inputs[0])],

  size: { width: 2, height: 2 },
};
```

### Scaler (Two Inputs)

```typescript
// src/engine/nodes/definitions/scaler.ts

export const scalerNode: NodeDefinition = {
  type: 'scaler',
  category: 'math',

  inputs: [
    { name: 'A', description: 'Signal to scale' },
    { name: 'B', description: 'Scale percentage (-100 to +100)' },
  ],
  outputs: [{ name: 'Out' }],

  evaluate: ({ inputs }) => {
    const [a, b] = inputs;
    const scaleFactor = 1 + (b / 100);
    return [clamp(a * scaleFactor)];
  },

  size: { width: 3, height: 2 },
};
```

### Merger

```typescript
// src/engine/nodes/definitions/merger.ts

export const mergerNode: NodeDefinition = {
  type: 'merger',
  category: 'math',

  inputs: [
    { name: 'A' },
    { name: 'B' },
  ],
  outputs: [{ name: 'Out' }],

  evaluate: ({ inputs }) => [clamp(inputs[0] + inputs[1])],

  size: { width: 3, height: 2 },
};
```

### Splitter (One to Many)

```typescript
// src/engine/nodes/definitions/splitter.ts

export const splitterNode: NodeDefinition = {
  type: 'splitter',
  category: 'routing',

  inputs: [{ name: 'A' }],
  outputs: [
    { name: 'Out1' },
    { name: 'Out2' },
  ],

  evaluate: ({ inputs }) => {
    const half = clamp(inputs[0] / 2);
    return [half, half];
  },

  size: { width: 3, height: 2 },
};
```

### Switch (Routing)

```typescript
// src/engine/nodes/definitions/switch.ts

export const switchNode: NodeDefinition = {
  type: 'switch',
  category: 'routing',

  inputs: [
    { name: 'A' },
    { name: 'B' },
    { name: 'Ctrl', description: 'Control: ≥0 = straight, <0 = crossed' },
  ],
  outputs: [
    { name: 'Out1' },
    { name: 'Out2' },
  ],

  evaluate: ({ inputs }) => {
    const [a, b, ctrl] = inputs;
    return ctrl >= 0 ? [a, b] : [b, a];
  },

  size: { width: 3, height: 3 },
};
```

### Shaper (Stateful, Dual-Mode)

```typescript
// src/engine/nodes/definitions/shaper.ts

interface ShaperState extends NodeRuntimeState {
  buffer: number[];
  writeIndex: number;
}

const BUFFER_SIZE = 100;

export const shaperNode: NodeDefinition = {
  type: 'shaper',
  category: 'shaping',

  inputs: [
    { name: 'A', description: 'Signal input' },
    { name: 'B', description: '≥0: Smoother (window size), <0: Polarizer (intensity)' },
  ],
  outputs: [{ name: 'Out' }],

  createState: (): ShaperState => ({
    buffer: new Array(BUFFER_SIZE).fill(0),
    writeIndex: 0,
  }),

  evaluate: ({ inputs, state }) => {
    const [a, b] = inputs;
    const s = state as ShaperState;

    if (b >= 0) {
      // Smoother mode
      s.buffer[s.writeIndex] = a;
      s.writeIndex = (s.writeIndex + 1) % BUFFER_SIZE;

      const windowSize = Math.max(1, Math.round(b));
      let sum = 0;
      for (let i = 0; i < windowSize; i++) {
        const idx = (s.writeIndex - 1 - i + BUFFER_SIZE) % BUFFER_SIZE;
        sum += s.buffer[idx];
      }
      return [clamp(sum / windowSize)];
    } else {
      // Polarizer mode
      const intensity = Math.abs(b) / 100;  // 0 to 1
      const exponent = 1 - intensity;        // 1 to 0
      const normalized = Math.abs(a) / 100;  // 0 to 1
      const shaped = Math.pow(normalized, exponent) * 100;
      return [clamp(Math.sign(a) * shaped)];
    }
  },

  size: { width: 3, height: 2 },
};
```

### Delay (Stateful with Parameter)

```typescript
// src/engine/nodes/definitions/delay.ts

interface DelayParams {
  subdivisions: number;
}

interface DelayState extends NodeRuntimeState {
  buffer: number[];
  writeIndex: number;
}

export const delayNode: NodeDefinition<DelayParams> = {
  type: 'delay',
  category: 'timing',

  inputs: [{ name: 'A' }],
  outputs: [{ name: 'Out' }],

  params: [{
    key: 'subdivisions',
    type: 'number',
    default: 0,
    label: 'Delay',
    min: 0,
    max: 16,
    step: 1,
  }],

  createState: (): DelayState => ({
    buffer: new Array(17).fill(0),  // Max 16 subdivisions + 1
    writeIndex: 0,
  }),

  evaluate: ({ inputs, params, state }) => {
    const s = state as DelayState;
    const delay = params.subdivisions;

    // Write current input
    s.buffer[s.writeIndex] = inputs[0];

    // Read delayed value
    const readIndex = (s.writeIndex - delay + 17) % 17;
    const output = s.buffer[readIndex];

    // Advance write head
    s.writeIndex = (s.writeIndex + 1) % 17;

    return [output];
  },

  size: { width: 2, height: 2 },
};
```

---

## Node Registry

Central registry auto-generates everything else:

```typescript
// src/engine/nodes/registry.ts

import { constantNode } from './definitions/constant';
import { inverterNode } from './definitions/inverter';
import { scalerNode } from './definitions/scaler';
import { mergerNode } from './definitions/merger';
import { splitterNode } from './definitions/splitter';
import { switchNode } from './definitions/switch';
import { shaperNode } from './definitions/shaper';
import { delayNode } from './definitions/delay';

// Single source of truth
const NODE_DEFINITIONS = [
  constantNode,
  inverterNode,
  scalerNode,
  mergerNode,
  splitterNode,
  switchNode,
  shaperNode,
  delayNode,
] as const;

// Derived lookups (computed once at startup)
export const nodeRegistry = {
  // By type
  byType: new Map(NODE_DEFINITIONS.map(def => [def.type, def])),

  // By category (for palette)
  byCategory: NODE_DEFINITIONS.reduce((acc, def) => {
    (acc[def.category] ??= []).push(def);
    return acc;
  }, {} as Record<NodeCategory, NodeDefinition[]>),

  // All types
  allTypes: NODE_DEFINITIONS.map(def => def.type),

  // All definitions
  all: NODE_DEFINITIONS,
};

// Type-safe lookup
export function getNodeDefinition(type: string): NodeDefinition | undefined {
  return nodeRegistry.byType.get(type);
}

// Type guard
export function isFundamentalNode(type: string): boolean {
  return nodeRegistry.byType.has(type);
}
```

---

## Framework Integration Points

### 1. Tick Scheduler (Evaluation)

```typescript
// In tick-scheduler.ts

import { getNodeDefinition } from '@/engine/nodes/registry';

function evaluateNode(node: NodeState, runtime: NodeRuntimeState): Signal[] {
  // Custom nodes use baked evaluation
  if (node.type.startsWith('puzzle:') || node.type.startsWith('utility:')) {
    return runtime.bakedEvaluate?.(runtime.inputs) ?? [];
  }

  // Fundamental nodes use registry
  const def = getNodeDefinition(node.type);
  if (!def) {
    console.warn(`Unknown node type: ${node.type}`);
    return [];
  }

  return def.evaluate({
    inputs: runtime.inputs,
    params: node.params as any,
    state: runtime.nodeState,
    tickIndex: currentTick,
  });
}
```

### 2. Node Instantiation

```typescript
// In gameboard-slice.ts or GameboardCanvas.tsx

import { getNodeDefinition } from '@/engine/nodes/registry';

function createNode(type: string, position: GridPoint): NodeState | null {
  const def = getNodeDefinition(type);
  if (!def) return null;

  // Build default params
  const params: Record<string, ParamValue> = {};
  for (const p of def.params ?? []) {
    params[p.key as string] = p.default;
  }

  return {
    id: generateId(),
    type: def.type,
    position,
    params,
    inputCount: def.inputs.length,
    outputCount: def.outputs.length,
  };
}
```

### 3. Runtime State Initialization

```typescript
// In tick-scheduler.ts

import { getNodeDefinition } from '@/engine/nodes/registry';

function initializeNodeRuntime(node: NodeState): NodeRuntimeState {
  const def = getNodeDefinition(node.type);

  return {
    inputs: new Array(node.inputCount).fill(0),
    outputs: new Array(node.outputCount).fill(0),
    nodeState: def?.createState?.(),
  };
}
```

### 4. Palette Generation

```typescript
// In palette modal

import { nodeRegistry } from '@/engine/nodes/registry';

function buildPaletteItems(): PaletteSection[] {
  return Object.entries(nodeRegistry.byCategory).map(([category, defs]) => ({
    title: categoryLabels[category],
    items: defs.map(def => ({
      type: def.type,
      label: def.type.charAt(0).toUpperCase() + def.type.slice(1),
      inputCount: def.inputs.length,
      outputCount: def.outputs.length,
    })),
  }));
}
```

### 5. Parameter Editor

```typescript
// In ParameterPopover

import { getNodeDefinition } from '@/engine/nodes/registry';

function ParameterEditor({ node }: { node: NodeState }) {
  const def = getNodeDefinition(node.type);
  if (!def?.params?.length) return null;

  return (
    <div>
      {def.params.map(param => (
        <ParamInput
          key={param.key}
          label={param.label}
          type={param.type}
          value={node.params[param.key]}
          min={param.min}
          max={param.max}
          step={param.step}
          options={param.options}
          onChange={value => updateNodeParam(node.id, param.key, value)}
        />
      ))}
    </div>
  );
}
```

### 6. Node Rendering

```typescript
// In render-nodes.ts

import { getNodeDefinition } from '@/engine/nodes/registry';

function drawNode(ctx: CanvasRenderingContext2D, node: NodeState, ...) {
  const def = getNodeDefinition(node.type);
  if (!def) return;

  const { width, height } = def.size;
  const pixelWidth = width * cellSize;
  const pixelHeight = height * cellSize;

  // Custom renderer if provided
  if (def.render) {
    def.render(ctx, node, tokens, rect);
    return;
  }

  // Default rendering
  drawNodeBody(ctx, rect, tokens);
  drawPorts(ctx, def.inputs, 'input', rect, tokens);
  drawPorts(ctx, def.outputs, 'output', rect, tokens);
  drawNodeLabel(ctx, def.type, rect, tokens);
}
```

---

## Adding a New Node

To add a new node, create ONE file:

```typescript
// src/engine/nodes/definitions/my-new-node.ts

import { NodeDefinition } from '../framework';
import { clamp } from '@/shared/math';

export const myNewNode: NodeDefinition = {
  type: 'my-new-node',
  category: 'math',
  inputs: [{ name: 'A' }, { name: 'B' }],
  outputs: [{ name: 'Out' }],
  evaluate: ({ inputs }) => [clamp(/* your logic */)],
  size: { width: 3, height: 2 },
};
```

Then add ONE line to the registry:

```typescript
// src/engine/nodes/registry.ts

import { myNewNode } from './definitions/my-new-node';

const NODE_DEFINITIONS = [
  // ... existing nodes
  myNewNode,  // <-- Add this line
] as const;
```

**That's it.** The framework auto-generates:
- Palette entry
- Instantiation logic
- Evaluation routing
- Parameter UI
- Rendering
- Type checking

---

## File Structure

```
src/engine/nodes/
├── framework.ts           # Core types and interfaces
├── registry.ts            # Node registration and lookups
├── definitions/
│   ├── index.ts           # Barrel export
│   ├── constant.ts
│   ├── inverter.ts
│   ├── scaler.ts
│   ├── merger.ts
│   ├── splitter.ts
│   ├── switch.ts
│   ├── shaper.ts
│   └── delay.ts
└── __tests__/
    ├── constant.test.ts
    ├── scaler.test.ts
    └── ...
```

---

## Testing Pattern

Each node gets a focused test file:

```typescript
// src/engine/nodes/__tests__/scaler.test.ts

import { scalerNode } from '../definitions/scaler';

describe('Scaler node', () => {
  const evaluate = (a: number, b: number) =>
    scalerNode.evaluate({ inputs: [a, b], params: {}, state: undefined, tickIndex: 0 });

  it('passes through when B=0', () => {
    expect(evaluate(50, 0)).toEqual([50]);
  });

  it('doubles when B=100', () => {
    expect(evaluate(50, 100)).toEqual([100]);  // 50 * 2 = 100
  });

  it('halves when B=-50', () => {
    expect(evaluate(100, -50)).toEqual([50]);  // 100 * 0.5 = 50
  });

  it('mutes when B=-100', () => {
    expect(evaluate(100, -100)).toEqual([0]);  // 100 * 0 = 0
  });

  it('clamps overflow', () => {
    expect(evaluate(100, 100)).toEqual([100]); // 100 * 2 = 200 → clamped to 100
  });
});
```

---

## Benefits

| Before | After |
|--------|-------|
| 4-5 files to add a node | 1 file + 1 line |
| Switch statement routing | Registry lookup |
| Scattered param handling | Declarative param definitions |
| Manual port counting | Derived from definition |
| Ad-hoc testing | Standardized test pattern |
| Type mismatches | Full type safety |

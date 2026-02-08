import type { CustomPuzzle } from '../store/slices/custom-puzzle-slice.ts';

/**
 * Convert a title string to a kebab-case level ID.
 * E.g. "My Amplifier" → "my-amplifier"
 */
function titleToId(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Convert a title string to an UPPER_SNAKE_CASE constant name.
 * E.g. "My Amplifier" → "MY_AMPLIFIER"
 */
function titleToConstName(title: string): string {
  return title
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Format a number for source output — integers stay integers, floats get rounded.
 */
function formatNum(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return String(Math.round(n * 100) / 100);
}

/**
 * Serialize a WaveformDef-like object to TypeScript source, indented.
 */
function formatWaveformDef(
  wf: { shape: string; amplitude: number; period: number; phase: number; offset: number; samples?: number[] },
  indent: string,
): string {
  const lines = [
    `${indent}{`,
    `${indent}  shape: '${wf.shape}',`,
    `${indent}  amplitude: ${formatNum(wf.amplitude)},`,
    `${indent}  period: ${formatNum(wf.period)},`,
    `${indent}  phase: ${formatNum(wf.phase)},`,
    `${indent}  offset: ${formatNum(wf.offset)},`,
  ];
  if (wf.samples) {
    const samplesStr = wf.samples.map(formatNum).join(', ');
    lines.push(`${indent}  samples: [${samplesStr}],`);
  }
  lines.push(`${indent}}`);
  return lines.join('\n');
}

/**
 * Generate a ConnectionPointConfig source block for the meter layout.
 * Always emitted so that built-in levels preserve the exact meter positions.
 */
function formatConnectionPoints(slots: CustomPuzzle['slots'], indent: string): string {
  // Count inputs/outputs on each side for cpIndex assignment
  let leftInputIdx = 0;
  let leftOutputIdx = 0;
  for (let i = 0; i < 3; i++) {
    if (slots[i].direction === 'input') leftInputIdx++;
    else if (slots[i].direction === 'output') leftOutputIdx++;
  }

  const formatSlots = (slotRange: Array<{ direction: 'input' | 'output' | 'off' }>, side: string) => {
    const lines: string[] = [];
    let inputIdx = side === 'left' ? 0 : leftInputIdx;
    let outputIdx = side === 'left' ? 0 : leftOutputIdx;

    for (const slot of slotRange) {
      if (slot.direction === 'off') {
        lines.push(`${indent}    { active: false, direction: 'input' },`);
      } else {
        const cpIdx = slot.direction === 'input' ? inputIdx++ : outputIdx++;
        lines.push(`${indent}    { active: true, direction: '${slot.direction}', cpIndex: ${cpIdx} },`);
      }
    }
    return lines.join('\n');
  };

  return [
    `${indent}connectionPoints: {`,
    `${indent}  left: [`,
    formatSlots(slots.slice(0, 3), 'left'),
    `${indent}  ],`,
    `${indent}  right: [`,
    formatSlots(slots.slice(3, 6), 'right'),
    `${indent}  ],`,
    `${indent}},`,
  ].join('\n');
}

/**
 * Export a CustomPuzzle as TypeScript source code for a PuzzleDefinition.
 * The output is a complete, paste-ready file.
 */
export function exportCustomPuzzleAsSource(puzzle: CustomPuzzle): string {
  const id = titleToId(puzzle.title);
  const constName = titleToConstName(puzzle.title);

  // Count active inputs and outputs
  let activeInputs = 0;
  let activeOutputs = 0;
  for (const slot of puzzle.slots) {
    if (slot.direction === 'input') activeInputs++;
    else if (slot.direction === 'output') activeOutputs++;
  }

  // Build input waveforms
  const inputs: string[] = [];
  for (const slot of puzzle.slots) {
    if (slot.direction === 'input' && slot.waveform) {
      inputs.push(formatWaveformDef(slot.waveform, '        '));
    }
  }

  // Build expected outputs from target samples
  const expectedOutputs: string[] = [];
  for (let i = 0; i < puzzle.slots.length; i++) {
    const slot = puzzle.slots[i];
    if (slot.direction === 'output') {
      const samples = puzzle.targetSamples.get(i);
      if (samples) {
        expectedOutputs.push(formatWaveformDef(
          { shape: 'samples', amplitude: 100, period: samples.length, phase: 0, offset: 0, samples },
          '        ',
        ));
      }
    }
  }

  // Build the source
  const lines: string[] = [
    `import type { PuzzleDefinition } from '../types.ts';`,
    ``,
    `export const ${constName}: PuzzleDefinition = {`,
    `  id: '${id}',`,
    `  title: '${puzzle.title.replace(/'/g, "\\'")}',`,
    `  description: '${puzzle.description.replace(/'/g, "\\'")}',`,
    `  activeInputs: ${activeInputs},`,
    `  activeOutputs: ${activeOutputs},`,
    `  allowedNodes: null,`,
    `  testCases: [`,
    `    {`,
    `      name: '${puzzle.title.replace(/'/g, "\\'")}',`,
    `      inputs: [`,
    inputs.join(',\n'),
    `      ],`,
    `      expectedOutputs: [`,
    expectedOutputs.join(',\n'),
    `      ],`,
    `    },`,
    `  ],`,
  ];

  // Always include connectionPoints to preserve meter layout
  lines.push(formatConnectionPoints(puzzle.slots, '  '));

  lines.push(`};`);
  lines.push(``);

  return lines.join('\n');
}

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
 * Format a number for source output — integers stay integer, floats get rounded.
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
 * Generate a SlotConfig source block for the meter layout.
 * Always emitted so that built-in levels preserve the exact meter positions.
 */
function formatSlotConfig(slots: CustomPuzzle['slots'], indent: string): string {
  const lines: string[] = [];
  lines.push(`${indent}slotConfig: [`);
  for (let i = 0; i < 6; i++) {
    const slot = slots[i];
    if (slot.direction === 'off') {
      const defaultDir = i < 3 ? 'input' : 'output';
      lines.push(`${indent}  { active: false, direction: '${defaultDir}' },`);
    } else {
      lines.push(`${indent}  { active: true, direction: '${slot.direction}' },`);
    }
  }
  lines.push(`${indent}],`);
  return lines.join('\n');
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

  // Format allowedChips value
  let allowedChipsStr: string;
  if (puzzle.allowedChips === null) {
    allowedChipsStr = 'null';
  } else {
    const entries = Object.entries(puzzle.allowedChips)
      .map(([type, count]) => `${type}: ${count}`)
      .join(', ');
    allowedChipsStr = `{ ${entries} }`;
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
    `  allowedChips: ${allowedChipsStr},`,
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

  // Always include slotConfig to preserve meter layout
  lines.push(formatSlotConfig(puzzle.slots, '  '));

  // Include initialChips if any are defined
  if (puzzle.initialChips && puzzle.initialChips.length > 0) {
    lines.push(`  initialChips: [`);
    for (const chip of puzzle.initialChips) {
      const paramsStr = Object.keys(chip.params).length > 0
        ? JSON.stringify(chip.params)
        : '{}';
      const rotationStr = chip.rotation ? `, rotation: ${chip.rotation}` : '';
      lines.push(`    { id: '${chip.id}', type: '${chip.type}', position: { col: ${chip.position.col}, row: ${chip.position.row} }, params: ${paramsStr}, socketCount: ${chip.socketCount}, plugCount: ${chip.plugCount}${rotationStr} },`);
    }
    lines.push(`  ],`);
  }

  // Include initialPaths if any are defined
  if (puzzle.initialPaths && puzzle.initialPaths.length > 0) {
    lines.push(`  initialPaths: [`);
    for (const path of puzzle.initialPaths) {
      lines.push(`    { source: { chipId: '${path.source.chipId}', portIndex: ${path.source.portIndex} }, target: { chipId: '${path.target.chipId}', portIndex: ${path.target.portIndex} } },`);
    }
    lines.push(`  ],`);
  }

  // Include tutorialTitle and tutorialMessage if set
  if (puzzle.tutorialTitle) {
    lines.push(`  tutorialTitle: '${puzzle.tutorialTitle.replace(/'/g, "\\'")}',`);
  }
  if (puzzle.tutorialMessage) {
    lines.push(`  tutorialMessage: '${puzzle.tutorialMessage.replace(/'/g, "\\'")}',`);
  }

  lines.push(`};`);
  lines.push(``);

  return lines.join('\n');
}

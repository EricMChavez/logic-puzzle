import { defineNode } from '../framework';
import type { NodeRuntimeState } from '../framework';

/** Maximum delay in WTS units (player-facing) */
const MAX_WTS = 8;

/** Subdivisions per WTS */
const SUBDIVISIONS_PER_WTS = 16;

/** Maximum delay in subdivisions (internal) */
const MAX_DELAY_SUBDIVISIONS = MAX_WTS * SUBDIVISIONS_PER_WTS; // 128

export interface DelayParams {
  wts: number;
  [key: string]: number | string | boolean;
}

export interface DelayState extends NodeRuntimeState {
  buffer: number[];
  writeIndex: number;
}

export function createDelayState(): DelayState {
  return {
    // Buffer size = max delay subdivisions + 1 to handle the read/write offset
    buffer: new Array(MAX_DELAY_SUBDIVISIONS + 1).fill(0),
    writeIndex: 0,
  };
}

export const delayNode = defineNode<DelayParams>({
  type: 'delay',
  category: 'timing',

  inputs: [{ name: 'A' }],
  outputs: [{ name: 'Out' }],

  params: [
    {
      key: 'wts',
      type: 'number',
      default: 1,
      label: 'Delay (WTS)',
      min: 1,
      max: MAX_WTS,
      step: 1,
    },
  ],

  createState: createDelayState,

  evaluate: ({ inputs, params, state }) => {
    const s = state as DelayState;
    const bufferSize = MAX_DELAY_SUBDIVISIONS + 1;

    // Convert WTS to subdivisions and clamp to valid range
    const wts = Math.max(1, Math.min(MAX_WTS, Math.round(params.wts)));
    const delay = wts * SUBDIVISIONS_PER_WTS;

    // Write current input to buffer
    s.buffer[s.writeIndex] = inputs[0];

    // Read delayed value
    const readIndex = (s.writeIndex - delay + bufferSize) % bufferSize;
    const output = s.buffer[readIndex];

    // Advance write head
    s.writeIndex = (s.writeIndex + 1) % bufferSize;

    return [output];
  },

  size: { width: 2, height: 2 },
});

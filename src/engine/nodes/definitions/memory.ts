import { defineChip } from '../framework';
import type { ChipRuntimeState } from '../framework';

export interface MemoryState extends ChipRuntimeState {
  previousValue: number;
}

export function createMemoryState(): MemoryState {
  return { previousValue: 0 };
}

/**
 * Memory chip: 1-cycle delay.
 * Outputs the previous cycle's input value.
 * On cycle 0, outputs 0 (initial state).
 */
export const memoryChip = defineChip({
  type: 'memory',
  category: 'timing',
  description: 'Outputs the previous cycle\'s input value',

  sockets: [{ name: 'A', gridPosition: 0 }],
  plugs: [{ name: 'Out', gridPosition: 0 }],

  createState: createMemoryState,

  evaluate: ({ inputs, state }) => {
    const s = state as MemoryState;
    const output = s.previousValue;
    s.previousValue = inputs[0];
    return [output];
  },

  size: { width: 3, height: 1 },
});

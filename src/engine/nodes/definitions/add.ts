import { defineChip } from '../framework';
import { clamp } from '../../../shared/math';

/** Adds two input signals together */
export const addChip = defineChip({
  type: 'add',
  category: 'math',

  sockets: [
    { name: 'A', gridPosition: 0 },
    { name: 'B', gridPosition: 1 },
  ],
  plugs: [{ name: 'Out', gridPosition: 0 }],

  evaluate: ({ inputs }) => {
    const [a, b] = inputs;
    return [clamp(a + b)];
  },

  size: { width: 2, height: 2 },
});

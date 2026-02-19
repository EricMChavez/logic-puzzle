import { defineChip } from '../framework';

/** Returns the larger of two input signals */
export const maxChip = defineChip({
  type: 'max',
  category: 'math',
  description: 'Outputs the higher of two signals',

  sockets: [
    { name: 'A', gridPosition: 0 },
    { name: 'B', gridPosition: 1 },
  ],
  plugs: [{ name: 'Out', gridPosition: 0 }],

  evaluate: ({ inputs }) => {
    const [a, b] = inputs;
    return [Math.max(a, b)];
  },

  size: { width: 2, height: 2 },
});

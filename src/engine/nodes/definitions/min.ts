import { defineChip } from '../framework';

/** Returns the smaller of two input signals */
export const minChip = defineChip({
  type: 'min',
  category: 'math',
  description: 'Outputs the lower of two signals',

  sockets: [
    { name: 'A', gridPosition: 0 },
    { name: 'B', gridPosition: 1 },
  ],
  plugs: [{ name: 'Out', gridPosition: 1 }],

  evaluate: ({ inputs }) => {
    const [a, b] = inputs;
    return [Math.min(a, b)];
  },

  size: { width: 2, height: 2 },
});

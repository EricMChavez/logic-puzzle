import { defineChip } from '../framework';

/** Flips the polarity of the input signal: output = -input */
export const negateChip = defineChip({
  type: 'negate',
  category: 'math',

  sockets: [{ name: 'A', gridPosition: 0 }],
  plugs: [{ name: 'Out', gridPosition: 0 }],

  evaluate: ({ inputs }) => {
    const [a] = inputs;
    return [-a];
  },

  size: { width: 3, height: 1 },
});

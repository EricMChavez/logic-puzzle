import { defineChip } from '../framework';

/** Splits the input 50/50 across two outputs */
export const divideChip = defineChip({
  type: 'divide',
  category: 'routing',

  sockets: [
    { name: 'A', side: 'left', gridPosition: 1 },
  ],
  plugs: [
    { name: 'X', side: 'right', gridPosition: 0 },
    { name: 'Y', side: 'right', gridPosition: 1 },
  ],

  evaluate: ({ inputs }) => {
    const [a] = inputs;
    return [a / 2, a / 2];
  },

  size: { width: 3, height: 1 },
});

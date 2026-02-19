import { defineChip } from '../framework';

/** Duplicates the input to two outputs */
export const duplicateChip = defineChip({
  type: 'duplicate',
  category: 'routing',
  description: 'Duplicates one signal into two identical outputs',

  sockets: [
    { name: 'A', side: 'left', gridPosition: 1 },
  ],
  plugs: [
    { name: 'X', side: 'right', gridPosition: 0 },
    { name: 'Y', side: 'right', gridPosition: 1 },
  ],

  evaluate: ({ inputs }) => {
    const [a] = inputs;
    return [a, a];
  },

  size: { width: 3, height:1},
});

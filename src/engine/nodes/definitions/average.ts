import { defineNode } from '../framework';

/** Averages two inputs to one output */
export const averageNode = defineNode({
  type: 'average',
  category: 'routing',

  inputs: [
    { name: 'A', side: 'left', gridPosition: 0 },
    { name: 'B', side: 'left', gridPosition: 2 },
  ],
  outputs: [
    { name: 'Out', side: 'right', gridPosition: 1 },
  ],

  evaluate: ({ inputs }) => {
    const [a, b] = inputs;
    const x = (a + b) / 2;
    return [x];
  },

  size: { width: 2, height: 2 },
});

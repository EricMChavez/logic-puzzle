import { defineNode } from '../framework';
import { clamp } from '../../../shared/math';

export const splitterNode = defineNode({
  type: 'splitter',
  category: 'routing',

  inputs: [{ name: 'A' }],
  outputs: [
    { name: 'Out1' },
    { name: 'Out2' },
  ],

  evaluate: ({ inputs }) => {
    const half = clamp(inputs[0] / 2);
    return [half, half];
  },

  size: { width: 3, height: 2 },
});

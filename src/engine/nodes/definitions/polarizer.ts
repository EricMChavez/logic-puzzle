import { defineNode } from '../framework';
import { clamp } from '../../../shared/math';

export const polarizerNode = defineNode({
  type: 'polarizer',
  category: 'math',

  inputs: [{ name: 'A' }],
  outputs: [{ name: 'Out' }],

  evaluate: ({ inputs }) => {
    const a = inputs[0];
    return [clamp(a > 0 ? 100 : a < 0 ? -100 : 0)];
  },

  size: { width: 2, height: 2 },
});

import { defineNode } from '../framework';
import { clamp } from '../../../shared/math';

export const mergerNode = defineNode({
  type: 'merger',
  category: 'math',

  inputs: [
    { name: 'A' },
    { name: 'B' },
  ],
  outputs: [{ name: 'Out' }],

  evaluate: ({ inputs }) => [clamp(inputs[0] + inputs[1])],

  size: { width: 3, height: 2 },
});

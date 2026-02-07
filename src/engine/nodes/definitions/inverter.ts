import { defineNode } from '../framework';
import { clamp } from '../../../shared/math';

export const inverterNode = defineNode({
  type: 'inverter',
  category: 'math',

  inputs: [{ name: 'A' }],
  outputs: [{ name: 'Out' }],

  evaluate: ({ inputs }) => [clamp(-inputs[0])],

  size: { width: 2, height: 2 },
});

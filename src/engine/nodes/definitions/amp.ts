import { defineNode } from '../framework';
import { clamp } from '../../../shared/math';

export type AmpParams = { gain: number };

export const ampNode = defineNode<AmpParams>({
  type: 'amp',
  category: 'math',

  inputs: [
    { name: 'A' },
    { name: 'X', description: 'Gain control', side: 'bottom' },
  ],
  outputs: [{ name: 'Out' }],

  params: [
    { key: 'gain', type: 'number', default: 0, label: 'Gain', min: -100, max: 100, step: 25 },
  ],

  evaluate: ({ inputs }) => {
    const [a, x] = inputs;
    return [clamp(a * (1 + x / 100))];
  },

  size: { width: 3, height: 3 },
});

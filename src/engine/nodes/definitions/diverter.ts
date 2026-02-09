import { defineNode } from '../framework';
import { clamp } from '../../../shared/math';

export type DiverterParams = { fade: number };

export const diverterNode = defineNode<DiverterParams>({
  type: 'diverter',
  category: 'routing',

  inputs: [
    { name: 'A' },
    { name: 'X', description: 'Fade control', side: 'bottom' },
  ],
  outputs: [{ name: 'Y' }, { name: 'Z' }],

  params: [
    { key: 'fade', type: 'number', default: 0, label: 'Fade', min: -100, max: 100, step: 25 },
  ],

  evaluate: ({ inputs }) => {
    const [a, x] = inputs;
    // x: -100 → Y=0%, Z=100%; 0 → Y=50%, Z=50%; +100 → Y=100%, Z=0%
    const y = clamp(a * (50 + x / 2) / 100);
    const z = clamp(a * (50 - x / 2) / 100);
    return [y, z];
  },

  size: { width: 3, height: 3 },
});

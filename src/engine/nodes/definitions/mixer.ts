import { defineNode } from '../framework';
import { clamp } from '../../../shared/math';

export type MixerParams = { mix: number };

export const mixerNode = defineNode<MixerParams>({
  type: 'mixer',
  category: 'routing',

  inputs: [
    { name: 'A' },
    { name: 'B' },
    { name: 'X', description: 'Crossfade control', side: 'bottom' },
  ],
  outputs: [{ name: 'Out' }],

  params: [
    { key: 'mix', type: 'number', default: 0, label: 'Mix', min: -100, max: 100, step: 25 },
  ],

  evaluate: ({ inputs }) => {
    const [a, b, x] = inputs;
    // x: -100 → 100% B, 0 → 50/50, +100 → 100% A
    const t = (x + 100) / 200;
    return [clamp(a * t + b * (1 - t))];
  },

  size: { width: 3, height: 3 },
});

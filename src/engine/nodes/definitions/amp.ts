import { defineChip } from '../framework';
import { clamp } from '../../../shared/math';

export type AmpParams = { gain: number };

export const ampChip = defineChip<AmpParams>({
  type: 'amp',
  category: 'math',
  description: 'Amplifies signal strength by a gain factor',

  sockets: [
    { name: 'A', gridPosition: 0 },
    { name: 'X', description: 'Gain', side: 'bottom', knob: 'gain' },
  ],
  plugs: [{ name: 'Out', gridPosition: 0 }],

  params: [
    { key: 'gain', type: 'number', default: 0, label: 'Gain', min: -100, max: 100, step: 25 },
  ],

  evaluate: ({ inputs }) => {
    const [a, x] = inputs;
    return [clamp(a * (x + 100) / 100)];
  },

  size: { width: 4, height: 3 },
});

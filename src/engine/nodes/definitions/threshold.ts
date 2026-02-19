import { defineChip } from '../framework';

export type ThresholdParams = { level: number };

/** Outputs +100 when input >= threshold level, -100 otherwise */
export const thresholdChip = defineChip<ThresholdParams>({
  type: 'threshold',
  category: 'math',
  description: 'Outputs +100 or -100 based on whether input exceeds a level',

  sockets: [
    { name: 'A' },
    { name: 'X', description: 'Threshold level', side: 'bottom', knob: 'level' },
  ],
  plugs: [{ name: 'Out' }],

  params: [
    { key: 'level', type: 'number', default: 0, label: 'Level', min: -100, max: 100, step: 25 },
  ],

  evaluate: ({ inputs }) => {
    const [a, x] = inputs;
    return [a >= x ? 100 : -100];
  },

  size: { width: 4, height: 3 },
});

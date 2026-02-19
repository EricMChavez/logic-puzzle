import { defineChip } from '../framework';
import { clamp } from '../../../shared/math';

export type OffsetParams = { amount: number };

export const offsetChip = defineChip<OffsetParams>({
  type: 'offset',
  category: 'math',
  description: 'Shifts signal up or down by a fixed amount',

  sockets: [
    { name: 'A' },
    { name: 'X', description: 'Offset amount', side: 'bottom', knob: 'amount' },
  ],
  plugs: [{ name: 'Out' }],

  params: [
    { key: 'amount', type: 'number', default: 0, label: 'Amount', min: -100, max: 100, step: 25 },
  ],

  evaluate: ({ inputs }) => {
    const [a, x] = inputs;
    return [clamp(a + x)];
  },

  size: { width: 4, height: 3 },
});

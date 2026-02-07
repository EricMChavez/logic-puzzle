import { describe, it, expect } from 'vitest';
import {
  buildConnectionPointConfig,
  buildCustomNodeConnectionPointConfig,
} from './types.ts';

describe('buildConnectionPointConfig', () => {
  it('1 input, 1 output → 1 active left input, 1 active right output', () => {
    const config = buildConnectionPointConfig(1, 1);

    expect(config.left[0]).toEqual({ active: true, direction: 'input' });
    expect(config.left[1]).toEqual({ active: false, direction: 'input' });
    expect(config.left[2]).toEqual({ active: false, direction: 'input' });

    expect(config.right[0]).toEqual({ active: true, direction: 'output' });
    expect(config.right[1]).toEqual({ active: false, direction: 'output' });
    expect(config.right[2]).toEqual({ active: false, direction: 'output' });
  });

  it('3 inputs, 2 outputs → all left active, 2 right active', () => {
    const config = buildConnectionPointConfig(3, 2);

    expect(config.left.every((s) => s.active)).toBe(true);
    expect(config.left.every((s) => s.direction === 'input')).toBe(true);

    expect(config.right[0].active).toBe(true);
    expect(config.right[1].active).toBe(true);
    expect(config.right[2].active).toBe(false);
  });

  it('0 inputs, 0 outputs → all inactive', () => {
    const config = buildConnectionPointConfig(0, 0);
    expect(config.left.every((s) => !s.active)).toBe(true);
    expect(config.right.every((s) => !s.active)).toBe(true);
  });

  it('always produces 3 left and 3 right slots', () => {
    const config = buildConnectionPointConfig(2, 1);
    expect(config.left).toHaveLength(3);
    expect(config.right).toHaveLength(3);
  });
});

describe('buildCustomNodeConnectionPointConfig', () => {
  it('all 6 slots active with direction output', () => {
    const config = buildCustomNodeConnectionPointConfig();

    expect(config.left).toHaveLength(3);
    expect(config.right).toHaveLength(3);

    for (const slot of [...config.left, ...config.right]) {
      expect(slot.active).toBe(true);
      expect(slot.direction).toBe('output');
    }
  });
});

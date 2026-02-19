import { describe, it, expect } from 'vitest';
import {
  chipRegistry,
  getChipDefinition,
  isFundamentalChip,
  getChipLabel,
  getDefaultParams,
  CATEGORY_LABELS,
} from './registry';
import { getKnobConfig } from './framework';

describe('Chip Registry', () => {
  describe('chipRegistry', () => {
    it('contains all fundamental chips', () => {
      expect(chipRegistry.allTypes).toContain('offset');
      expect(chipRegistry.allTypes).toContain('scale');
      expect(chipRegistry.allTypes).toContain('threshold');
      expect(chipRegistry.allTypes).toContain('max');
      expect(chipRegistry.allTypes).toContain('min');
      expect(chipRegistry.allTypes).toContain('duplicate');
      expect(chipRegistry.allTypes).toContain('memory');
      expect(chipRegistry.allTypes).toContain('divide');
      expect(chipRegistry.allTypes).toContain('add');
      expect(chipRegistry.allTypes).toContain('negate');
    });

    it('has correct count', () => {
      expect(chipRegistry.all).toHaveLength(11);
    });

    it('has byType lookup', () => {
      expect(chipRegistry.byType.get('offset')).toBeDefined();
      expect(chipRegistry.byType.get('unknown')).toBeUndefined();
    });

    it('has byCategory lookup', () => {
      expect(chipRegistry.byCategory.math).toHaveLength(8); // offset, scale, threshold, add, max, min, negate, amp
      expect(chipRegistry.byCategory.routing).toHaveLength(2); // duplicate, divide
      expect(chipRegistry.byCategory.timing).toHaveLength(1); // memory
    });
  });

  describe('getChipDefinition', () => {
    it('returns definition for known type', () => {
      const def = getChipDefinition('scale');
      expect(def).toBeDefined();
      expect(def?.type).toBe('scale');
      expect(def?.sockets).toHaveLength(2);
    });

    it('returns undefined for unknown type', () => {
      expect(getChipDefinition('unknown')).toBeUndefined();
    });

    it('returns undefined for custom types', () => {
      expect(getChipDefinition('puzzle:level-01')).toBeUndefined();
      expect(getChipDefinition('utility:my-util')).toBeUndefined();
    });
  });

  describe('isFundamentalChip', () => {
    it('returns true for fundamental types', () => {
      expect(isFundamentalChip('offset')).toBe(true);
      expect(isFundamentalChip('scale')).toBe(true);
      expect(isFundamentalChip('memory')).toBe(true);
    });

    it('returns false for custom types', () => {
      expect(isFundamentalChip('puzzle:level-01')).toBe(false);
      expect(isFundamentalChip('utility:my-util')).toBe(false);
      expect(isFundamentalChip('unknown')).toBe(false);
    });
  });

  describe('getChipLabel', () => {
    it('capitalizes first letter', () => {
      expect(getChipLabel('offset')).toBe('Offset');
      expect(getChipLabel('scale')).toBe('Scale');
      expect(getChipLabel('memory')).toBe('Memory');
    });
  });

  describe('getDefaultParams', () => {
    it('returns default params for parameterized nodes', () => {
      expect(getDefaultParams('scale')).toEqual({ factor: 100 });
      expect(getDefaultParams('offset')).toEqual({ amount: 0 });
      expect(getDefaultParams('threshold')).toEqual({ level: 0 });
    });

    it('returns empty object for non-parameterized nodes', () => {
      expect(getDefaultParams('max')).toEqual({});
      expect(getDefaultParams('min')).toEqual({});
      expect(getDefaultParams('duplicate')).toEqual({});
    });

    it('returns empty object for unknown types', () => {
      expect(getDefaultParams('unknown')).toEqual({});
    });
  });

  describe('CATEGORY_LABELS', () => {
    it('has labels for all categories', () => {
      expect(CATEGORY_LABELS.math).toBe('Math');
      expect(CATEGORY_LABELS.routing).toBe('Routing');
      expect(CATEGORY_LABELS.timing).toBe('Timing');
      expect(CATEGORY_LABELS.custom).toBe('Custom');
    });
  });

  describe('getKnobConfig', () => {
    it('returns correct config for scale', () => {
      expect(getKnobConfig(getChipDefinition('scale'))).toEqual({ portIndex: 1, paramKey: 'factor' });
    });

    it('returns correct config for offset', () => {
      expect(getKnobConfig(getChipDefinition('offset'))).toEqual({ portIndex: 1, paramKey: 'amount' });
    });

    it('returns correct config for threshold', () => {
      expect(getKnobConfig(getChipDefinition('threshold'))).toEqual({ portIndex: 1, paramKey: 'level' });
    });

    it('returns null for non-knob types', () => {
      expect(getKnobConfig(getChipDefinition('max'))).toBeNull();
      expect(getKnobConfig(getChipDefinition('min'))).toBeNull();
      expect(getKnobConfig(getChipDefinition('memory'))).toBeNull();
      expect(getKnobConfig(getChipDefinition('duplicate'))).toBeNull();
    });

    it('returns null for undefined definition', () => {
      expect(getKnobConfig(undefined)).toBeNull();
    });
  });
});

import { describe, it, expect } from 'vitest';
import {
  nodeRegistry,
  getNodeDefinition,
  isFundamentalNode,
  getNodeLabel,
  getDefaultParams,
  CATEGORY_LABELS,
} from './registry';
import { getKnobConfig } from './framework';

describe('Node Registry', () => {
  describe('nodeRegistry', () => {
    it('contains all fundamental nodes', () => {
      expect(nodeRegistry.allTypes).toContain('offset');
      expect(nodeRegistry.allTypes).toContain('scale');
      expect(nodeRegistry.allTypes).toContain('threshold');
      expect(nodeRegistry.allTypes).toContain('max');
      expect(nodeRegistry.allTypes).toContain('min');
      expect(nodeRegistry.allTypes).toContain('split');
      expect(nodeRegistry.allTypes).toContain('memory');
    });

    it('has correct count', () => {
      expect(nodeRegistry.all).toHaveLength(7);
    });

    it('has byType lookup', () => {
      expect(nodeRegistry.byType.get('offset')).toBeDefined();
      expect(nodeRegistry.byType.get('unknown')).toBeUndefined();
    });

    it('has byCategory lookup', () => {
      expect(nodeRegistry.byCategory.math).toHaveLength(5); // offset, scale, threshold, max, min
      expect(nodeRegistry.byCategory.routing).toHaveLength(1); // split
      expect(nodeRegistry.byCategory.timing).toHaveLength(1); // memory
    });
  });

  describe('getNodeDefinition', () => {
    it('returns definition for known type', () => {
      const def = getNodeDefinition('scale');
      expect(def).toBeDefined();
      expect(def?.type).toBe('scale');
      expect(def?.inputs).toHaveLength(2);
    });

    it('returns undefined for unknown type', () => {
      expect(getNodeDefinition('unknown')).toBeUndefined();
    });

    it('returns undefined for custom types', () => {
      expect(getNodeDefinition('puzzle:level-01')).toBeUndefined();
      expect(getNodeDefinition('utility:my-util')).toBeUndefined();
    });
  });

  describe('isFundamentalNode', () => {
    it('returns true for fundamental types', () => {
      expect(isFundamentalNode('offset')).toBe(true);
      expect(isFundamentalNode('scale')).toBe(true);
      expect(isFundamentalNode('memory')).toBe(true);
    });

    it('returns false for custom types', () => {
      expect(isFundamentalNode('puzzle:level-01')).toBe(false);
      expect(isFundamentalNode('utility:my-util')).toBe(false);
      expect(isFundamentalNode('unknown')).toBe(false);
    });
  });

  describe('getNodeLabel', () => {
    it('capitalizes first letter', () => {
      expect(getNodeLabel('offset')).toBe('Offset');
      expect(getNodeLabel('scale')).toBe('Scale');
      expect(getNodeLabel('memory')).toBe('Memory');
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
      expect(getDefaultParams('split')).toEqual({});
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
      expect(getKnobConfig(getNodeDefinition('scale'))).toEqual({ portIndex: 1, paramKey: 'factor' });
    });

    it('returns correct config for offset', () => {
      expect(getKnobConfig(getNodeDefinition('offset'))).toEqual({ portIndex: 1, paramKey: 'amount' });
    });

    it('returns correct config for threshold', () => {
      expect(getKnobConfig(getNodeDefinition('threshold'))).toEqual({ portIndex: 1, paramKey: 'level' });
    });

    it('returns null for non-knob types', () => {
      expect(getKnobConfig(getNodeDefinition('max'))).toBeNull();
      expect(getKnobConfig(getNodeDefinition('min'))).toBeNull();
      expect(getKnobConfig(getNodeDefinition('memory'))).toBeNull();
      expect(getKnobConfig(getNodeDefinition('split'))).toBeNull();
    });

    it('returns null for undefined definition', () => {
      expect(getKnobConfig(undefined)).toBeNull();
    });
  });
});

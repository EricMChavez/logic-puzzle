import { describe, it, expect } from 'vitest';
import {
  nodeRegistry,
  getNodeDefinition,
  isFundamentalNode,
  getNodeLabel,
  getDefaultParams,
  CATEGORY_LABELS,
} from './registry';

describe('Node Registry', () => {
  describe('nodeRegistry', () => {
    it('contains all fundamental nodes', () => {
      expect(nodeRegistry.allTypes).toContain('constant');
      expect(nodeRegistry.allTypes).toContain('inverter');
      expect(nodeRegistry.allTypes).toContain('scaler');
      expect(nodeRegistry.allTypes).toContain('merger');
      expect(nodeRegistry.allTypes).toContain('splitter');
      expect(nodeRegistry.allTypes).toContain('switch');
      expect(nodeRegistry.allTypes).toContain('shaper');
      expect(nodeRegistry.allTypes).toContain('delay');
    });

    it('has correct count', () => {
      expect(nodeRegistry.all).toHaveLength(8);
    });

    it('has byType lookup', () => {
      expect(nodeRegistry.byType.get('constant')).toBeDefined();
      expect(nodeRegistry.byType.get('unknown')).toBeUndefined();
    });

    it('has byCategory lookup', () => {
      expect(nodeRegistry.byCategory.source).toHaveLength(1);
      expect(nodeRegistry.byCategory.math).toHaveLength(3); // inverter, scaler, merger
      expect(nodeRegistry.byCategory.routing).toHaveLength(2); // splitter, switch
      expect(nodeRegistry.byCategory.shaping).toHaveLength(1);
      expect(nodeRegistry.byCategory.timing).toHaveLength(1);
    });
  });

  describe('getNodeDefinition', () => {
    it('returns definition for known type', () => {
      const def = getNodeDefinition('scaler');
      expect(def).toBeDefined();
      expect(def?.type).toBe('scaler');
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
      expect(isFundamentalNode('constant')).toBe(true);
      expect(isFundamentalNode('scaler')).toBe(true);
      expect(isFundamentalNode('delay')).toBe(true);
    });

    it('returns false for custom types', () => {
      expect(isFundamentalNode('puzzle:level-01')).toBe(false);
      expect(isFundamentalNode('utility:my-util')).toBe(false);
      expect(isFundamentalNode('unknown')).toBe(false);
    });
  });

  describe('getNodeLabel', () => {
    it('capitalizes first letter', () => {
      expect(getNodeLabel('constant')).toBe('Constant');
      expect(getNodeLabel('scaler')).toBe('Scaler');
      expect(getNodeLabel('delay')).toBe('Delay');
    });
  });

  describe('getDefaultParams', () => {
    it('returns default params for parameterized nodes', () => {
      expect(getDefaultParams('constant')).toEqual({ value: 0 });
      expect(getDefaultParams('delay')).toEqual({ wts: 1 });
    });

    it('returns empty object for non-parameterized nodes', () => {
      expect(getDefaultParams('inverter')).toEqual({});
      expect(getDefaultParams('merger')).toEqual({});
    });

    it('returns empty object for unknown types', () => {
      expect(getDefaultParams('unknown')).toEqual({});
    });
  });

  describe('CATEGORY_LABELS', () => {
    it('has labels for all categories', () => {
      expect(CATEGORY_LABELS.source).toBe('Sources');
      expect(CATEGORY_LABELS.math).toBe('Math');
      expect(CATEGORY_LABELS.routing).toBe('Routing');
      expect(CATEGORY_LABELS.shaping).toBe('Shaping');
      expect(CATEGORY_LABELS.timing).toBe('Timing');
      expect(CATEGORY_LABELS.custom).toBe('Custom');
    });
  });
});

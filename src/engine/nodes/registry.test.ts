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
      expect(nodeRegistry.allTypes).toContain('inverter');
      expect(nodeRegistry.allTypes).toContain('mixer');
      expect(nodeRegistry.allTypes).toContain('amp');
      expect(nodeRegistry.allTypes).toContain('diverter');
      expect(nodeRegistry.allTypes).toContain('polarizer');
      expect(nodeRegistry.allTypes).toContain('shifter');
    });

    it('has correct count', () => {
      expect(nodeRegistry.all).toHaveLength(8);
    });

    it('has byType lookup', () => {
      expect(nodeRegistry.byType.get('inverter')).toBeDefined();
      expect(nodeRegistry.byType.get('unknown')).toBeUndefined();
    });

    it('has byCategory lookup', () => {
      expect(nodeRegistry.byCategory.math).toHaveLength(4); // inverter, amp, polarizer, shifter
      expect(nodeRegistry.byCategory.routing).toHaveLength(4); // mixer, diverter, splitter, merger
    });
  });

  describe('getNodeDefinition', () => {
    it('returns definition for known type', () => {
      const def = getNodeDefinition('amp');
      expect(def).toBeDefined();
      expect(def?.type).toBe('amp');
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
      expect(isFundamentalNode('inverter')).toBe(true);
      expect(isFundamentalNode('amp')).toBe(true);
      expect(isFundamentalNode('mixer')).toBe(true);
    });

    it('returns false for custom types', () => {
      expect(isFundamentalNode('puzzle:level-01')).toBe(false);
      expect(isFundamentalNode('utility:my-util')).toBe(false);
      expect(isFundamentalNode('unknown')).toBe(false);
    });
  });

  describe('getNodeLabel', () => {
    it('capitalizes first letter', () => {
      expect(getNodeLabel('inverter')).toBe('Inverter');
      expect(getNodeLabel('amp')).toBe('Amp');
      expect(getNodeLabel('mixer')).toBe('Mixer');
    });
  });

  describe('getDefaultParams', () => {
    it('returns default params for parameterized nodes', () => {
      expect(getDefaultParams('amp')).toEqual({ gain: 0 });
      expect(getDefaultParams('mixer')).toEqual({ mix: 0 });
    });

    it('returns empty object for non-parameterized nodes', () => {
      expect(getDefaultParams('inverter')).toEqual({});
      expect(getDefaultParams('polarizer')).toEqual({});
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
});

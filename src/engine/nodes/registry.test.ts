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
      expect(nodeRegistry.allTypes).toContain('inverter');
      expect(nodeRegistry.allTypes).toContain('memory');
      expect(nodeRegistry.allTypes).toContain('mixer');
      expect(nodeRegistry.allTypes).toContain('amp');
      expect(nodeRegistry.allTypes).toContain('diverter');
      expect(nodeRegistry.allTypes).toContain('polarizer');
      expect(nodeRegistry.allTypes).toContain('offset');
    });

    it('has correct count', () => {
      expect(nodeRegistry.all).toHaveLength(9);
    });

    it('has byType lookup', () => {
      expect(nodeRegistry.byType.get('inverter')).toBeDefined();
      expect(nodeRegistry.byType.get('unknown')).toBeUndefined();
    });

    it('has byCategory lookup', () => {
      expect(nodeRegistry.byCategory.math).toHaveLength(4); // inverter, amp, polarizer, offset
      expect(nodeRegistry.byCategory.routing).toHaveLength(4); // mixer, diverter, splitter, average
      expect(nodeRegistry.byCategory.timing).toHaveLength(1); // memory
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
      expect(getNodeLabel('inverter')).toBe('Inverter');
      expect(getNodeLabel('amp')).toBe('Amp');
      expect(getNodeLabel('memory')).toBe('Memory');
    });
  });

  describe('getDefaultParams', () => {
    it('returns default params for parameterized nodes', () => {
      expect(getDefaultParams('amp')).toEqual({ gain: 0 });
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

  describe('getKnobConfig', () => {
    it('returns correct config for mixer', () => {
      expect(getKnobConfig(getNodeDefinition('mixer'))).toEqual({ portIndex: 2, paramKey: 'mix' });
    });

    it('returns correct config for amp', () => {
      expect(getKnobConfig(getNodeDefinition('amp'))).toEqual({ portIndex: 1, paramKey: 'gain' });
    });

    it('returns correct config for diverter', () => {
      expect(getKnobConfig(getNodeDefinition('diverter'))).toEqual({ portIndex: 1, paramKey: 'fade' });
    });

    it('returns correct config for offset', () => {
      expect(getKnobConfig(getNodeDefinition('offset'))).toEqual({ portIndex: 1, paramKey: 'offset' });
    });

    it('returns null for non-knob types', () => {
      expect(getKnobConfig(getNodeDefinition('inverter'))).toBeNull();
      expect(getKnobConfig(getNodeDefinition('memory'))).toBeNull();
      expect(getKnobConfig(getNodeDefinition('polarizer'))).toBeNull();
      expect(getKnobConfig(getNodeDefinition('splitter'))).toBeNull();
    });

    it('returns null for undefined definition', () => {
      expect(getKnobConfig(undefined)).toBeNull();
    });
  });
});

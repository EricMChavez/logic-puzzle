import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const canvasDir = path.resolve(__dirname);

/** Read a file from the canvas directory */
function readCanvasFile(filename: string): string {
  return fs.readFileSync(path.join(canvasDir, filename), 'utf-8');
}

/** All draw-function files (NOT render-loop.ts, which is the Zustand bridge) */
const DRAW_FILES = [
  'render-nodes.ts',
  'render-wires.ts',
  'render-wire-preview.ts',
  'render-connection-points.ts',
  'render-waveforms.ts',
  'render-grid.ts',
];

/** All render files including render-loop */
const ALL_RENDER_FILES = [...DRAW_FILES, 'render-loop.ts'];

describe('Draw function contracts', () => {
  describe('No useGameStore in draw files', () => {
    for (const file of DRAW_FILES) {
      it(`${file} does not import useGameStore`, () => {
        const content = readCanvasFile(file);
        expect(content).not.toMatch(/useGameStore/);
      });
    }
  });

  describe('No COLORS constant in any render file', () => {
    for (const file of ALL_RENDER_FILES) {
      it(`${file} does not import COLORS`, () => {
        const content = readCanvasFile(file);
        expect(content).not.toMatch(/\bCOLORS\b/);
      });
    }
  });

  describe('No isRunning import in draw files', () => {
    for (const file of DRAW_FILES) {
      it(`${file} does not import isRunning`, () => {
        const content = readCanvasFile(file);
        expect(content).not.toMatch(/isRunning/);
      });
    }
  });

  describe('No getWaveformBuffers import in draw files', () => {
    for (const file of DRAW_FILES) {
      it(`${file} does not import getWaveformBuffers`, () => {
        const content = readCanvasFile(file);
        expect(content).not.toMatch(/getWaveformBuffers/);
      });
    }
  });

  describe('All draw files accept ThemeTokens', () => {
    for (const file of DRAW_FILES) {
      it(`${file} imports ThemeTokens`, () => {
        const content = readCanvasFile(file);
        expect(content).toMatch(/ThemeTokens/);
      });
    }
  });

  describe('render-wires.ts exports drawWires (not renderWires)', () => {
    it('exports drawWires', () => {
      const content = readCanvasFile('render-wires.ts');
      expect(content).toMatch(/export function drawWires/);
    });

    it('does not export renderWires', () => {
      const content = readCanvasFile('render-wires.ts');
      expect(content).not.toMatch(/export function renderWires/);
    });
  });

  describe('render-loop.ts is the sole Zustand bridge', () => {
    it('imports useGameStore', () => {
      const content = readCanvasFile('render-loop.ts');
      expect(content).toMatch(/useGameStore/);
    });

    it('imports getThemeTokens', () => {
      const content = readCanvasFile('render-loop.ts');
      expect(content).toMatch(/getThemeTokens/);
    });

    it('imports isRunning', () => {
      const content = readCanvasFile('render-loop.ts');
      expect(content).toMatch(/isRunning/);
    });

    it('imports getWaveformBuffers', () => {
      const content = readCanvasFile('render-loop.ts');
      expect(content).toMatch(/getWaveformBuffers/);
    });

    it('imports getMeterBuffers', () => {
      const content = readCanvasFile('render-loop.ts');
      expect(content).toMatch(/getMeterBuffers/);
    });

    it('imports getTargetMeterBuffers', () => {
      const content = readCanvasFile('render-loop.ts');
      expect(content).toMatch(/getTargetMeterBuffers/);
    });

    it('calls useGameStore.getState() exactly once', () => {
      const content = readCanvasFile('render-loop.ts');
      const matches = content.match(/useGameStore\.getState\(\)/g);
      expect(matches).toHaveLength(1);
    });

    it('calls getThemeTokens() exactly once in the render function', () => {
      const content = readCanvasFile('render-loop.ts');
      const matches = content.match(/getThemeTokens\(\)/g);
      // One in import (no parens), one call in render
      const callMatches = content.match(/= getThemeTokens\(\)/g);
      expect(callMatches).toHaveLength(1);
    });
  });
});

import { useEffect, useState, useCallback } from 'react'
import { GameboardCanvas } from './gameboard/canvas/index.ts'
import { SimulationControls } from './ui/controls/SimulationControls.tsx'
import { GameboardButtons } from './ui/controls/GameboardButtons.tsx'
import { CompletionCeremony } from './ui/puzzle/CompletionCeremony.tsx'
import { PaletteModal, ParameterPopover, ContextMenu, WaveformSelectorOverlay, SavePuzzleDialog, NodeCreationForm, SaveCancelDialog } from './ui/overlays/index.ts'
import { PortConstantInput } from './ui/controls/PortConstantInput.tsx'
import { useGameStore } from './store/index.ts'
import type { GameboardState } from './shared/types/index.ts'
import { MainMenu } from './ui/screens/index.ts'
import { DevTools } from './dev/index.ts'
import { createMotherboard } from './store/motherboard.ts'

/** Compute 16:9-fitting container dimensions from the window size. */
function useContainerSize() {
  const compute = useCallback(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.min(vw, vh * 16 / 9);
    const height = Math.min(vh, vw * 9 / 16);
    return { width: Math.floor(width), height: Math.floor(height) };
  }, []);

  const [size, setSize] = useState(compute);

  useEffect(() => {
    function onResize() {
      setSize(compute());
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [compute]);

  return size;
}

/** Create an empty creative mode gameboard (slot nodes added when user configures CPs) */
function createCreativeGameboard(): GameboardState {
  return { id: 'creative-mode', chips: new Map(), paths: [] };
}

/** Initialize creative mode gameboard and meters. If saved state exists, restore it. */
export function initializeCreativeMode(): void {
  const store = useGameStore.getState();
  const saved = store.savedCreativeState;

  // Enter creative mode — this restores saved slots if available
  store.enterCreativeMode();

  if (saved) {
    // Restore saved board and port constants
    store.restoreBoard(saved.board, saved.portConstants);
    // Build SlotConfig from saved slot directions
    const slotConfig = saved.slots.map((s, i) => ({
      active: s.direction !== 'off',
      direction: s.direction === 'off' ? (i < 3 ? 'input' as const : 'output' as const) : s.direction,
    })) as unknown as import('./puzzle/types.ts').SlotConfig;
    store.initializeMeters(slotConfig, 'off');
  } else {
    // Fresh creative mode — all 6 meters start as 'off'
    store.setActiveBoard(createCreativeGameboard());
    store.initializeMeters([
      { active: false, direction: 'input' },
      { active: false, direction: 'input' },
      { active: false, direction: 'input' },
      { active: false, direction: 'output' },
      { active: false, direction: 'output' },
      { active: false, direction: 'output' },
    ], 'off');
  }
}

function App() {
  const containerSize = useContainerSize();

  useEffect(() => {
    const store = useGameStore.getState();

    // On first load, show motherboard with menu nodes + main menu overlay
    if (!store.activeBoard) {
      const motherboard = createMotherboard(store.completedLevels, store.isLevelUnlocked, store.customPuzzles);
      store.setActiveBoard(motherboard);
      store.initializeMeters([
        { active: false, direction: 'input' },
        { active: false, direction: 'input' },
        { active: false, direction: 'input' },
        { active: false, direction: 'output' },
        { active: false, direction: 'output' },
        { active: false, direction: 'output' },
      ], 'off');
      // Motherboard is read-only (no editing, just clicking)
      useGameStore.setState({ activeBoardReadOnly: true });
      // Show main menu on startup
      store.openOverlay({ type: 'main-menu' });
    }
  }, [])

  return (
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#000',
    }}>
      <div
        data-game-container
        style={{
          width: containerSize.width,
          height: containerSize.height,
          position: 'relative',
          overflow: 'hidden',
          willChange: 'transform',
        }}
      >
        <GameboardCanvas />
        <GameboardButtons />
        <SimulationControls />
        <PortConstantInput />
        <PaletteModal />
        <ParameterPopover />
        <ContextMenu />
        <WaveformSelectorOverlay />
        <SavePuzzleDialog />
        <SaveCancelDialog />
        <NodeCreationForm />
        <MainMenu />
        <CompletionCeremony />
        {import.meta.env.DEV && <DevTools />}
      </div>
    </div>
  )
}

export default App

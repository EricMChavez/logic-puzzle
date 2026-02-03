import { useEffect } from 'react'
import { GameboardCanvas } from './gameboard/canvas/index.ts'
import { PalettePanel } from './palette/components/PalettePanel.tsx'
import { NodeControls } from './ui/controls/NodeControls.tsx'
import { PortConstantInput } from './ui/controls/PortConstantInput.tsx'
import { SimulationControls } from './ui/controls/SimulationControls.tsx'
import { PuzzleInfoBar } from './ui/puzzle/PuzzleInfoBar.tsx'
import { useGameStore } from './store/index.ts'
import type { GameboardState } from './shared/types/index.ts'
import type { PuzzleDefinition } from './puzzle/types.ts'
import { createConnectionPointNode } from './puzzle/connection-point-nodes.ts'
import { PUZZLE_LEVELS } from './puzzle/levels/index.ts'

function createEmptyGameboard(): GameboardState {
  return { id: 'main', nodes: new Map(), wires: [] }
}

/** Create a gameboard pre-populated with virtual CP nodes for the given puzzle */
function createPuzzleGameboard(puzzle: PuzzleDefinition): GameboardState {
  const nodes = new Map<string, import('./shared/types/index.ts').NodeState>()

  for (let i = 0; i < puzzle.activeInputs; i++) {
    const node = createConnectionPointNode('input', i)
    nodes.set(node.id, node)
  }
  for (let i = 0; i < puzzle.activeOutputs; i++) {
    const node = createConnectionPointNode('output', i)
    nodes.set(node.id, node)
  }

  return { id: `puzzle-${puzzle.id}`, nodes, wires: [] }
}

function App() {
  useEffect(() => {
    if (!useGameStore.getState().activeBoard) {
      const store = useGameStore.getState()
      // Load the first tutorial puzzle by default
      const firstPuzzle = PUZZLE_LEVELS[0]
      if (firstPuzzle) {
        store.loadPuzzle(firstPuzzle)
        store.setActiveBoard(createPuzzleGameboard(firstPuzzle))
      } else {
        store.setActiveBoard(createEmptyGameboard())
      }
    }
  }, [])

  return (
    <div style={{ display: 'flex', width: '100%', height: '100%' }}>
      <PalettePanel />
      <div style={{ flex: 1, position: 'relative' }}>
        <GameboardCanvas />
        <PuzzleInfoBar />
        <NodeControls />
        <PortConstantInput />
        <SimulationControls />
      </div>
    </div>
  )
}

export default App

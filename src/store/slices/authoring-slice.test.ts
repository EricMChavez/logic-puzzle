import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../index.ts';

describe('authoring-slice', () => {
  beforeEach(() => {
    useGameStore.getState().cancelAuthoring();
  });

  it('starts in idle phase', () => {
    expect(useGameStore.getState().authoringPhase).toBe('idle');
  });

  it('beginRecordTarget transitions to configuring-start when outputs exist', () => {
    // Set up creative mode state needed for beginRecordTarget
    useGameStore.setState({
      isCreativeMode: true,
      cycleResults: {
        outputValues: [[10], [20], [30]],
        wireValues: [],
        nodeOutputs: new Map(),
        crossCycleState: new Map(),
        processingOrder: [],
        nodeDepths: new Map(),
        maxDepth: 0,
      },
      creativeSlots: [
        { direction: 'input' },
        { direction: 'off' },
        { direction: 'off' },
        { direction: 'output' },
        { direction: 'off' },
        { direction: 'off' },
      ],
      activeBoard: {
        id: 'test-board',
        nodes: new Map(),
        wires: [],
      },
    } as any);

    useGameStore.getState().beginRecordTarget();
    expect(useGameStore.getState().authoringPhase).toBe('configuring-start');
    expect(useGameStore.getState().recordedTargetSamples).not.toBeNull();
    expect(useGameStore.getState().solutionBoardSnapshot).not.toBeNull();
  });

  it('beginSaveAsPuzzle transitions from configuring-start to saving', () => {
    // First get to configuring-start phase
    useGameStore.setState({
      authoringPhase: 'configuring-start',
      recordedTargetSamples: new Map(),
      solutionBoardSnapshot: { nodes: new Map(), wires: [] },
    } as any);

    useGameStore.getState().beginSaveAsPuzzle();
    expect(useGameStore.getState().authoringPhase).toBe('saving');
  });

  it('beginSaveAsPuzzle does nothing from idle', () => {
    useGameStore.getState().beginSaveAsPuzzle();
    expect(useGameStore.getState().authoringPhase).toBe('idle');
  });

  it('cancelAuthoring returns to idle phase and clears state', () => {
    useGameStore.setState({
      authoringPhase: 'configuring-start',
      recordedTargetSamples: new Map([[3, [10, 20]]]),
      solutionBoardSnapshot: { nodes: new Map(), wires: [] },
    } as any);

    useGameStore.getState().cancelAuthoring();
    expect(useGameStore.getState().authoringPhase).toBe('idle');
    expect(useGameStore.getState().recordedTargetSamples).toBeNull();
    expect(useGameStore.getState().solutionBoardSnapshot).toBeNull();
  });

  it('cancelAuthoring is idempotent from idle', () => {
    useGameStore.getState().cancelAuthoring();
    expect(useGameStore.getState().authoringPhase).toBe('idle');
  });

  it('resetToSolution calls setActiveBoard with snapshot data', () => {
    const originalNode = {
      id: 'n1', type: 'offset', position: { col: 10, row: 10 },
      params: {}, inputCount: 1, outputCount: 1,
    };
    const snapshotNodes = new Map([['n1', { ...originalNode }]]);
    const snapshotWires: any[] = [];

    // Ensure no puzzle/creative mode so cycle runner won't crash
    useGameStore.setState({
      activePuzzle: null,
      isCreativeMode: false,
      editingUtilityId: null,
      authoringPhase: 'configuring-start',
      recordedTargetSamples: new Map(),
      solutionBoardSnapshot: { nodes: snapshotNodes, wires: snapshotWires },
      activeBoard: { id: 'test-board', nodes: new Map(), wires: [] },
    } as any);

    useGameStore.getState().resetToSolution();
    const board = useGameStore.getState().activeBoard;
    expect(board).not.toBeNull();
    expect(board!.nodes.size).toBe(1);
    expect(board!.nodes.get('n1')?.type).toBe('offset');
  });

  it('resetToSolution does nothing outside configuring-start', () => {
    useGameStore.setState({
      authoringPhase: 'idle',
      activeBoard: { id: 'test-board', nodes: new Map(), wires: [] },
    } as any);

    useGameStore.getState().resetToSolution();
    expect(useGameStore.getState().activeBoard!.nodes.size).toBe(0);
  });
});

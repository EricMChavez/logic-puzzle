import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { NodeState, Wire, PortRef } from '../../shared/types/index.ts';
import type { PuzzleDefinition } from '../../puzzle/types.ts';
import type { InteractionMode } from '../../store/slices/interaction-slice.ts';
import {
  getKeyboardAction,
  executeKeyboardAction,
  type KeyboardHandlerState,
  type KeyboardActionExecutor,
} from './keyboard-handler.ts';
import { setFocusTarget, _resetForTesting } from './keyboard-focus.ts';
import { PLAYABLE_START, PLAYABLE_END, GRID_ROWS } from '../../shared/grid/index.ts';

function makeNode(id: string, type: string, col: number, row: number, inputs = 1, outputs = 1): NodeState {
  return { id, type, position: { col, row }, params: {}, inputCount: inputs, outputCount: outputs };
}

function makeWire(id: string, sourceNodeId: string, sourcePort: number, targetNodeId: string, targetPort: number): Wire {
  return {
    id,
    source: { chipId: sourceNodeId, portIndex: sourcePort, side: 'output' },
    target: { chipId: targetNodeId, portIndex: targetPort, side: 'input' },
    route: [],
  };
}

function makeState(overrides: Partial<KeyboardHandlerState> = {}): KeyboardHandlerState {
  return {
    hasActiveOverlay: () => false,
    activeBoardReadOnly: false,
    interactionMode: { type: 'idle' },
    selectedNodeId: null,
    activeBoard: { chips: new Map(), paths: [] },
    activePuzzle: null,
    keyboardGhostPosition: null,
    playMode: 'playing',
    ...overrides,
  };
}

function makeKeyEvent(overrides: Partial<{ shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }> = {}) {
  return { shiftKey: false, ctrlKey: false, metaKey: false, ...overrides };
}

function makeExecutor(overrides: Partial<KeyboardActionExecutor> = {}): KeyboardActionExecutor {
  return {
    undo: vi.fn(),
    redo: vi.fn(),
    openOverlay: vi.fn(),
    removeNode: vi.fn(),
    removeWire: vi.fn(),
    selectNode: vi.fn(),
    clearSelection: vi.fn(),
    startKeyboardWiring: vi.fn(),
    cycleWiringTarget: vi.fn(),
    cancelKeyboardWiring: vi.fn(),
    setKeyboardGhostPosition: vi.fn(),
    rotatePlacement: vi.fn(),
    togglePlayMode: vi.fn(),
    stepPlaypoint: vi.fn(),
    interactionMode: { type: 'idle' },
    activeBoard: { chips: new Map(), paths: [] },
    activePuzzle: null,
    keyboardGhostPosition: null,
    ...overrides,
  };
}

describe('getKeyboardAction', () => {
  beforeEach(() => {
    _resetForTesting();
  });

  it('Ctrl+Z returns undo', () => {
    const action = getKeyboardAction('z', makeKeyEvent({ ctrlKey: true }), makeState());
    expect(action).toEqual({ type: 'undo' });
  });

  it('Ctrl+Shift+Z returns redo', () => {
    const action = getKeyboardAction('z', makeKeyEvent({ ctrlKey: true, shiftKey: true }), makeState());
    expect(action).toEqual({ type: 'redo' });
  });

  it('Ctrl+Z returns noop when overlay active', () => {
    const action = getKeyboardAction('z', makeKeyEvent({ ctrlKey: true }), makeState({ hasActiveOverlay: () => true }));
    expect(action.type).toBe('noop');
  });

  it('Ctrl+Z returns noop when read-only', () => {
    const action = getKeyboardAction('z', makeKeyEvent({ ctrlKey: true }), makeState({ activeBoardReadOnly: true }));
    expect(action.type).toBe('noop');
  });

  it('Tab returns advance-focus forward', () => {
    const action = getKeyboardAction('Tab', makeKeyEvent(), makeState());
    expect(action).toEqual({ type: 'advance-focus', direction: 1 });
  });

  it('Shift+Tab returns advance-focus backward', () => {
    const action = getKeyboardAction('Tab', makeKeyEvent({ shiftKey: true }), makeState());
    expect(action).toEqual({ type: 'advance-focus', direction: -1 });
  });

  it('Tab in keyboard-wiring mode cycles targets forward', () => {
    const fromPort: PortRef = { chipId: 'n1', portIndex: 0, side: 'output' };
    const mode: InteractionMode = { type: 'keyboard-wiring', fromPort, validTargets: [], targetIndex: 0 };
    const action = getKeyboardAction('Tab', makeKeyEvent(), makeState({ interactionMode: mode }));
    expect(action).toEqual({ type: 'cycle-wiring-target', direction: 1 });
  });

  it('Tab returns noop when overlay active', () => {
    const action = getKeyboardAction('Tab', makeKeyEvent(), makeState({ hasActiveOverlay: () => true }));
    expect(action.type).toBe('noop');
  });

  it('ArrowUp returns move-ghost in placing-node mode', () => {
    const action = getKeyboardAction('ArrowUp', makeKeyEvent(), makeState({ interactionMode: { type: 'placing-node', nodeType: 'memory', rotation: 0 } }));
    expect(action).toEqual({ type: 'move-ghost', delta: { col: 0, row: -1 } });
  });

  it('ArrowDown returns move-ghost in placing-node mode', () => {
    const action = getKeyboardAction('ArrowDown', makeKeyEvent(), makeState({ interactionMode: { type: 'placing-node', nodeType: 'memory', rotation: 0 } }));
    expect(action).toEqual({ type: 'move-ghost', delta: { col: 0, row: 1 } });
  });

  it('ArrowLeft returns move-ghost in placing-node mode', () => {
    const action = getKeyboardAction('ArrowLeft', makeKeyEvent(), makeState({ interactionMode: { type: 'placing-node', nodeType: 'memory', rotation: 0 } }));
    expect(action).toEqual({ type: 'move-ghost', delta: { col: -1, row: 0 } });
  });

  it('ArrowRight returns move-ghost in placing-node mode', () => {
    const action = getKeyboardAction('ArrowRight', makeKeyEvent(), makeState({ interactionMode: { type: 'placing-node', nodeType: 'memory', rotation: 0 } }));
    expect(action).toEqual({ type: 'move-ghost', delta: { col: 1, row: 0 } });
  });

  it('Arrow keys return noop in idle+playing mode', () => {
    const action = getKeyboardAction('ArrowUp', makeKeyEvent(), makeState());
    expect(action.type).toBe('noop');
  });

  it('ArrowLeft returns step-playpoint when paused and idle', () => {
    const action = getKeyboardAction('ArrowLeft', makeKeyEvent(), makeState({ playMode: 'paused' }));
    expect(action).toEqual({ type: 'step-playpoint', delta: -1 });
  });

  it('ArrowRight returns step-playpoint when paused and idle', () => {
    const action = getKeyboardAction('ArrowRight', makeKeyEvent(), makeState({ playMode: 'paused' }));
    expect(action).toEqual({ type: 'step-playpoint', delta: 1 });
  });

  it('ArrowUp returns noop when paused and idle', () => {
    const action = getKeyboardAction('ArrowUp', makeKeyEvent(), makeState({ playMode: 'paused' }));
    expect(action.type).toBe('noop');
  });

  it('P returns toggle-play in idle mode', () => {
    const action = getKeyboardAction('p', makeKeyEvent(), makeState());
    expect(action).toEqual({ type: 'toggle-play' });
  });

  it('P returns noop with active overlay', () => {
    const action = getKeyboardAction('p', makeKeyEvent(), makeState({ hasActiveOverlay: () => true }));
    expect(action.type).toBe('noop');
  });

  it('Enter in keyboard-wiring mode completes wiring', () => {
    const fromPort: PortRef = { chipId: 'n1', portIndex: 0, side: 'output' };
    const mode: InteractionMode = { type: 'keyboard-wiring', fromPort, validTargets: [], targetIndex: 0 };
    const action = getKeyboardAction('Enter', makeKeyEvent(), makeState({ interactionMode: mode }));
    expect(action).toEqual({ type: 'complete-wiring' });
  });

  it('Enter in placing-node mode places node', () => {
    const action = getKeyboardAction('Enter', makeKeyEvent(), makeState({ interactionMode: { type: 'placing-node', nodeType: 'memory', rotation: 0 } }));
    expect(action).toEqual({ type: 'place-node' });
  });

  it('Enter on focused utility node returns enter-node', () => {
    const nodes = new Map<string, NodeState>();
    nodes.set('u1', makeNode('u1', 'utility:tool', 3, 2));
    setFocusTarget({ type: 'node', chipId: 'u1' });

    const action = getKeyboardAction('Enter', makeKeyEvent(), makeState({ activeBoard: { chips: nodes, paths: [] } }));
    expect(action).toEqual({ type: 'enter-node', chipId: 'u1' });
  });

  it('Enter on focused param node returns open-params', () => {
    const nodes = new Map<string, NodeState>();
    nodes.set('n1', makeNode('n1', 'scale', 3, 2, 2, 1));
    setFocusTarget({ type: 'node', chipId: 'n1' });

    const action = getKeyboardAction('Enter', makeKeyEvent(), makeState({ activeBoard: { chips: nodes, paths: [] } }));
    expect(action).toEqual({ type: 'open-params', chipId: 'n1' });
  });

  it('Enter on focused port returns start-wiring', () => {
    const portRef: PortRef = { chipId: 'n1', portIndex: 0, side: 'output' };
    setFocusTarget({ type: 'port', portRef });

    const action = getKeyboardAction('Enter', makeKeyEvent(), makeState());
    expect(action).toEqual({ type: 'start-wiring', portRef });
  });

  it('Enter on focused connection-point returns start-wiring-cp', () => {
    setFocusTarget({ type: 'connection-point', side: 'input', index: 0 });

    const action = getKeyboardAction('Enter', makeKeyEvent(), makeState());
    expect(action).toEqual({ type: 'start-wiring-cp', side: 'input', index: 0 });
  });

  it('Delete on focused node returns delete-node', () => {
    setFocusTarget({ type: 'node', chipId: 'n1' });
    const action = getKeyboardAction('Delete', makeKeyEvent(), makeState());
    expect(action).toEqual({ type: 'delete-node', chipId: 'n1' });
  });

  it('Delete on focused wire returns delete-wire', () => {
    setFocusTarget({ type: 'wire', wireId: 'w1' });
    const action = getKeyboardAction('Delete', makeKeyEvent(), makeState());
    expect(action).toEqual({ type: 'delete-wire', wireId: 'w1' });
  });

  it('Delete returns noop when read-only', () => {
    setFocusTarget({ type: 'node', chipId: 'n1' });
    const action = getKeyboardAction('Delete', makeKeyEvent(), makeState({ activeBoardReadOnly: true }));
    expect(action.type).toBe('noop');
  });

  it('Backspace also deletes', () => {
    setFocusTarget({ type: 'node', chipId: 'n1' });
    const action = getKeyboardAction('Backspace', makeKeyEvent(), makeState());
    expect(action).toEqual({ type: 'delete-node', chipId: 'n1' });
  });

  it('N returns open-palette in idle mode', () => {
    const action = getKeyboardAction('n', makeKeyEvent(), makeState());
    expect(action).toEqual({ type: 'open-palette' });
  });

  it('Space returns toggle-play in idle mode', () => {
    const action = getKeyboardAction(' ', makeKeyEvent(), makeState());
    expect(action).toEqual({ type: 'toggle-play' });
  });

  it('N returns noop when not idle', () => {
    const action = getKeyboardAction('n', makeKeyEvent(), makeState({ interactionMode: { type: 'placing-node', nodeType: 'memory', rotation: 0 } }));
    expect(action.type).toBe('noop');
  });

  it('Delete on locked focused node returns noop', () => {
    const nodes = new Map<string, NodeState>();
    nodes.set('n1', { ...makeNode('n1', 'memory', 10, 5), locked: true });
    setFocusTarget({ type: 'node', chipId: 'n1' });
    const action = getKeyboardAction('Delete', makeKeyEvent(), makeState({ activeBoard: { chips: nodes, paths: [] } }));
    expect(action.type).toBe('noop');
  });

  it('Backspace on locked focused node returns noop', () => {
    const nodes = new Map<string, NodeState>();
    nodes.set('n1', { ...makeNode('n1', 'memory', 10, 5), locked: true });
    setFocusTarget({ type: 'node', chipId: 'n1' });
    const action = getKeyboardAction('Backspace', makeKeyEvent(), makeState({ activeBoard: { chips: nodes, paths: [] } }));
    expect(action.type).toBe('noop');
  });
});

describe('executeKeyboardAction', () => {
  beforeEach(() => {
    _resetForTesting();
  });

  it('undo calls executor.undo', () => {
    const exec = makeExecutor();
    executeKeyboardAction({ type: 'undo' }, exec);
    expect(exec.undo).toHaveBeenCalled();
  });

  it('redo calls executor.redo', () => {
    const exec = makeExecutor();
    executeKeyboardAction({ type: 'redo' }, exec);
    expect(exec.redo).toHaveBeenCalled();
  });

  it('open-palette calls openOverlay with palette-modal', () => {
    const exec = makeExecutor();
    executeKeyboardAction({ type: 'open-palette' }, exec);
    expect(exec.openOverlay).toHaveBeenCalledWith({ type: 'palette-modal' });
  });

  it('delete-node calls removeNode and clears focus', () => {
    const exec = makeExecutor();
    setFocusTarget({ type: 'node', chipId: 'n1' });
    executeKeyboardAction({ type: 'delete-node', chipId: 'n1' }, exec);
    expect(exec.removeNode).toHaveBeenCalledWith('n1');
  });

  it('delete-wire calls removeWire and clears focus', () => {
    const exec = makeExecutor();
    setFocusTarget({ type: 'wire', wireId: 'w1' });
    executeKeyboardAction({ type: 'delete-wire', wireId: 'w1' }, exec);
    expect(exec.removeWire).toHaveBeenCalledWith('w1');
  });

  it('move-ghost initializes to center when no current position', () => {
    const exec = makeExecutor({ keyboardGhostPosition: null });
    executeKeyboardAction({ type: 'move-ghost', delta: { col: 1, row: 0 } }, exec);
    expect(exec.setKeyboardGhostPosition).toHaveBeenCalled();
    const pos = (exec.setKeyboardGhostPosition as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(pos.col).toBeGreaterThanOrEqual(PLAYABLE_START);
    expect(pos.col).toBeLessThanOrEqual(PLAYABLE_END - 1);
    expect(pos.row).toBeGreaterThanOrEqual(0);
    expect(pos.row).toBeLessThanOrEqual(GRID_ROWS - 1);
  });

  it('move-ghost clamps to playable area with 1-cell padding', () => {
    const exec = makeExecutor({ keyboardGhostPosition: { col: PLAYABLE_START + 1, row: 1 } });
    executeKeyboardAction({ type: 'move-ghost', delta: { col: -1, row: -1 } }, exec);
    const pos = (exec.setKeyboardGhostPosition as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(pos.col).toBe(PLAYABLE_START + 1);
    expect(pos.row).toBe(1);
  });

  it('move-ghost clamps at right/bottom bounds with 1-cell padding', () => {
    const exec = makeExecutor({ keyboardGhostPosition: { col: PLAYABLE_END - 2, row: GRID_ROWS - 2 } });
    executeKeyboardAction({ type: 'move-ghost', delta: { col: 1, row: 1 } }, exec);
    const pos = (exec.setKeyboardGhostPosition as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(pos.col).toBe(PLAYABLE_END - 2);
    expect(pos.row).toBe(GRID_ROWS - 2);
  });

  it('complete-wiring calls onCompleteWire with current target', () => {
    const onCompleteWire = vi.fn();
    const fromPort: PortRef = { chipId: 'n1', portIndex: 0, side: 'output' };
    const targetPort: PortRef = { chipId: 'n2', portIndex: 0, side: 'input' };
    const exec = makeExecutor({
      interactionMode: { type: 'keyboard-wiring', fromPort, validTargets: [targetPort], targetIndex: 0 },
      onCompleteWire,
    });
    executeKeyboardAction({ type: 'complete-wiring' }, exec);
    expect(onCompleteWire).toHaveBeenCalledWith(fromPort, targetPort);
    expect(exec.cancelKeyboardWiring).toHaveBeenCalled();
  });

  it('start-wiring calls startKeyboardWiring with valid targets', () => {
    const nodes = new Map<string, NodeState>();
    nodes.set('n1', makeNode('n1', 'memory', 3, 2));
    nodes.set('n2', makeNode('n2', 'max', 10, 5, 2, 1));

    const exec = makeExecutor({ activeBoard: { chips: nodes, paths: [] } });
    const portRef: PortRef = { chipId: 'n1', portIndex: 0, side: 'output' };
    executeKeyboardAction({ type: 'start-wiring', portRef }, exec);
    expect(exec.startKeyboardWiring).toHaveBeenCalled();
    const targets = (exec.startKeyboardWiring as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(targets.length).toBeGreaterThan(0);
  });

  it('cycle-wiring-target calls cycleWiringTarget', () => {
    const exec = makeExecutor();
    executeKeyboardAction({ type: 'cycle-wiring-target', direction: 1 }, exec);
    expect(exec.cycleWiringTarget).toHaveBeenCalledWith(1);
  });

  it('enter-node calls onEnterNode', () => {
    const onEnterNode = vi.fn();
    const exec = makeExecutor({ onEnterNode });
    executeKeyboardAction({ type: 'enter-node', chipId: 'u1' }, exec);
    expect(onEnterNode).toHaveBeenCalledWith('u1');
  });

  it('place-node calls onPlaceNode with ghost position', () => {
    const onPlaceNode = vi.fn();
    const pos = { col: 10, row: 5 };
    const exec = makeExecutor({ keyboardGhostPosition: pos, onPlaceNode });
    executeKeyboardAction({ type: 'place-node' }, exec);
    expect(onPlaceNode).toHaveBeenCalledWith(pos);
  });

  it('toggle-play calls togglePlayMode', () => {
    const exec = makeExecutor();
    executeKeyboardAction({ type: 'toggle-play' }, exec);
    expect(exec.togglePlayMode).toHaveBeenCalled();
  });

  it('step-playpoint calls stepPlaypoint with delta', () => {
    const exec = makeExecutor();
    executeKeyboardAction({ type: 'step-playpoint', delta: -1 }, exec);
    expect(exec.stepPlaypoint).toHaveBeenCalledWith(-1);
  });

  it('noop does nothing', () => {
    const exec = makeExecutor();
    executeKeyboardAction({ type: 'noop' }, exec);
    expect(exec.undo).not.toHaveBeenCalled();
    expect(exec.redo).not.toHaveBeenCalled();
    expect(exec.openOverlay).not.toHaveBeenCalled();
    expect(exec.removeNode).not.toHaveBeenCalled();
  });
});

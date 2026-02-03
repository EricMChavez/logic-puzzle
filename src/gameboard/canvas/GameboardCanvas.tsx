import { useRef, useEffect, useCallback } from 'react';
import { startRenderLoop } from './render-loop.ts';
import { useGameStore } from '../../store/index.ts';
import { hitTest } from './hit-testing.ts';
import { generateId } from '../../shared/generate-id.ts';
import { FUNDAMENTAL_NODES } from '../../palette/fundamental/index.ts';
import { NODE_CONFIG } from '../../shared/constants/index.ts';
import type { PortRef } from '../../shared/types/index.ts';
import { cpInputId, cpOutputId } from '../../puzzle/connection-point-nodes.ts';

function getCanvasLogicalSize(canvas: HTMLCanvasElement) {
  const parent = canvas.parentElement;
  if (!parent) return { w: canvas.width, h: canvas.height };
  return { w: parent.clientWidth, h: parent.clientHeight };
}

/**
 * Determine the valid wire endpoints from a source port click.
 * Output port → needs input port to complete.
 * Input port → needs output port to complete (wire drawn in reverse).
 */
function canCompleteWire(from: PortRef, to: PortRef): boolean {
  // Must connect output → input (in either click order)
  if (from.side === to.side) return false;
  // No self-loops
  if (from.nodeId === to.nodeId) return false;
  return true;
}

function orderWire(from: PortRef, to: PortRef): { output: PortRef; input: PortRef } {
  if (from.side === 'output') return { output: from, input: to };
  return { output: to, input: from };
}

/**
 * Convert a connection-point hit into a PortRef referencing its virtual node.
 * Input CPs expose their output port (side: 'output'), output CPs expose their input port (side: 'input').
 * Returns null if the virtual node doesn't exist on the board.
 */
function connectionPointToPortRef(
  cpSide: 'input' | 'output',
  index: number,
  nodes: ReadonlyMap<string, import('../../shared/types/index.ts').NodeState>,
): PortRef | null {
  const nodeId = cpSide === 'input' ? cpInputId(index) : cpOutputId(index);
  if (!nodes.has(nodeId)) return null;
  // Input CPs emit signals → their wireable port is the output side
  // Output CPs receive signals → their wireable port is the input side
  return {
    nodeId,
    portIndex: 0,
    side: cpSide === 'input' ? 'output' : 'input',
  };
}

export function GameboardCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function resize() {
      const parent = canvas!.parentElement;
      if (!parent) return;
      const dpr = window.devicePixelRatio || 1;
      const w = parent.clientWidth;
      const h = parent.clientHeight;
      canvas!.width = w * dpr;
      canvas!.height = h * dpr;
      canvas!.style.width = `${w}px`;
      canvas!.style.height = `${h}px`;
      const ctx = canvas!.getContext('2d');
      if (ctx) {
        ctx.scale(dpr, dpr);
      }
    }

    resize();
    window.addEventListener('resize', resize);
    const stopLoop = startRenderLoop(canvas);

    return () => {
      stopLoop();
      window.removeEventListener('resize', resize);
    };
  }, []);

  // Escape key cancels current interaction
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        const state = useGameStore.getState();
        if (state.interactionMode.type === 'drawing-wire') {
          state.cancelWireDraw();
        } else if (state.interactionMode.type === 'placing-node') {
          state.cancelPlacing();
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    useGameStore.getState().setMousePosition({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  }, []);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const { w, h } = getCanvasLogicalSize(canvas);

    const state = useGameStore.getState();

    // --- Placing node mode ---
    if (state.interactionMode.type === 'placing-node') {
      const nodeType = state.interactionMode.nodeType;
      const def = FUNDAMENTAL_NODES.find((d) => d.type === nodeType);
      if (!def) return;

      state.addNode({
        id: generateId(),
        type: def.type,
        position: { x: x - NODE_CONFIG.WIDTH / 2, y: y - NODE_CONFIG.HEIGHT / 2 },
        params: { ...def.defaultParams },
        inputCount: def.inputCount,
        outputCount: def.outputCount,
      });
      state.cancelPlacing();
      return;
    }

    if (!state.activeBoard) return;
    const hit = hitTest(x, y, state.activeBoard.nodes, w, h);

    // --- Drawing wire mode ---
    if (state.interactionMode.type === 'drawing-wire') {
      const fromPort = state.interactionMode.fromPort;

      // Complete wire to a node port
      if (hit.type === 'port') {
        if (canCompleteWire(fromPort, hit.portRef)) {
          const { output, input } = orderWire(fromPort, hit.portRef);
          // Check for duplicate wire
          const duplicate = state.activeBoard.wires.some(
            (w) =>
              w.from.nodeId === output.nodeId &&
              w.from.portIndex === output.portIndex &&
              w.to.nodeId === input.nodeId &&
              w.to.portIndex === input.portIndex,
          );
          if (!duplicate) {
            state.addWire({
              id: generateId(),
              from: { ...output, side: 'output' },
              to: { ...input, side: 'input' },
              wtsDelay: 16,
              signals: [],
            });
          }
        }
        state.cancelWireDraw();
        return;
      }

      // Complete wire to a connection point
      if (hit.type === 'connection-point') {
        const cpPortRef = connectionPointToPortRef(hit.side, hit.index, state.activeBoard.nodes);
        if (cpPortRef && canCompleteWire(fromPort, cpPortRef)) {
          const { output, input } = orderWire(fromPort, cpPortRef);
          const duplicate = state.activeBoard.wires.some(
            (w) =>
              w.from.nodeId === output.nodeId &&
              w.from.portIndex === output.portIndex &&
              w.to.nodeId === input.nodeId &&
              w.to.portIndex === input.portIndex,
          );
          if (!duplicate) {
            state.addWire({
              id: generateId(),
              from: { ...output, side: 'output' },
              to: { ...input, side: 'input' },
              wtsDelay: 16,
              signals: [],
            });
          }
        }
        state.cancelWireDraw();
        return;
      }

      // Clicked empty space or node body — cancel wire draw
      state.cancelWireDraw();
      return;
    }

    // --- Idle mode ---
    if (hit.type === 'port') {
      state.startWireDraw(hit.portRef, hit.position);
      return;
    }

    // Start wire from connection point
    if (hit.type === 'connection-point') {
      const cpPortRef = connectionPointToPortRef(hit.side, hit.index, state.activeBoard.nodes);
      if (cpPortRef) {
        state.startWireDraw(cpPortRef, hit.position);
      }
      return;
    }

    if (hit.type === 'node') {
      state.selectNode(hit.nodeId);
      return;
    }

    state.clearSelection();
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;

    const state = useGameStore.getState();

    if (state.interactionMode.type === 'drawing-wire') {
      state.cancelWireDraw();
      return;
    }

    // Right-click on an input port opens constant value editor
    if (state.activeBoard && state.interactionMode.type === 'idle') {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const { w, h } = getCanvasLogicalSize(canvas);
      const hit = hitTest(x, y, state.activeBoard.nodes, w, h);

      if (hit.type === 'port' && hit.portRef.side === 'input') {
        state.startEditingPort(hit.portRef.nodeId, hit.portRef.portIndex, hit.position);
      }
    }
  }, []);

  const cursorStyle = useGameStore((s) => {
    if (s.interactionMode.type === 'placing-node') return 'crosshair';
    if (s.interactionMode.type === 'drawing-wire') return 'crosshair';
    return 'default';
  });

  return (
    <canvas
      ref={canvasRef}
      onClick={handleClick}
      onMouseMove={handleMouseMove}
      onContextMenu={handleContextMenu}
      style={{
        display: 'block',
        position: 'absolute',
        top: 0,
        left: 0,
        cursor: cursorStyle,
      }}
    />
  );
}

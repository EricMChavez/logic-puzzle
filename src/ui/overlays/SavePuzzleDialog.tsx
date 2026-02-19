import { useCallback, useState, useMemo, useRef, useEffect } from 'react';
import { useGameStore } from '../../store/index.ts';
import { slotToMeterInfo } from '../../store/slices/creative-slice.ts';
import type { CustomPuzzle } from '../../store/slices/custom-puzzle-slice.ts';
import type { AllowedChips } from '../../puzzle/types.ts';
import { chipRegistry, getChipLabel } from '../../engine/nodes/registry.ts';
import { isCreativeSlotNode, creativeSlotId, cpInputId, cpOutputId } from '../../puzzle/connection-point-nodes.ts';
import styles from './SavePuzzleDialog.module.css';

/** Tolerance for checking if starting config solves the puzzle (±5). */
const SOLVE_CHECK_TOLERANCE = 5;

export function SavePuzzleDialog() {
  const overlay = useGameStore((s) => s.activeOverlay);
  if (overlay.type !== 'save-puzzle-dialog') return null;
  return <SavePuzzleDialogInner />;
}

function SavePuzzleDialogInner() {
  const closeOverlay = useGameStore((s) => s.closeOverlay);
  const cancelAuthoring = useGameStore((s) => s.cancelAuthoring);
  const recordedTargetSamples = useGameStore((s) => s.recordedTargetSamples);
  const creativeSlots = useGameStore((s) => s.creativeSlots);
  const activeBoard = useGameStore((s) => s.activeBoard);
  const addCustomPuzzle = useGameStore((s) => s.addCustomPuzzle);
  const cycleResults = useGameStore((s) => s.cycleResults);
  const tutorialTitleDraft = useGameStore((s) => s.tutorialTitleDraft);
  const setTutorialTitleDraft = useGameStore((s) => s.setTutorialTitleDraft);
  const tutorialMessageDraft = useGameStore((s) => s.tutorialMessageDraft);
  const setTutorialMessageDraft = useGameStore((s) => s.setTutorialMessageDraft);

  // Build list of all fundamental chip types (including "Custom" for user-created chips)
  const allChipTypes = useMemo(() => {
    const types: Array<{ type: string; label: string }> = [];
    for (const def of chipRegistry.all) {
      types.push({ type: def.type, label: getChipLabel(def.type) });
    }
    types.push({ type: 'custom', label: 'Custom' });
    return types;
  }, []);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  // quantity: -1 = unlimited, 0+ = max count
  const [quantities, setQuantities] = useState<Record<string, number>>(() =>
    Object.fromEntries(allChipTypes.map((t) => [t.type, -1]))
  );
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Non-CP board nodes = starting nodes (auto-captured from current board state)
  const startingNodes = useMemo(() => {
    if (!activeBoard) return [];
    return Array.from(activeBoard.chips.values())
      .filter((node) => !isCreativeSlotNode(node.id));
  }, [activeBoard]);

  // Count starting nodes by type
  const startingNodeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const node of startingNodes) {
      counts.set(node.type, (counts.get(node.type) ?? 0) + 1);
    }
    return counts;
  }, [startingNodes]);

  // Focus title input on mount
  useEffect(() => {
    titleInputRef.current?.focus();
  }, []);

  // Find input and output slots
  const inputSlots = creativeSlots
    .map((slot, index) => ({ slot, index }))
    .filter(({ slot }) => slot.direction === 'input');

  const outputSlots = creativeSlots
    .map((slot, index) => ({ slot, index }))
    .filter(({ slot }) => slot.direction === 'output');

  // Validation: check if starting config already solves the puzzle
  const alreadySolved = useMemo(() => {
    if (!cycleResults || !recordedTargetSamples) return false;
    const outputCount = cycleResults.outputValues[0]?.length ?? 0;
    const tolerance = SOLVE_CHECK_TOLERANCE;

    for (const [slotIndex, targetSamples] of recordedTargetSamples) {
      // Creative-mode evaluator uses slotIndex directly as outputIndex (not slotIndex - 3)
      const outputIdx = slotIndex;
      if (outputIdx < 0 || outputIdx >= outputCount) return false;
      for (let c = 0; c < targetSamples.length; c++) {
        const actual = cycleResults.outputValues[c]?.[outputIdx] ?? 0;
        if (Math.abs(actual - targetSamples[c]) > tolerance) return false;
      }
    }
    return true;
  }, [cycleResults, recordedTargetSamples]);

  // Validation: check if any type budget < starting node count
  const budgetErrors = useMemo(() => {
    const errors: string[] = [];
    for (const [type, count] of startingNodeCounts) {
      const budget = quantities[type];
      if (budget !== undefined && budget !== -1 && budget < count) {
        errors.push(`${getChipLabel(type)}: budget ${budget} < ${count} starting chips`);
      }
    }
    return errors;
  }, [quantities, startingNodeCounts]);

  const handleCancel = useCallback(() => {
    cancelAuthoring();
    closeOverlay();
  }, [cancelAuthoring, closeOverlay]);

  const handleSave = useCallback(() => {
    if (!title.trim()) {
      setError('Please enter a title');
      return;
    }

    if (!activeBoard || !recordedTargetSamples) {
      setError('Invalid state - please try again');
      return;
    }

    if (budgetErrors.length > 0) {
      setError('Fix budget errors before saving');
      return;
    }

    // Build slot configuration
    const slots = creativeSlots.map((slot) => ({
      direction: slot.direction,
      waveform: slot.direction === 'input' ? slot.waveform : undefined,
    }));

    // Serialize starting chips (all non-CP nodes from current board)
    const initialChips = startingNodes.map((node) => ({
      id: node.id,
      type: node.type,
      position: { col: node.position.col, row: node.position.row },
      params: { ...node.params },
      socketCount: node.socketCount,
      plugCount: node.plugCount,
      rotation: node.rotation,
      locked: false,
    }));

    // Build mapping from creative slot IDs → loaded puzzle CP IDs
    const creativeToLoadedId = new Map<string, string>();
    let mappedInputCount = 0;
    let mappedOutputCount = 0;
    for (let i = 0; i < creativeSlots.length; i++) {
      const slot = creativeSlots[i];
      if (slot.direction === 'off') continue;
      const cId = creativeSlotId(i);
      if (slot.direction === 'input') {
        creativeToLoadedId.set(cId, cpInputId(mappedInputCount++));
      } else {
        creativeToLoadedId.set(cId, cpOutputId(mappedOutputCount++));
      }
    }

    // Capture wires, remapping creative-slot CP IDs to standard CP IDs
    const startingNodeIds = new Set(startingNodes.map(n => n.id));
    const initialPaths: CustomPuzzle['initialPaths'] = activeBoard.paths
      .filter(w => {
        // Include wires where both endpoints are starting nodes or CP nodes
        const sourceOk = startingNodeIds.has(w.source.chipId) || creativeToLoadedId.has(w.source.chipId);
        const targetOk = startingNodeIds.has(w.target.chipId) || creativeToLoadedId.has(w.target.chipId);
        return sourceOk && targetOk;
      })
      .map(w => ({
        source: {
          chipId: creativeToLoadedId.get(w.source.chipId) ?? w.source.chipId,
          portIndex: w.source.portIndex,
        },
        target: {
          chipId: creativeToLoadedId.get(w.target.chipId) ?? w.target.chipId,
          portIndex: w.target.portIndex,
        },
      }));

    // Compute allowedNodes: if all types are -1, use null (all unlimited)
    const allUnlimited = allChipTypes.every(t => quantities[t.type] === -1);
    const computedAllowed: AllowedChips = allUnlimited
      ? null
      : { ...quantities };

    const puzzle: CustomPuzzle = {
      id: `custom-${Date.now()}`,
      title: title.trim(),
      description: description.trim(),
      createdAt: Date.now(),
      slots,
      targetSamples: recordedTargetSamples,
      initialChips,
      initialPaths,
      allowedChips: computedAllowed,
      tutorialMessage: tutorialMessageDraft.trim() || undefined,
      tutorialTitle: tutorialTitleDraft.trim() || undefined,
    };

    addCustomPuzzle(puzzle);
    cancelAuthoring();
    closeOverlay();
  }, [
    title,
    description,
    activeBoard,
    recordedTargetSamples,
    creativeSlots,
    startingNodes,
    addCustomPuzzle,
    cancelAuthoring,
    closeOverlay,
    quantities,
    allChipTypes,
    budgetErrors,
    tutorialTitleDraft,
    tutorialMessageDraft,
  ]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSave();
    }
  }, [handleCancel, handleSave]);

  const setAllUnlimited = useCallback(() => {
    setQuantities(Object.fromEntries(allChipTypes.map((t) => [t.type, -1])));
  }, [allChipTypes]);

  const setAllNone = useCallback(() => {
    setQuantities(Object.fromEntries(allChipTypes.map((t) => [t.type, 0])));
  }, [allChipTypes]);

  return (
    <div className={styles.backdrop}>
      <div className={styles.panel} onKeyDown={handleKeyDown}>
        <div className={styles.header}>
          <h2 className={styles.title}>Save Puzzle</h2>
        </div>

        <div className={styles.content}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="puzzle-title">Title</label>
            <input
              ref={titleInputRef}
              id="puzzle-title"
              type="text"
              className={styles.input}
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setError('');
              }}
              placeholder="My Puzzle"
              maxLength={50}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="puzzle-description">Description (optional)</label>
            <textarea
              id="puzzle-description"
              className={styles.textarea}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what this puzzle does..."
              rows={3}
              maxLength={200}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="puzzle-card-title">
              Card Title (optional)
            </label>
            <input
              id="puzzle-card-title"
              type="text"
              className={styles.input}
              value={tutorialTitleDraft}
              onChange={(e) => setTutorialTitleDraft(e.target.value)}
              placeholder="Big headline on the card"
              maxLength={40}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="puzzle-tutorial-message">
              Card Body (optional)
            </label>
            <textarea
              id="puzzle-tutorial-message"
              className={styles.textarea}
              value={tutorialMessageDraft}
              onChange={(e) => setTutorialMessageDraft(e.target.value)}
              placeholder="Instructions or hint text..."
              rows={2}
              maxLength={200}
            />
            <span className={styles.hint}>White card with cutout text, rendered on the gameboard</span>
          </div>

          {error && <div className={styles.error}>{error}</div>}

          <div className={styles.summary}>
            <h3 className={styles.summaryTitle}>Puzzle Configuration</h3>
            <div className={styles.summaryGrid}>
              <div className={styles.summaryItem}>
                <span className={styles.summaryLabel}>Inputs:</span>
                <span className={styles.summaryValue}>
                  {inputSlots.length > 0
                    ? inputSlots.map(({ index }) => {
                        const { side, index: meterIndex } = slotToMeterInfo(index);
                        return `${side === 'left' ? 'L' : 'R'}${meterIndex + 1}`;
                      }).join(', ')
                    : 'None'}
                </span>
              </div>
              <div className={styles.summaryItem}>
                <span className={styles.summaryLabel}>Outputs:</span>
                <span className={styles.summaryValue}>
                  {outputSlots.length > 0
                    ? outputSlots.map(({ index }) => {
                        const { side, index: meterIndex } = slotToMeterInfo(index);
                        return `${side === 'left' ? 'L' : 'R'}${meterIndex + 1}`;
                      }).join(', ')
                    : 'None'}
                </span>
              </div>
              <div className={styles.summaryItem}>
                <span className={styles.summaryLabel}>Starting chips:</span>
                <span className={styles.summaryValue}>{startingNodes.length}</span>
              </div>
            </div>
          </div>

          {alreadySolved && (
            <div className={styles.warning}>
              Starting configuration already solves the puzzle. Remove some chips/paths first.
            </div>
          )}

          {budgetErrors.length > 0 && (
            <div className={styles.error}>
              {budgetErrors.map((e, i) => <div key={i}>{e}</div>)}
            </div>
          )}

          <div className={styles.checkboxSection}>
            <h3 className={styles.summaryTitle}>
              Chip Budgets
              <button type="button" className={styles.toggleAllButton} onClick={setAllUnlimited}>
                All Unlimited
              </button>
              <button type="button" className={styles.toggleAllButton} onClick={setAllNone}>
                None
              </button>
            </h3>
            <div>
              {allChipTypes.map((entry) => (
                <div key={entry.type} className={styles.quantityRow}>
                  <span className={styles.quantityLabel}>{entry.label}</span>
                  <input
                    type="number"
                    className={styles.quantityInput}
                    min={-1}
                    value={quantities[entry.type]}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      if (!isNaN(val) && val >= -1) {
                        setQuantities(prev => ({ ...prev, [entry.type]: val }));
                      }
                    }}
                    title="-1 = unlimited, 0 = not allowed, 1+ = max count"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className={styles.footer}>
          <button className={styles.cancelButton} onClick={handleCancel}>Cancel</button>
          <button className={styles.saveButton} onClick={handleSave}>Save Puzzle</button>
        </div>
      </div>
    </div>
  );
}

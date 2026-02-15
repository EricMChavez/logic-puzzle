import { useState, useEffect, useRef, useCallback } from 'react';
import { useGameStore } from '../../store/index.ts';
import { buildPaletteItems, computeRemainingBudgets, filterPaletteItems } from './palette-items.ts';
import type { PaletteItem } from './palette-items.ts';
import styles from './PaletteModal.module.css';

export function PaletteModal() {
  const overlay = useGameStore((s) => s.activeOverlay);
  if (overlay.type !== 'palette-modal') return null;
  return <PaletteModalInner />;
}

function PaletteModalInner() {
  const closeOverlay = useGameStore((s) => s.closeOverlay);
  const startPlacingNode = useGameStore((s) => s.startPlacingNode);
  const deleteUtilityNode = useGameStore((s) => s.deleteUtilityNode);
  const utilityNodes = useGameStore((s) => s.utilityNodes);
  const activePuzzle = useGameStore((s) => s.activePuzzle);
  const activeBoard = useGameStore((s) => s.activeBoard);

  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const allowedNodes = activePuzzle?.allowedNodes ?? null;
  const remainingBudgets = computeRemainingBudgets(
    allowedNodes,
    activeBoard?.chips ?? new Map(),
  );
  const allItems = buildPaletteItems(allowedNodes, utilityNodes, remainingBudgets);
  const filtered = filterPaletteItems(allItems, query);

  // Auto-focus search input
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Clamp activeIndex when filtered list changes
  useEffect(() => {
    setActiveIndex((prev) => Math.min(prev, Math.max(0, filtered.length - 1)));
  }, [filtered.length]);

  // Clear confirm state when search query changes
  useEffect(() => {
    setConfirmingDeleteId(null);
  }, [query]);

  const handleSelect = useCallback((item: PaletteItem) => {
    if (!item.canPlace) return;
    closeOverlay();
    startPlacingNode(item.nodeType);
  }, [closeOverlay, startPlacingNode]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => Math.min(prev + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered.length > 0 && activeIndex < filtered.length) {
        handleSelect(filtered[activeIndex]);
      }
    }
  }, [filtered, activeIndex, handleSelect]);

  // Scroll active item into view
  useEffect(() => {
    if (!listRef.current) return;
    const btns = listRef.current.querySelectorAll('button[data-palette-item]');
    btns[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  // Group items by section
  const sections: Array<{ title: string; items: PaletteItem[] }> = [];
  const fundamentals: PaletteItem[] = [];
  const utilities: PaletteItem[] = [];

  for (const item of filtered) {
    if (item.section === 'fundamental') fundamentals.push(item);
    else utilities.push(item);
  }
  if (fundamentals.length > 0) sections.push({ title: 'Fundamental', items: fundamentals });
  if (utilities.length > 0) sections.push({ title: 'Utility (Custom)', items: utilities });

  // Compute flat index offset for each section item
  let flatIndex = 0;

  return (
    <div className={styles.backdrop} onClick={closeOverlay}>
      <div
        className={styles.panel}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        role="dialog"
        aria-label="Chip Palette"
      >
        <div className={styles.searchWrap}>
          <input
            ref={inputRef}
            type="text"
            className={styles.searchInput}
            placeholder="Search chips..."
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActiveIndex(0); }}
          />
        </div>
        <div className={styles.list} ref={listRef}>
          {sections.map((section) => (
            <div key={section.title}>
              <div className={styles.sectionTitle}>{section.title}</div>
              {section.items.map((item) => {
                const idx = flatIndex++;
                const isUtility = item.section === 'utility';
                const utilityId = isUtility ? item.id.replace('utility:', '') : null;
                const isConfirming = utilityId !== null && confirmingDeleteId === utilityId;
                const depleted = !item.canPlace;

                // Build display label with remaining count
                let displayLabel = item.label;
                if (item.remaining !== null && item.remaining !== -1) {
                  displayLabel = `${item.label} (${item.remaining} left)`;
                }

                if (isConfirming) {
                  return (
                    <div key={item.id} className={styles.confirmItem}>
                      <span className={styles.confirmText}>Delete &ldquo;{item.label}&rdquo;?</span>
                      <div className={styles.confirmActions}>
                        <button
                          className={styles.confirmYes}
                          onClick={() => {
                            deleteUtilityNode(utilityId!);
                            setConfirmingDeleteId(null);
                          }}
                        >
                          Delete
                        </button>
                        <button
                          className={styles.confirmNo}
                          onClick={() => setConfirmingDeleteId(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  );
                }

                if (isUtility) {
                  return (
                    <div key={item.id} className={styles.utilityRow}>
                      <button
                        className={`${styles.item} ${idx === activeIndex ? styles.active : ''} ${depleted ? styles.depleted : ''}`}
                        onClick={() => handleSelect(item)}
                        disabled={depleted}
                        data-palette-item
                      >
                        {displayLabel}
                      </button>
                      <button
                        className={styles.deleteBtn}
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmingDeleteId(utilityId!);
                        }}
                        title="Delete utility chip"
                        aria-label={`Delete ${item.label}`}
                      >
                        &#x2715;
                      </button>
                    </div>
                  );
                }

                return (
                  <button
                    key={item.id}
                    className={`${styles.item} ${idx === activeIndex ? styles.active : ''} ${depleted ? styles.depleted : ''}`}
                    onClick={() => handleSelect(item)}
                    disabled={depleted}
                    data-palette-item
                  >
                    {displayLabel}
                  </button>
                );
              })}
            </div>
          ))}
          {filtered.length === 0 && (
            <div className={styles.emptyMsg}>No chips match your search</div>
          )}
        </div>
      </div>
    </div>
  );
}

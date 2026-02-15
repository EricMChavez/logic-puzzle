import { useCallback, useState, useRef, useEffect } from 'react';
import { useGameStore } from '../../store/index.ts';
import styles from './NodeCreationForm.module.css';

// ─── Local form types ──────────────────────────────────────────────────────────

interface PortEntry {
  name: string;
  description: string;
  side: '' | 'left' | 'right' | 'top' | 'bottom';
  gridPosition: string; // kept as string for free-form input; empty = omit
}

interface ParamEntry {
  key: string;
  type: 'number' | 'string' | 'boolean';
  default: string;
  label: string;
  min: string;
  max: string;
  step: string;
  options: string; // comma-separated for string enums
}

type ActiveTab = 'form' | 'preview';

// ─── Helpers ────────────────────────────────────────────────────────────────────

function makePort(): PortEntry {
  return { name: '', description: '', side: '', gridPosition: '' };
}

function makeParam(): ParamEntry {
  return { key: '', type: 'number', default: '0', label: '', min: '', max: '', step: '', options: '' };
}

function toKebab(s: string): string {
  return s
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '');
}

function toCamel(kebab: string): string {
  return kebab.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

function toPascal(kebab: string): string {
  const camel = toCamel(kebab);
  return camel.charAt(0).toUpperCase() + camel.slice(1);
}

function indent(text: string, spaces: number): string {
  const pad = ' '.repeat(spaces);
  return text
    .split('\n')
    .map((line) => (line.trim() ? pad + line : line))
    .join('\n');
}

// ─── Code Generator ─────────────────────────────────────────────────────────────

function generateCode(
  nodeType: string,
  category: string,
  description: string,
  width: number,
  height: number,
  inputs: PortEntry[],
  outputs: PortEntry[],
  params: ParamEntry[],
  isStateful: boolean,
  stateFields: string,
  evaluateBody: string,
): string {
  const kebab = toKebab(nodeType);
  const pascal = toPascal(kebab);
  const constName = `${toCamel(kebab)}Node`;

  const lines: string[] = [];

  // Imports
  const needsClamp = evaluateBody.includes('clamp');
  if (isStateful) {
    lines.push("import { defineNode } from '../framework';");
    lines.push("import type { NodeRuntimeState } from '../framework';");
  } else {
    lines.push("import { defineNode } from '../framework';");
  }
  if (needsClamp) {
    lines.push("import { clamp } from '../../../shared/math';");
  }
  lines.push('');

  // Description comment
  if (description) {
    lines.push(`/** ${description} */`);
  }

  // Params type
  const hasParams = params.length > 0;
  if (hasParams) {
    const paramFields = params
      .map((p) => {
        if (p.type === 'string') return `  ${p.key}: string;`;
        if (p.type === 'boolean') return `  ${p.key}: boolean;`;
        return `  ${p.key}: number;`;
      })
      .join('\n');
    lines.push(`export type ${pascal}Params = {`);
    lines.push(paramFields);
    lines.push('};');
    lines.push('');
  }

  // State type + factory
  if (isStateful) {
    lines.push(`export interface ${pascal}State extends NodeRuntimeState {`);
    lines.push(stateFields.trim() || '  // TODO: define state fields');
    lines.push('}');
    lines.push('');
    lines.push(`export function create${pascal}State(): ${pascal}State {`);
    lines.push('  return {');
    lines.push('    // TODO: initialize state');
    lines.push('  };');
    lines.push('}');
    lines.push('');
  }

  // defineNode call
  const generic = hasParams ? `<${pascal}Params>` : '';
  lines.push(`export const ${constName} = defineNode${generic}({`);
  lines.push(`  type: '${kebab}',`);
  lines.push(`  category: '${category}',`);
  lines.push('');

  // Inputs
  lines.push('  inputs: [');
  for (const port of inputs) {
    const props: string[] = [`name: '${port.name || 'A'}'`];
    if (port.description) props.push(`description: '${port.description}'`);
    if (port.side) props.push(`side: '${port.side}'`);
    if (port.gridPosition !== '') props.push(`gridPosition: ${port.gridPosition}`);
    lines.push(`    { ${props.join(', ')} },`);
  }
  lines.push('  ],');

  // Outputs
  lines.push('  outputs: [');
  for (const port of outputs) {
    const props: string[] = [`name: '${port.name || 'Out'}'`];
    if (port.description) props.push(`description: '${port.description}'`);
    if (port.side) props.push(`side: '${port.side}'`);
    if (port.gridPosition !== '') props.push(`gridPosition: ${port.gridPosition}`);
    lines.push(`    { ${props.join(', ')} },`);
  }
  lines.push('  ],');

  // Params
  if (hasParams) {
    lines.push('');
    lines.push('  params: [');
    for (const p of params) {
      const props: string[] = [
        `key: '${p.key}'`,
        `type: '${p.type}'`,
        `default: ${p.type === 'string' ? `'${p.default}'` : p.type === 'boolean' ? p.default : p.default || '0'}`,
        `label: '${p.label || p.key}'`,
      ];
      if (p.type === 'number') {
        if (p.min !== '') props.push(`min: ${p.min}`);
        if (p.max !== '') props.push(`max: ${p.max}`);
        if (p.step !== '') props.push(`step: ${p.step}`);
      }
      if (p.type === 'string' && p.options.trim()) {
        const opts = p.options
          .split(',')
          .map((o) => `'${o.trim()}'`)
          .join(', ');
        props.push(`options: [${opts}]`);
      }
      lines.push(`    { ${props.join(', ')} },`);
    }
    lines.push('  ],');
  }

  // createState
  if (isStateful) {
    lines.push('');
    lines.push(`  createState: create${pascal}State,`);
  }

  // Evaluate
  lines.push('');
  const evalBody = evaluateBody.trim() || `// TODO: implement\n    return [${outputs.map(() => '0').join(', ')}];`;
  lines.push(`  evaluate: (${isStateful ? '{ inputs, params, state }' : hasParams ? '{ inputs, params }' : '{ inputs }'}) => {`);
  lines.push(indent(evalBody, 4));
  lines.push('  },');

  // Size
  lines.push('');
  lines.push(`  size: { width: ${width}, height: ${height} },`);

  lines.push('});');

  return lines.join('\n');
}

// ─── Component ──────────────────────────────────────────────────────────────────

export function NodeCreationForm() {
  const overlay = useGameStore((s) => s.activeOverlay);
  if (overlay.type !== 'node-creation-form') return null;
  return <NodeCreationFormInner />;
}

function NodeCreationFormInner() {
  const closeOverlay = useGameStore((s) => s.closeOverlay);

  // ─ Identity
  const [nodeType, setNodeType] = useState('');
  const [category, setCategory] = useState<string>('math');
  const [description, setDescription] = useState('');

  // ─ Size
  const [width, setWidth] = useState(3);
  const [height, setHeight] = useState(2);

  // ─ Ports
  const [inputs, setInputs] = useState<PortEntry[]>([{ name: 'A', description: '', side: '', gridPosition: '0' }]);
  const [outputs, setOutputs] = useState<PortEntry[]>([{ name: 'Out', description: '', side: '', gridPosition: '0' }]);

  // ─ Parameters
  const [params, setParams] = useState<ParamEntry[]>([]);

  // ─ State
  const [isStateful, setIsStateful] = useState(false);
  const [stateFields, setStateFields] = useState('');

  // ─ Evaluate
  const [evaluateBody, setEvaluateBody] = useState('');

  // ─ UI
  const [activeTab, setActiveTab] = useState<ActiveTab>('form');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const typeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    typeInputRef.current?.focus();
  }, []);

  // ─── Port list helpers ──────────────────────────────────────────────────

  const updateInput = useCallback((index: number, field: keyof PortEntry, value: string) => {
    setInputs((prev) => prev.map((p, i) => (i === index ? { ...p, [field]: value } : p)));
  }, []);

  const updateOutput = useCallback((index: number, field: keyof PortEntry, value: string) => {
    setOutputs((prev) => prev.map((p, i) => (i === index ? { ...p, [field]: value } : p)));
  }, []);

  const addInput = useCallback(() => {
    setInputs((prev) => [...prev, makePort()]);
  }, []);

  const addOutput = useCallback(() => {
    setOutputs((prev) => [...prev, makePort()]);
  }, []);

  const removeInput = useCallback((index: number) => {
    setInputs((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const removeOutput = useCallback((index: number) => {
    setOutputs((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // ─── Param list helpers ─────────────────────────────────────────────────

  const updateParam = useCallback((index: number, field: keyof ParamEntry, value: string) => {
    setParams((prev) => prev.map((p, i) => (i === index ? { ...p, [field]: value } : p)));
  }, []);

  const addParam = useCallback(() => {
    setParams((prev) => [...prev, makeParam()]);
  }, []);

  const removeParam = useCallback((index: number) => {
    setParams((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // ─── Validation ─────────────────────────────────────────────────────────

  const validate = useCallback((): string | null => {
    if (!nodeType.trim()) return 'Node type is required';
    if (!/^[a-z][a-z0-9-]*$/.test(toKebab(nodeType))) return 'Type must be kebab-case (e.g. "low-pass")';
    if (inputs.length === 0) return 'At least one input port is required';
    if (outputs.length === 0) return 'At least one output port is required';
    for (const p of inputs) {
      if (!p.name.trim()) return 'All input ports need a name';
    }
    for (const p of outputs) {
      if (!p.name.trim()) return 'All output ports need a name';
    }
    for (const p of params) {
      if (!p.key.trim()) return 'All parameters need a key';
      if (!p.label.trim()) return 'All parameters need a label';
    }
    return null;
  }, [nodeType, inputs, outputs, params]);

  // ─── Generate & Copy ────────────────────────────────────────────────────

  const generatedCode = generateCode(
    nodeType,
    category,
    description,
    width,
    height,
    inputs,
    outputs,
    params,
    isStateful,
    stateFields,
    evaluateBody,
  );

  const handleGenerate = useCallback(() => {
    const err = validate();
    if (err) {
      setError(err);
      return;
    }
    setError('');
    setActiveTab('preview');
  }, [validate]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(generatedCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select the code block text
      const pre = document.querySelector(`.${styles.codeBlock}`);
      if (pre) {
        const range = document.createRange();
        range.selectNodeContents(pre);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    }
  }, [generatedCode]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeOverlay();
    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleGenerate();
    }
  }, [closeOverlay, handleGenerate]);

  // ─── Port row renderer ─────────────────────────────────────────────────

  const renderPortRow = (
    port: PortEntry,
    index: number,
    update: (i: number, field: keyof PortEntry, val: string) => void,
    remove: (i: number) => void,
    canRemove: boolean,
  ) => (
    <div className={styles.listItem} key={index}>
      <div className={styles.listItemFieldGrow}>
        <label className={styles.label}>Name</label>
        <input
          type="text"
          className={styles.input}
          value={port.name}
          onChange={(e) => update(index, 'name', e.target.value)}
          placeholder="A"
          maxLength={20}
        />
      </div>
      <div className={styles.listItemFieldGrow}>
        <label className={styles.label}>Description</label>
        <input
          type="text"
          className={styles.input}
          value={port.description}
          onChange={(e) => update(index, 'description', e.target.value)}
          placeholder="Optional tooltip"
          maxLength={60}
        />
      </div>
      <div className={styles.listItemFieldMed}>
        <label className={styles.label}>Side</label>
        <select
          className={styles.select}
          value={port.side}
          onChange={(e) => update(index, 'side', e.target.value)}
        >
          <option value="">Default</option>
          <option value="left">Left</option>
          <option value="right">Right</option>
          <option value="top">Top</option>
          <option value="bottom">Bottom</option>
        </select>
      </div>
      <div className={styles.listItemFieldSmall}>
        <label className={styles.label}>Pos</label>
        <input
          type="text"
          className={styles.input}
          value={port.gridPosition}
          onChange={(e) => update(index, 'gridPosition', e.target.value)}
          placeholder=""
          maxLength={3}
        />
      </div>
      {canRemove && (
        <button className={styles.removeButton} onClick={() => remove(index)}>
          Remove
        </button>
      )}
    </div>
  );

  // ─── Param row renderer ─────────────────────────────────────────────────

  const renderParamRow = (param: ParamEntry, index: number) => (
    <div className={styles.listItem} key={index}>
      <div className={styles.listItemFieldGrow}>
        <label className={styles.label}>Key</label>
        <input
          type="text"
          className={styles.input}
          value={param.key}
          onChange={(e) => updateParam(index, 'key', e.target.value)}
          placeholder="gain"
          maxLength={30}
        />
      </div>
      <div className={styles.listItemFieldMed}>
        <label className={styles.label}>Type</label>
        <select
          className={styles.select}
          value={param.type}
          onChange={(e) => updateParam(index, 'type', e.target.value as ParamEntry['type'])}
        >
          <option value="number">Number</option>
          <option value="string">String</option>
          <option value="boolean">Boolean</option>
        </select>
      </div>
      <div className={styles.listItemFieldSmall}>
        <label className={styles.label}>Default</label>
        <input
          type="text"
          className={styles.input}
          value={param.default}
          onChange={(e) => updateParam(index, 'default', e.target.value)}
          placeholder="0"
          maxLength={20}
        />
      </div>
      <div className={styles.listItemFieldGrow}>
        <label className={styles.label}>Label</label>
        <input
          type="text"
          className={styles.input}
          value={param.label}
          onChange={(e) => updateParam(index, 'label', e.target.value)}
          placeholder="Gain"
          maxLength={30}
        />
      </div>
      {param.type === 'number' && (
        <>
          <div className={styles.listItemFieldSmall}>
            <label className={styles.label}>Min</label>
            <input
              type="text"
              className={styles.input}
              value={param.min}
              onChange={(e) => updateParam(index, 'min', e.target.value)}
              placeholder="-100"
              maxLength={6}
            />
          </div>
          <div className={styles.listItemFieldSmall}>
            <label className={styles.label}>Max</label>
            <input
              type="text"
              className={styles.input}
              value={param.max}
              onChange={(e) => updateParam(index, 'max', e.target.value)}
              placeholder="100"
              maxLength={6}
            />
          </div>
          <div className={styles.listItemFieldSmall}>
            <label className={styles.label}>Step</label>
            <input
              type="text"
              className={styles.input}
              value={param.step}
              onChange={(e) => updateParam(index, 'step', e.target.value)}
              placeholder="1"
              maxLength={6}
            />
          </div>
        </>
      )}
      {param.type === 'string' && (
        <div className={styles.listItemFieldGrow}>
          <label className={styles.label}>Options (comma-separated)</label>
          <input
            type="text"
            className={styles.optionsInput}
            value={param.options}
            onChange={(e) => updateParam(index, 'options', e.target.value)}
            placeholder="Add, Subtract, Average"
          />
        </div>
      )}
      <button className={styles.removeButton} onClick={() => removeParam(index)}>
        Remove
      </button>
    </div>
  );

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className={styles.backdrop}>
      <div className={styles.panel} onKeyDown={handleKeyDown}>
        <div className={styles.header}>
          <h2 className={styles.title}>New Node Definition</h2>
          <p className={styles.subtitle}>
            Fill in the fields below, then generate the TypeScript definition file
          </p>
        </div>

        {/* Tabs */}
        <div style={{ padding: '16px 24px 0' }}>
          <div className={styles.tabs}>
            <button
              className={activeTab === 'form' ? styles.tabActive : styles.tab}
              onClick={() => setActiveTab('form')}
            >
              Form
            </button>
            <button
              className={activeTab === 'preview' ? styles.tabActive : styles.tab}
              onClick={() => { setActiveTab('preview'); setError(''); }}
            >
              Code Preview
            </button>
          </div>
        </div>

        <div className={styles.content}>
          {activeTab === 'form' ? (
            <>
              {/* ── Identity ───────────────────────────────── */}
              <div className={styles.row}>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor="ncf-type">Type (kebab-case)</label>
                  <input
                    ref={typeInputRef}
                    id="ncf-type"
                    type="text"
                    className={styles.input}
                    value={nodeType}
                    onChange={(e) => { setNodeType(e.target.value); setError(''); }}
                    placeholder="low-pass-filter"
                    maxLength={40}
                  />
                  <span className={styles.hint}>Unique ID: "{toKebab(nodeType) || '...'}"</span>
                </div>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor="ncf-category">Category</label>
                  <select
                    id="ncf-category"
                    className={styles.select}
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                  >
                    <option value="math">Math</option>
                    <option value="routing">Routing</option>
                    <option value="timing">Timing</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="ncf-desc">Description</label>
                <input
                  id="ncf-desc"
                  type="text"
                  className={styles.input}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Brief description of what this chip does"
                  maxLength={120}
                />
              </div>

              {/* ── Size ───────────────────────────────────── */}
              <div className={styles.row}>
                <div className={styles.field}>
                  <label className={styles.label}>Width (grid cells)</label>
                  <input
                    type="number"
                    className={styles.inputSmall}
                    value={width}
                    onChange={(e) => setWidth(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
                    min={1}
                    max={10}
                  />
                  <span className={styles.hint}>Simple: 3, Modulated: 4, Utility: 5</span>
                </div>
                <div className={styles.field}>
                  <label className={styles.label}>Height (grid cells)</label>
                  <input
                    type="number"
                    className={styles.inputSmall}
                    value={height}
                    onChange={(e) => setHeight(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
                    min={1}
                    max={10}
                  />
                  <span className={styles.hint}>Simple: 2, Multi-port: 3</span>
                </div>
              </div>

              {/* ── Inputs ─────────────────────────────────── */}
              <div className={styles.section}>
                <div className={styles.sectionHeader}>
                  <h3 className={styles.sectionTitle}>Input Ports</h3>
                </div>
                {inputs.map((port, i) => renderPortRow(port, i, updateInput, removeInput, inputs.length > 1))}
                <button className={styles.addButton} onClick={addInput}>+ Add Input</button>
              </div>

              {/* ── Outputs ────────────────────────────────── */}
              <div className={styles.section}>
                <div className={styles.sectionHeader}>
                  <h3 className={styles.sectionTitle}>Output Ports</h3>
                </div>
                {outputs.map((port, i) => renderPortRow(port, i, updateOutput, removeOutput, outputs.length > 1))}
                <button className={styles.addButton} onClick={addOutput}>+ Add Output</button>
              </div>

              {/* ── Parameters ─────────────────────────────── */}
              <div className={styles.section}>
                <div className={styles.sectionHeader}>
                  <h3 className={styles.sectionTitle}>Parameters</h3>
                </div>
                {params.length === 0 && (
                  <p className={styles.emptyHint}>No parameters. Click below to add one.</p>
                )}
                {params.map((param, i) => renderParamRow(param, i))}
                <button className={styles.addButton} onClick={addParam}>+ Add Parameter</button>
              </div>

              {/* ── Stateful ───────────────────────────────── */}
              <div className={styles.section}>
                <div className={styles.sectionHeader}>
                  <h3 className={styles.sectionTitle}>Runtime State</h3>
                </div>
                <label className={styles.checkboxRow}>
                  <input
                    type="checkbox"
                    checked={isStateful}
                    onChange={(e) => setIsStateful(e.target.checked)}
                  />
                  <span>This node needs persistent state across ticks (e.g. delay buffer)</span>
                </label>
                {isStateful && (
                  <div className={styles.field} style={{ marginTop: 12 }}>
                    <label className={styles.label}>State interface fields</label>
                    <textarea
                      className={styles.textarea}
                      value={stateFields}
                      onChange={(e) => setStateFields(e.target.value)}
                      placeholder={"  buffer: number[];\n  writeIndex: number;"}
                      rows={4}
                    />
                    <span className={styles.hint}>TypeScript interface body (inside the braces)</span>
                  </div>
                )}
              </div>

              {/* ── Evaluate ───────────────────────────────── */}
              <div className={styles.section}>
                <div className={styles.sectionHeader}>
                  <h3 className={styles.sectionTitle}>Evaluate Function Body</h3>
                </div>
                <textarea
                  className={styles.textarea}
                  value={evaluateBody}
                  onChange={(e) => setEvaluateBody(e.target.value)}
                  placeholder={`const [a] = inputs;\nreturn [clamp(-a)];`}
                  rows={6}
                  style={{ fontFamily: "'Consolas', 'Monaco', 'Courier New', monospace", fontSize: 13 }}
                />
                <span className={styles.hint}>
                  Available: inputs (Signal[]), params (your params type)
                  {isStateful ? ', state (cast to your State type)' : ''}.
                  Must return Signal[] matching output count. Always clamp() results.
                </span>
              </div>

              {error && <div className={styles.error}>{error}</div>}
            </>
          ) : (
            /* ── Code Preview ───────────────────────────── */
            <div className={styles.codePreview}>
              <div className={styles.codePreviewHeader}>
                <h3 className={styles.sectionTitle}>
                  {toKebab(nodeType) || 'node'}.ts
                </h3>
                <button
                  className={copied ? styles.copiedButton : styles.copyButton}
                  onClick={handleCopy}
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <pre className={styles.codeBlock}>{generatedCode}</pre>
            </div>
          )}
        </div>

        <div className={styles.footer}>
          <button className={styles.cancelButton} onClick={closeOverlay}>Close</button>
          {activeTab === 'form' ? (
            <button className={styles.generateButton} onClick={handleGenerate}>
              Generate Code
            </button>
          ) : (
            <button className={styles.generateButton} onClick={handleCopy}>
              {copied ? 'Copied!' : 'Copy to Clipboard'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

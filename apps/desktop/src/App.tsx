import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CompiledTemplate,
  GameTemplate,
  ReplayRecord,
  SerializedRngState,
  TemplateValidationError,
  autoplay,
  compileTemplate,
  highestPriorityPolicy,
  meteorMinersTemplate,
  validateTemplate,
  Xorshift128Plus,
} from '@rwf/core';
import { commandsFromReplay, createDefaultSeed, SessionCommand, simulateSession } from './session/simulation';
import { evaluateScore, ScoreBreakdown } from './utils/scoring';
import { formatEvent } from './utils/events';
import './App.css';

type EditorMode = 'form' | 'json';
type ActiveTab = 'editor' | 'play';

type TemplateUpdater = (current: GameTemplate) => GameTemplate;

interface StoredReplay {
  id: string;
  key: string;
  savedAt: string;
  record: ReplayRecord;
}

function cloneTemplate(template: GameTemplate): GameTemplate {
  return JSON.parse(JSON.stringify(template)) as GameTemplate;
}

function bumpPatch(version: string): string {
  const [major = '0', minor = '0', patch = '0'] = version.split('.');
  const nextPatch = Number.parseInt(patch, 10) + 1;
  return `${major}.${minor}.${Number.isFinite(nextPatch) ? nextPatch : 0}`;
}

function replayKey(record: ReplayRecord): string {
  return [
    record.templateId,
    record.templateVersion,
    record.seed.state.join(':'),
    record.finalScore,
    record.turns.length,
  ].join('|');
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
}

const initialTemplate = cloneTemplate(meteorMinersTemplate);

function App(): JSX.Element {
  const [activeTab, setActiveTab] = useState<ActiveTab>('editor');
  const [templateDraft, setTemplateDraft] = useState<GameTemplate>(initialTemplate);
  const [templateSource, setTemplateSource] = useState<string>(
    JSON.stringify(initialTemplate, null, 2),
  );
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [editorMode, setEditorMode] = useState<EditorMode>('form');
  const [validationIssues, setValidationIssues] = useState<string[]>([]);
  const [compiledTemplate, setCompiledTemplate] = useState<CompiledTemplate>(() =>
    compileTemplate(initialTemplate),
  );
  const [isTemplateValid, setIsTemplateValid] = useState(true);
  const [editorLog, setEditorLog] = useState<string[]>([
    `${formatTimestamp(new Date().toISOString())} — Loaded Meteor Miners template`,
  ]);

  const appendLog = useCallback((message: string) => {
    const entry = `${formatTimestamp(new Date().toISOString())} — ${message}`;
    setEditorLog((previous) => [entry, ...previous].slice(0, 40));
  }, []);

  const updateTemplate = useCallback(
    (updater: TemplateUpdater) => {
      setTemplateDraft((current) => {
        const base = cloneTemplate(current);
        const next = updater(base);
        setTemplateSource(JSON.stringify(next, null, 2));
        setJsonError(null);
        return next;
      });
    },
    [],
  );

  const handleJsonChange = useCallback(
    (source: string) => {
      setTemplateSource(source);
      try {
        const parsed = JSON.parse(source) as GameTemplate;
        setJsonError(null);
        setTemplateDraft(parsed);
        appendLog('JSON editor updated the template draft');
      } catch (cause) {
        setJsonError(cause instanceof Error ? cause.message : String(cause));
      }
    },
    [appendLog],
  );

  const handleTemplateUpload = useCallback(
    async (file: File) => {
      const contents = await file.text();
      setTemplateSource(contents);
      setJsonError(null);
      try {
        const parsed = JSON.parse(contents) as GameTemplate;
        setTemplateDraft(parsed);
        try {
          validateTemplate(parsed);
          appendLog(`Imported template from ${file.name}`);
          setEditorMode('form');
        } catch (validationError) {
          if (validationError instanceof TemplateValidationError) {
            appendLog(`Imported ${file.name} but validation failed — switched to JSON mode for fixes.`);
            setEditorMode('json');
          } else if (validationError instanceof Error) {
            throw validationError;
          }
        }
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        setJsonError(message);
        setEditorMode('json');
        appendLog(`Failed to parse ${file.name}: ${message}`);
      }
    },
    [appendLog],
  );

  useEffect(() => {
    try {
      const validated = validateTemplate(templateDraft);
      setValidationIssues([]);
      setCompiledTemplate(compileTemplate(validated));
      setIsTemplateValid(true);
    } catch (cause) {
      if (cause instanceof TemplateValidationError) {
        setValidationIssues(cause.issues);
        setIsTemplateValid(false);
      } else if (cause instanceof Error) {
        setValidationIssues([cause.message]);
        setIsTemplateValid(false);
      }
    }
  }, [templateDraft]);

  const validationWasValid = useRef(true);
  useEffect(() => {
    if (!isTemplateValid && validationWasValid.current) {
      appendLog('Template validation failed. Review the inspector panel for details.');
    }
    if (isTemplateValid && !validationWasValid.current) {
      appendLog('Template validation issues resolved.');
    }
    validationWasValid.current = isTemplateValid;
  }, [isTemplateValid, appendLog]);

  const [previewCommands, setPreviewCommands] = useState<SessionCommand[]>([]);
  const [previewPointer, setPreviewPointer] = useState(0);
  const [previewSeed, setPreviewSeed] = useState<SerializedRngState>(() => createDefaultSeed());

  useEffect(() => {
    setPreviewCommands([]);
    setPreviewPointer(0);
    setPreviewSeed(createDefaultSeed());
  }, [compiledTemplate]);

  const previewResult = useMemo(() => {
    if (!isTemplateValid) {
      return null;
    }
    return simulateSession(compiledTemplate, previewSeed, previewCommands, previewPointer);
  }, [compiledTemplate, isTemplateValid, previewSeed, previewCommands, previewPointer]);

  const previewScore: ScoreBreakdown | null = useMemo(() => {
    if (!previewResult) {
      return null;
    }
    return evaluateScore(compiledTemplate, previewResult.snapshot);
  }, [compiledTemplate, previewResult]);

  const [playCommands, setPlayCommands] = useState<SessionCommand[]>([]);
  const [playPointer, setPlayPointer] = useState(0);
  const [playSeed, setPlaySeed] = useState<SerializedRngState>(() => new Xorshift128Plus(42).serialize());
  const [seedInput, setSeedInput] = useState('42');
  const [storedReplays, setStoredReplays] = useState<StoredReplay[]>([]);

  useEffect(() => {
    setPlayCommands([]);
    setPlayPointer(0);
  }, [compiledTemplate]);

  const playResult = useMemo(() => {
    if (!isTemplateValid) {
      return null;
    }
    return simulateSession(compiledTemplate, playSeed, playCommands, playPointer);
  }, [compiledTemplate, isTemplateValid, playSeed, playCommands, playPointer]);

  const playScore: ScoreBreakdown | null = useMemo(() => {
    if (!playResult) {
      return null;
    }
    return evaluateScore(compiledTemplate, playResult.snapshot);
  }, [compiledTemplate, playResult]);

  useEffect(() => {
    if (!playResult || !playResult.replay) {
      return;
    }
    const key = replayKey(playResult.replay);
    setStoredReplays((current) => {
      if (current.some((entry) => entry.key === key)) {
        return current;
      }
      const entry: StoredReplay = {
        id: `${key}-${current.length}`,
        key,
        savedAt: new Date().toISOString(),
        record: playResult.replay,
      };
      return [entry, ...current];
    });
  }, [playResult]);

  const handlePreviewCommand = useCallback(
    (command: SessionCommand) => {
      setPreviewCommands((current) => {
        const next = current.slice(0, previewPointer);
        next.push(command);
        return next;
      });
      setPreviewPointer((value) => value + 1);
    },
    [previewPointer],
  );

  const resetPreview = useCallback(() => {
    setPreviewCommands([]);
    setPreviewPointer(0);
    setPreviewSeed(createDefaultSeed());
  }, []);

  const handlePlayCommand = useCallback(
    (command: SessionCommand) => {
      setPlayCommands((current) => {
        const next = current.slice(0, playPointer);
        next.push(command);
        return next;
      });
      setPlayPointer((value) => value + 1);
    },
    [playPointer],
  );

  const undoPlay = useCallback(() => {
    setPlayPointer((value) => Math.max(0, value - 1));
  }, []);

  const redoPlay = useCallback(() => {
    setPlayPointer((value) => Math.min(playCommands.length, value + 1));
  }, [playCommands.length]);

  const resetPlay = useCallback(() => {
    setPlayCommands([]);
    setPlayPointer(0);
  }, []);

  const applySeed = useCallback(() => {
    let nextSeed: SerializedRngState;
    if (seedInput.includes(':')) {
      const [left, right] = seedInput.split(':');
      nextSeed = {
        algorithm: 'xorshift128+',
        state: [left.trim(), (right ?? left).trim()],
      };
    } else {
      const generator = new Xorshift128Plus(seedInput);
      nextSeed = generator.serialize();
    }
    setPlaySeed(nextSeed);
    setPlayCommands([]);
    setPlayPointer(0);
  }, [seedInput]);

  const autoPlay = useCallback(() => {
    if (!isTemplateValid) {
      return;
    }
    const replay = autoplay(compiledTemplate, highestPriorityPolicy, { seed: playSeed });
    const commands = commandsFromReplay(replay);
    setPlayCommands(commands);
    setPlayPointer(commands.length);
  }, [compiledTemplate, isTemplateValid, playSeed]);

  const loadReplay = useCallback((record: ReplayRecord) => {
    setPlaySeed(record.seed);
    const commands = commandsFromReplay(record);
    setPlayCommands(commands);
    setPlayPointer(commands.length);
    setSeedInput(`${record.seed.state[0]}:${record.seed.state[1]}`);
  }, []);

  const saveTemplate = useCallback(() => {
    updateTemplate((current) => ({
      ...current,
      version: bumpPatch(current.version),
    }));
    appendLog('Saved template with automatic patch version bump.');
  }, [appendLog, updateTemplate]);

  const resetTemplate = useCallback(() => {
    const fresh = cloneTemplate(meteorMinersTemplate);
    setTemplateDraft(fresh);
    setTemplateSource(JSON.stringify(fresh, null, 2));
    setEditorMode('form');
    appendLog('Template reset to the Meteor Miners baseline.');
  }, [appendLog]);

  return (
    <main className="app">
      <header className="app__header">
        <h1 className="app__title">Roll &amp; Write Foundry</h1>
        <nav className="app__nav" aria-label="Primary">
          <button
            type="button"
            aria-pressed={activeTab === 'editor'}
            onClick={() => setActiveTab('editor')}
            data-testid="nav-editor"
          >
            Editor
          </button>
          <button
            type="button"
            aria-pressed={activeTab === 'play'}
            onClick={() => setActiveTab('play')}
            data-testid="nav-play"
            disabled={!isTemplateValid}
          >
            Play
          </button>
        </nav>
      </header>
      <section className="app__content">
        <aside className="panel" aria-label="Editor panel">
          <h2>Template Editor</h2>
          <div className="editor__mode-toggle" role="radiogroup" aria-label="Editor mode">
            <button
              type="button"
              aria-pressed={editorMode === 'form'}
              onClick={() => setEditorMode('form')}
              data-testid="mode-form"
            >
              Form
            </button>
            <button
              type="button"
              aria-pressed={editorMode === 'json'}
              onClick={() => setEditorMode('json')}
              data-testid="mode-json"
            >
              JSON
            </button>
          </div>
          {editorMode === 'json' ? (
            <textarea
              className="json-editor"
              value={templateSource}
              onChange={(event) => handleJsonChange(event.target.value)}
              aria-label="Template JSON"
              data-testid="json-editor"
            />
          ) : (
            <TemplateForm template={templateDraft} onChange={updateTemplate} />
          )}
          <div className="editor-actions">
            <label>
              <span>Upload template (.json)</span>
              <input
                type="file"
                accept="application/json"
                onChange={(event) => {
                  const [file] = event.target.files ?? [];
                  if (file) {
                    void handleTemplateUpload(file);
                  }
                }}
                data-testid="template-upload"
              />
            </label>
            <button type="button" onClick={saveTemplate} disabled={!isTemplateValid} data-testid="save-template">
              Save &amp; bump version
            </button>
            <button type="button" onClick={resetTemplate} data-testid="reset-template">
              Reset to sample
            </button>
          </div>
          {jsonError ? <p className="hint">JSON parse error: {jsonError}</p> : null}
        </aside>
        <section className="panel" aria-label="Preview panel">
          <h2>Board Preview</h2>
          {previewResult && previewScore ? (
            <PreviewPane
              template={compiledTemplate}
              result={previewResult}
              score={previewScore}
              onCommand={handlePreviewCommand}
              onReset={resetPreview}
            />
          ) : (
            <p>Preview is unavailable until the template passes validation.</p>
          )}
        </section>
        <aside className="panel" aria-label="Inspector panel">
          <InspectorPane
            activeTab={activeTab}
            validationIssues={validationIssues}
            editorLog={editorLog}
            previewResult={previewResult}
            playResult={playResult}
          />
        </aside>
      </section>
      {activeTab === 'play' && playResult && playScore ? (
        <section className="app__content" aria-label="Playground">
          <section className="panel">
            <h2>Session Controls</h2>
            <PlayPane
              result={playResult}
              score={playScore}
              commands={playCommands}
              pointer={playPointer}
              onCommand={handlePlayCommand}
              onUndo={undoPlay}
              onRedo={redoPlay}
              onReset={resetPlay}
              seedInput={seedInput}
              onSeedInput={setSeedInput}
              onApplySeed={applySeed}
              onAutoPlay={autoPlay}
              disableActions={!isTemplateValid}
            />
          </section>
          <section className="panel">
            <h2>Stored Replays</h2>
            <ReplayPane replays={storedReplays} onSelect={loadReplay} />
          </section>
          <section className="panel">
            <h2>Session Log</h2>
            {playResult.events.length === 0 ? (
              <p>No events recorded yet.</p>
            ) : (
              <ul className="log-list" data-testid="play-log">
                {playResult.events.map((event) => (
                  <li className="log-item" key={`${event.timestamp}-${event.type}`}>
                    {formatEvent(event)}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </section>
      ) : null}
    </main>
  );
}

interface TemplateFormProps {
  template: GameTemplate;
  onChange: (updater: TemplateUpdater) => void;
}

function TemplateForm({ template, onChange }: TemplateFormProps): JSX.Element {
  const [selectedNode, setSelectedNode] = useState<string>('metadata');

  const renderForm = () => {
    switch (selectedNode) {
      case 'metadata':
        return (
          <section className="editor-form" data-testid="form-metadata">
            <label>
              ID
              <input
                value={template.id}
                onChange={(event) =>
                  onChange((current) => ({ ...current, id: event.target.value }))
                }
              />
            </label>
            <label>
              Name
              <input
                value={template.name}
                onChange={(event) =>
                  onChange((current) => ({ ...current, name: event.target.value }))
                }
              />
            </label>
            <label>
              Description
              <textarea
                value={template.description ?? ''}
                onChange={(event) =>
                  onChange((current) => ({ ...current, description: event.target.value }))
                }
              />
            </label>
          </section>
        );
      case 'turn':
        return (
          <section className="editor-form">
            <label>
              Turn limit
              <input
                type="number"
                min={1}
                max={200}
                value={template.turn.limit}
                onChange={(event) =>
                  onChange((current) => ({
                    ...current,
                    turn: { ...current.turn, limit: Number(event.target.value) },
                  }))
                }
              />
            </label>
          </section>
        );
      case 'scoring':
        return (
          <section className="editor-form">
            <label>
              Total score expression
              <textarea
                value={template.scoring.total}
                onChange={(event) =>
                  onChange((current) => ({
                    ...current,
                    scoring: { ...current.scoring, total: event.target.value },
                  }))
                }
              />
            </label>
            {template.scoring.components ? (
              Object.entries(template.scoring.components).map(([key, expression]) => (
                <label key={key}>
                  Component “{key}”
                  <textarea
                    value={expression}
                    onChange={(event) =>
                      onChange((current) => ({
                        ...current,
                        scoring: {
                          ...current.scoring,
                          components: {
                            ...(current.scoring.components ?? {}),
                            [key]: event.target.value,
                          },
                        },
                      }))
                    }
                  />
                </label>
              ))
            ) : (
              <p>No score components defined.</p>
            )}
          </section>
        );
      default:
        if (selectedNode.startsWith('resource:')) {
          const id = selectedNode.split(':')[1];
          const resource = template.resources.find((item) => item.id === id);
          if (!resource) {
            return <p>Resource not found.</p>;
          }
          return (
            <section className="editor-form" data-testid={`resource-${id}`}>
              <label>
                Label
                <input
                  value={resource.label}
                  onChange={(event) =>
                    onChange((current) => ({
                      ...current,
                      resources: current.resources.map((item) =>
                        item.id === id ? { ...item, label: event.target.value } : item,
                      ),
                    }))
                  }
                />
              </label>
              <label>
                Initial amount
                <input
                  type="number"
                  value={resource.initial}
                  onChange={(event) =>
                    onChange((current) => ({
                      ...current,
                      resources: current.resources.map((item) =>
                        item.id === id ? { ...item, initial: Number(event.target.value) } : item,
                      ),
                    }))
                  }
                />
              </label>
              <label>
                Minimum
                <input
                  type="number"
                  value={resource.min ?? ''}
                  onChange={(event) =>
                    onChange((current) => ({
                      ...current,
                      resources: current.resources.map((item) =>
                        item.id === id
                          ? {
                              ...item,
                              min:
                                event.target.value === '' ? undefined : Number(event.target.value),
                            }
                          : item,
                      ),
                    }))
                  }
                />
              </label>
              <label>
                Maximum
                <input
                  type="number"
                  value={resource.max ?? ''}
                  onChange={(event) =>
                    onChange((current) => ({
                      ...current,
                      resources: current.resources.map((item) =>
                        item.id === id
                          ? {
                              ...item,
                              max:
                                event.target.value === '' ? undefined : Number(event.target.value),
                            }
                          : item,
                      ),
                    }))
                  }
                />
              </label>
            </section>
          );
        }
        if (selectedNode.startsWith('action:')) {
          const id = selectedNode.split(':')[1];
          const action = template.actions.find((item) => item.id === id);
          if (!action) {
            return <p>Action not found.</p>;
          }
          return (
            <section className="editor-form" data-testid={`action-${id}`}>
              <label>
                Label
                <input
                  value={action.label}
                  onChange={(event) =>
                    onChange((current) => ({
                      ...current,
                      actions: current.actions.map((item) =>
                        item.id === id ? { ...item, label: event.target.value } : item,
                      ),
                    }))
                  }
                />
              </label>
              <label>
                Priority
                <input
                  type="number"
                  value={action.priority}
                  onChange={(event) =>
                    onChange((current) => ({
                      ...current,
                      actions: current.actions.map((item) =>
                        item.id === id ? { ...item, priority: Number(event.target.value) } : item,
                      ),
                    }))
                  }
                />
              </label>
              <label>
                Condition expression
                <textarea
                  value={action.condition ?? ''}
                  onChange={(event) =>
                    onChange((current) => ({
                      ...current,
                      actions: current.actions.map((item) =>
                        item.id === id
                          ? { ...item, condition: event.target.value || undefined }
                          : item,
                      ),
                    }))
                  }
                />
              </label>
              {action.effects.map((effect, index) => (
                <label key={`${effect.resource}-${index}`}>
                  Effect on {effect.resource}
                  <textarea
                    value={effect.expression}
                    onChange={(event) =>
                      onChange((current) => ({
                        ...current,
                        actions: current.actions.map((item) =>
                          item.id === id
                            ? {
                                ...item,
                                effects: item.effects.map((candidate, effectIndex) =>
                                  effectIndex === index
                                    ? { ...candidate, expression: event.target.value }
                                    : candidate,
                                ),
                              }
                            : item,
                        ),
                      }))
                    }
                  />
                </label>
              ))}
            </section>
          );
        }
        if (selectedNode.startsWith('end:')) {
          const index = Number.parseInt(selectedNode.split(':')[1] ?? '0', 10);
          const condition = template.endConditions[index];
          if (!condition) {
            return <p>End condition not found.</p>;
          }
          if (condition.type === 'turnLimit') {
            return (
              <section className="editor-form">
                <label>
                  Turn limit
                  <input
                    type="number"
                    value={condition.limit}
                    onChange={(event) =>
                      onChange((current) => ({
                        ...current,
                        endConditions: current.endConditions.map((item, idx) =>
                          idx === index
                            ? { ...item, limit: Number(event.target.value) }
                            : item,
                        ),
                      }))
                    }
                  />
                </label>
              </section>
            );
          }
          return (
            <section className="editor-form">
              <label>
                Resource
                <input
                  value={condition.resource}
                  onChange={(event) =>
                    onChange((current) => ({
                      ...current,
                      endConditions: current.endConditions.map((item, idx) =>
                        idx === index ? { ...item, resource: event.target.value } : item,
                      ),
                    }))
                  }
                />
              </label>
              <label>
                Comparison
                <select
                  value={condition.comparison}
                  onChange={(event) =>
                    onChange((current) => ({
                      ...current,
                      endConditions: current.endConditions.map((item, idx) =>
                        idx === index
                          ? { ...item, comparison: event.target.value as typeof condition.comparison }
                          : item,
                      ),
                    }))
                  }
                >
                  <option value=">">{'>'}</option>
                  <option value=">=">{'>='}</option>
                  <option value="<">{'<'}</option>
                  <option value="<=">{'<='}</option>
                  <option value="==">{'=='}</option>
                  <option value="!=">{'!='}</option>
                </select>
              </label>
              <label>
                Threshold value
                <input
                  type="number"
                  value={condition.value}
                  onChange={(event) =>
                    onChange((current) => ({
                      ...current,
                      endConditions: current.endConditions.map((item, idx) =>
                        idx === index ? { ...item, value: Number(event.target.value) } : item,
                      ),
                    }))
                  }
                />
              </label>
            </section>
          );
        }
        return <p>Select a section from the tree.</p>;
    }
  };

  return (
    <div className="template-tree" data-testid="template-tree">
      <ul>
        <li>
          <button type="button" onClick={() => setSelectedNode('metadata')} data-active={selectedNode === 'metadata'}>
            Metadata
          </button>
        </li>
        <li>
          <button type="button" onClick={() => setSelectedNode('turn')} data-active={selectedNode === 'turn'}>
            Turn structure
          </button>
        </li>
        <li>
          <button type="button" onClick={() => setSelectedNode('scoring')} data-active={selectedNode === 'scoring'}>
            Scoring
          </button>
        </li>
        <li>
          <strong>Resources</strong>
        </li>
        {template.resources.map((resource) => (
          <li key={resource.id}>
            <button
              type="button"
              onClick={() => setSelectedNode(`resource:${resource.id}`)}
              data-active={selectedNode === `resource:${resource.id}`}
            >
              {resource.label} ({resource.id})
            </button>
          </li>
        ))}
        <li>
          <strong>Actions</strong>
        </li>
        {template.actions.map((action) => (
          <li key={action.id}>
            <button
              type="button"
              onClick={() => setSelectedNode(`action:${action.id}`)}
              data-active={selectedNode === `action:${action.id}`}
            >
              {action.label} ({action.id})
            </button>
          </li>
        ))}
        <li>
          <strong>End conditions</strong>
        </li>
        {template.endConditions.map((condition, index) => (
          <li key={`end-${index}`}>
            <button
              type="button"
              onClick={() => setSelectedNode(`end:${index}`)}
              data-active={selectedNode === `end:${index}`}
            >
              {condition.type}
            </button>
          </li>
        ))}
      </ul>
      <div className="editor-form" style={{ marginTop: '1rem' }}>
        {renderForm()}
      </div>
    </div>
  );
}

interface PreviewPaneProps {
  template: CompiledTemplate;
  result: ReturnType<typeof simulateSession>;
  score: ScoreBreakdown;
  onCommand: (command: SessionCommand) => void;
  onReset: () => void;
}

function PreviewPane({ template, result, score, onCommand, onReset }: PreviewPaneProps): JSX.Element {
  const { snapshot, error } = result;
  return (
    <div className="preview-grid" data-testid="preview-pane">
      <section className="score-board">
        <strong>Score preview: {score.total.toFixed(0)}</strong>
        {score.components ? (
          <div className="score-components">
            {Object.entries(score.components).map(([key, value]) => (
              <span key={key}>
                {key}: {value.toFixed(0)}
              </span>
            ))}
          </div>
        ) : null}
      </section>
      <section className="preview-resources" aria-label="Resource summary">
        {template.resources.map((resource) => (
          <article className="resource-card" key={resource.id} data-testid={`resource-card-${resource.id}`}>
            <strong>{resource.label}</strong>
            <span>Value: {snapshot.resources[resource.id]}</span>
            <small>Min: {resource.min ?? '—'} · Max: {resource.max ?? '—'}</small>
          </article>
        ))}
      </section>
      <section>
        <div className="preview-actions">
          <button
            type="button"
            onClick={() => onCommand({ type: 'roll' })}
            disabled={snapshot.phase !== 'roll'}
            data-testid="preview-roll"
          >
            Roll dice
          </button>
          <button
            type="button"
            className="secondary"
            onClick={onReset}
            data-testid="preview-reset"
          >
            Reset preview
          </button>
        </div>
        {snapshot.roll ? (
          <p>
            Last roll: [{snapshot.roll.values.join(', ')}] → {snapshot.roll.total}
          </p>
        ) : (
          <p>Click roll to simulate the first turn.</p>
        )}
        {snapshot.availableActions.length > 0 ? (
          <div className="preview-actions" data-testid="preview-actions">
            {snapshot.availableActions.map((action) => (
              <button
                key={action.id}
                type="button"
                onClick={() => onCommand({ type: 'choose', actionId: action.id })}
              >
                {action.label}
              </button>
            ))}
            {snapshot.phase === 'apply' ? (
              <button type="button" onClick={() => onCommand({ type: 'apply' })}>
                Apply
              </button>
            ) : null}
            {snapshot.phase === 'end' ? (
              <button type="button" onClick={() => onCommand({ type: 'endTurn' })}>
                End turn
              </button>
            ) : null}
          </div>
        ) : (
          <p>Actions will appear after rolling.</p>
        )}
        {error ? <p className="hint">Simulation warning: {error}</p> : null}
      </section>
    </div>
  );
}

interface InspectorPaneProps {
  activeTab: ActiveTab;
  validationIssues: string[];
  editorLog: string[];
  previewResult: ReturnType<typeof simulateSession> | null;
  playResult: ReturnType<typeof simulateSession> | null;
}

function InspectorPane({
  activeTab,
  validationIssues,
  editorLog,
  previewResult,
  playResult,
}: InspectorPaneProps): JSX.Element {
  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Inspector</h2>
      {validationIssues.length > 0 ? (
        <section>
          <h3>Validation issues</h3>
          <ul className="validation-list" data-testid="validation-issues">
            {validationIssues.map((issue, index) => (
              <li key={`${issue}-${index}`}>{issue}</li>
            ))}
          </ul>
        </section>
      ) : (
        <p>No validation issues detected.</p>
      )}
      {activeTab === 'editor' ? (
        <section>
          <h3>Preview events</h3>
          {previewResult && previewResult.events.length > 0 ? (
            <ul className="log-list" data-testid="preview-log">
              {previewResult.events.map((event) => (
                <li className="log-item" key={`${event.timestamp}-${event.type}`}>
                  {formatEvent(event)}
                </li>
              ))}
            </ul>
          ) : (
            <p>Interact with the preview to see event history.</p>
          )}
          <h3>Editor activity</h3>
          <ul className="log-list" data-testid="editor-log">
            {editorLog.map((entry, index) => (
              <li className="log-item" key={`${entry}-${index}`}>
                {entry}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {activeTab === 'play' ? (
        <section>
          <h3>Latest session snapshot</h3>
          {playResult ? (
            <p>
              Phase: {playResult.snapshot.phase} — Turn {playResult.snapshot.turn}
            </p>
          ) : (
            <p>Open the Play tab to begin a session.</p>
          )}
        </section>
      ) : null}
    </div>
  );
}

interface PlayPaneProps {
  result: ReturnType<typeof simulateSession>;
  score: ScoreBreakdown;
  commands: SessionCommand[];
  pointer: number;
  onCommand: (command: SessionCommand) => void;
  onUndo: () => void;
  onRedo: () => void;
  onReset: () => void;
  seedInput: string;
  onSeedInput: (value: string) => void;
  onApplySeed: () => void;
  onAutoPlay: () => void;
  disableActions: boolean;
}

function PlayPane({
  result,
  score,
  pointer,
  commands,
  onCommand,
  onUndo,
  onRedo,
  onReset,
  seedInput,
  onSeedInput,
  onApplySeed,
  onAutoPlay,
  disableActions,
}: PlayPaneProps): JSX.Element {
  const { snapshot, error } = result;
  const recommended = snapshot.availableActions.length > 0 ? highestPriorityPolicy({
    session: snapshot,
    actions: snapshot.availableActions,
  }) : null;

  return (
    <div className="play-controls" data-testid="play-pane">
      <section className="score-board">
        <strong>Current score: {score.total.toFixed(0)}</strong>
        {score.components ? (
          <div className="score-components">
            {Object.entries(score.components).map(([key, value]) => (
              <span key={key}>
                {key}: {value.toFixed(0)}
              </span>
            ))}
          </div>
        ) : null}
      </section>
      <section className="editor-form">
        <label>
          Session seed
          <input
            value={seedInput}
            onChange={(event) => onSeedInput(event.target.value)}
            data-testid="seed-input"
          />
        </label>
        <div className="play-actions">
          <button type="button" onClick={onApplySeed} data-testid="apply-seed">
            Apply seed
          </button>
          <button type="button" onClick={onAutoPlay} data-testid="auto-play">
            Auto play
          </button>
        </div>
      </section>
      <section>
        <div className="play-actions">
          <button
            type="button"
            onClick={() => onCommand({ type: 'roll' })}
            disabled={snapshot.phase !== 'roll' || disableActions}
            data-testid="play-roll"
          >
            Roll
          </button>
          <button
            type="button"
            onClick={onUndo}
            disabled={pointer === 0 || disableActions}
            data-testid="play-undo"
          >
            Undo
          </button>
          <button
            type="button"
            onClick={onRedo}
            disabled={pointer >= commands.length || disableActions}
            data-testid="play-redo"
          >
            Redo
          </button>
          <button type="button" onClick={onReset} data-testid="play-reset">
            Reset
          </button>
        </div>
        {recommended ? <p className="hint">Hint: Try action “{recommended}”.</p> : null}
        <div className="play-actions">
          {snapshot.availableActions.map((action) => (
            <button
              key={action.id}
              type="button"
              onClick={() => onCommand({ type: 'choose', actionId: action.id })}
              disabled={snapshot.phase !== 'choose' || disableActions}
              data-testid={`action-${action.id}`}
            >
              {action.label}
            </button>
          ))}
          {snapshot.phase === 'apply' ? (
            <button type="button" onClick={() => onCommand({ type: 'apply' })} disabled={disableActions}>
              Apply
            </button>
          ) : null}
          {snapshot.phase === 'end' ? (
            <button type="button" onClick={() => onCommand({ type: 'endTurn' })} disabled={disableActions}>
              End turn
            </button>
          ) : null}
        </div>
        {snapshot.roll ? (
          <p>
            Roll: [{snapshot.roll.values.join(', ')}] total {snapshot.roll.total}
          </p>
        ) : (
          <p>Roll dice to begin the first turn.</p>
        )}
        {error ? <p className="hint">{error}</p> : null}
      </section>
    </div>
  );
}

interface ReplayPaneProps {
  replays: StoredReplay[];
  onSelect: (record: ReplayRecord) => void;
}

function ReplayPane({ replays, onSelect }: ReplayPaneProps): JSX.Element {
  if (replays.length === 0) {
    return <p>No replays captured yet. Complete a session to capture one automatically.</p>;
  }
  return (
    <div className="replay-list" data-testid="replay-list">
      {replays.map((replay) => (
        <article className="replay-card" key={replay.id}>
          <strong>
            {replay.record.templateId} v{replay.record.templateVersion}
          </strong>
          <p>Score: {replay.record.finalScore}</p>
          <p>Saved: {formatTimestamp(replay.savedAt)}</p>
          <button type="button" onClick={() => onSelect(replay.record)} data-testid={`replay-${replay.id}`}>
            Load replay
          </button>
        </article>
      ))}
    </div>
  );
}

export default App;

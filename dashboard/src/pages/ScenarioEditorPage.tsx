import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import {
  ArrowLeft, Save, Plus, Trash2, GripVertical, ChevronDown, ChevronRight,
  Eye, EyeOff, Copy, ArrowUp, ArrowDown, Shield, Variable, Tag, FileCode,
  GitBranch, Download, Wand2, CheckSquare, Link2, RotateCcw,
} from 'lucide-react';

const EVENT_TYPES = [
  'navigate', 'click', 'fill', 'type', 'select', 'check', 'press',
  'scroll', 'hover', 'wait', 'waitFor', 'setVariable', 'apiRequest',
  'assertion', 'if', 'else', 'endIf', 'forEach', 'endForEach',
  'block', 'endBlock', 'include', 'screenshot', 'dialog',
];

const inputClass = 'w-full px-3 py-2 bg-card2 border border-border rounded-lg text-white text-sm focus:ring-1 focus:ring-accent focus:border-accent outline-none transition-colors';

export default function ScenarioEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [scenario, setScenario] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expandedStep, setExpandedStep] = useState<number | null>(null);
  const [showAddStep, setShowAddStep] = useState(false);
  const [addAfterIdx, setAddAfterIdx] = useState(-1);
  const [newEvent, setNewEvent] = useState({ type: 'click', selector: '', value: '' });
  const [showVars, setShowVars] = useState(false);
  const [showMeta, setShowMeta] = useState(false);
  const [editingStep, setEditingStep] = useState<any>(null);
  const [showFlowGraph, setShowFlowGraph] = useState(false);
  const [flowGraphData, setFlowGraphData] = useState<any>(null);
  const [flowLoading, setFlowLoading] = useState(false);
  const [showOnFail, setShowOnFail] = useState<number | null>(null);
  const [showIncludes, setShowIncludes] = useState(false);
  const [allScenarios, setAllScenarios] = useState<any[]>([]);
  const [showRerecord, setShowRerecord] = useState(false);
  const [rerecordFrom, setRerecordFrom] = useState(0);
  const [rerecordTo, setRerecordTo] = useState(0);
  const [rerecordRequest, setRerecordRequest] = useState<any>(null);
  const [rerecordEvents, setRerecordEvents] = useState('');
  const [rerecordLoading, setRerecordLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const s = await api.getScenario(id!);
      setScenario(s);
    } catch (err: any) {
      alert(err.message);
      navigate('/scenarios');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);
  useEffect(() => { api.getScenarios().then(setAllScenarios).catch(() => []); }, []);

  const events = scenario?.scenarioData?.events || [];

  const handleInsertStep = async () => {
    try {
      const updated = await api.insertStep(id!, addAfterIdx, newEvent);
      setScenario(updated);
      setShowAddStep(false);
      setNewEvent({ type: 'click', selector: '', value: '' });
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDeleteStep = async (idx: number) => {
    if (!confirm(`Delete step ${idx + 1}?`)) return;
    try {
      const updated = await api.deleteStep(id!, idx);
      setScenario(updated);
      if (expandedStep === idx) setExpandedStep(null);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleToggleStep = async (idx: number) => {
    try {
      const updated = await api.toggleStep(id!, idx);
      setScenario(updated);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleMoveStep = async (idx: number, direction: 'up' | 'down') => {
    const toIndex = direction === 'up' ? idx - 1 : idx + 1;
    if (toIndex < 0 || toIndex >= events.length) return;
    try {
      const updated = await api.moveStep(id!, idx, toIndex);
      setScenario(updated);
      setExpandedStep(toIndex);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDuplicateStep = async (idx: number) => {
    try {
      const updated = await api.duplicateStep(id!, idx);
      setScenario(updated);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleUpdateStep = async (idx: number, updates: any) => {
    try {
      const updated = await api.updateStep(id!, idx, updates);
      setScenario(updated);
      setEditingStep(null);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleAddAssertion = async (idx: number) => {
    const assertion = { type: 'elementVisible', selector: '', expected: '' };
    try {
      const updated = await api.addAssertion(id!, idx, assertion);
      setScenario(updated);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleRemoveAssertion = async (stepIdx: number, assertionIdx: number) => {
    try {
      const updated = await api.removeAssertion(id!, stepIdx, assertionIdx);
      setScenario(updated);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleSaveMetadata = async () => {
    setSaving(true);
    try {
      await api.updateScenario(id!, {
        name: scenario.name,
        description: scenario.description,
        tags: scenario.tags,
      });
      setShowMeta(false);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSetVariables = async (variables: Record<string, string>) => {
    try {
      const updated = await api.setVariables(id!, variables);
      setScenario(updated);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleValidate = async () => {
    try {
      const result = await api.validateScenario(id!);
      if (result.errors?.length) {
        alert('Validation issues:\n' + result.errors.map((e: any) => `- ${e.message}`).join('\n'));
      } else {
        alert('Scenario is valid!');
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleFlowGraph = async () => {
    setFlowLoading(true);
    try {
      const result = await api.getFlowGraph(id!);
      setFlowGraphData(result);
      setShowFlowGraph(true);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setFlowLoading(false);
    }
  };

  const handleExport = () => {
    if (!scenario) return;
    const data = JSON.stringify(scenario.scenarioData || scenario, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${scenario.name || 'scenario'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleOptimize = async () => {
    if (!confirm('Run auto-optimization? This will stabilize selectors, generate descriptions, and suggest assertions.')) return;
    try {
      const updated = await api.optimizeScenario(id!);
      setScenario(updated);
      alert('Optimization applied');
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleAddInclude = async (scenarioId: string) => {
    try {
      const updated = await api.addInclude(id!, { scenarioId });
      setScenario(updated);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleRemoveInclude = async (idx: number) => {
    try {
      const updated = await api.removeInclude(id!, idx);
      setScenario(updated);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleCreateRerecord = async () => {
    setRerecordLoading(true);
    try {
      const result = await api.createPartialRerecord(id!, { fromStep: rerecordFrom, toStep: rerecordTo });
      setRerecordRequest(result);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setRerecordLoading(false);
    }
  };

  const handleApplyRerecord = async () => {
    if (!rerecordRequest?.requestId) return;
    try {
      const parsed = JSON.parse(rerecordEvents);
      const newEvents = Array.isArray(parsed) ? parsed : [parsed];
      const updated = await api.applyPartialRerecord(id!, rerecordRequest.requestId, {
        fromStep: rerecordRequest.fromStep,
        toStep: rerecordRequest.toStep,
        events: newEvents,
      });
      setScenario(updated);
      setShowRerecord(false);
      setRerecordRequest(null);
      setRerecordEvents('');
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleUpdateOnFail = async (idx: number, onFail: any) => {
    try {
      const updated = await api.updateStep(id!, idx, { onFail: onFail || undefined });
      setScenario(updated);
      setShowOnFail(null);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const getStepLabel = (event: any) => {
    const parts = [event.type];
    if (event.selector) parts.push(`"${event.selector}"`);
    if (event.value) parts.push(`= ${event.value}`);
    if (event.url) parts.push(event.url);
    return parts.join(' ');
  };

  const getStepTypeColor = (type: string) => {
    const map: Record<string, string> = {
      navigate: 'bg-purple-500/15 text-purple-400',
      click: 'bg-blue-500/15 text-blue-400',
      fill: 'bg-green-500/15 text-green-400',
      type: 'bg-green-500/15 text-green-400',
      assertion: 'bg-yellow-500/15 text-yellow-400',
      wait: 'bg-orange-500/15 text-orange-400',
      waitFor: 'bg-orange-500/15 text-orange-400',
      setVariable: 'bg-cyan-500/15 text-cyan-400',
      apiRequest: 'bg-pink-500/15 text-pink-400',
      if: 'bg-amber-500/15 text-amber-400',
      forEach: 'bg-amber-500/15 text-amber-400',
      block: 'bg-gray-500/15 text-gray-400',
    };
    return map[type] || 'bg-gray-500/15 text-gray-400';
  };

  if (loading) {
    return (
      <div className="p-8 animate-fade-in">
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="bg-card rounded-xl border border-border p-4 h-16 animate-shimmer bg-gradient-to-r from-card via-card2 to-card bg-[length:200%_100%]" />
          ))}
        </div>
      </div>
    );
  }

  if (!scenario) return null;

  return (
    <div className="p-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/scenarios')} className="p-1.5 text-muted hover:text-white transition-colors">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h2 className="text-xl font-bold text-white">{scenario.name}</h2>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-500/15 text-blue-400 uppercase">{scenario.platform}</span>
              <span className="text-xs text-muted">v{scenario.version}</span>
              <span className="text-xs text-muted">{events.length} steps</span>
              {scenario.tcId && <span className="text-xs text-muted font-mono">TC:{scenario.tcId}</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowIncludes(true)} className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-sm text-muted hover:text-white transition-colors">
            <Link2 size={14} /> Includes
          </button>
          <button onClick={() => setShowVars(true)} className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-sm text-muted hover:text-white transition-colors">
            <Variable size={14} /> Variables
          </button>
          <button onClick={() => setShowMeta(true)} className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-sm text-muted hover:text-white transition-colors">
            <Tag size={14} /> Metadata
          </button>
          <button onClick={handleValidate} className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-sm text-muted hover:text-white transition-colors">
            <Shield size={14} /> Validate
          </button>
          <button onClick={handleOptimize} className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-sm text-muted hover:text-white transition-colors">
            <Wand2 size={14} /> Optimize
          </button>
          <button onClick={handleFlowGraph} disabled={flowLoading} className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-sm text-muted hover:text-white transition-colors disabled:opacity-50">
            <GitBranch size={14} /> {flowLoading ? 'Loading...' : 'Flow'}
          </button>
          <button onClick={() => { setRerecordFrom(0); setRerecordTo(Math.max(0, events.length - 1)); setRerecordRequest(null); setRerecordEvents(''); setShowRerecord(true); }} className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-sm text-muted hover:text-white transition-colors">
            <RotateCcw size={14} /> Re-record
          </button>
          <button onClick={handleExport} className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-sm text-muted hover:text-white transition-colors">
            <Download size={14} /> Export
          </button>
        </div>
      </div>

      {/* Steps List */}
      <div className="space-y-1">
        {/* Add step at top */}
        <button
          onClick={() => { setAddAfterIdx(-1); setShowAddStep(true); }}
          className="w-full py-1 text-center text-xs text-muted hover:text-accent border border-dashed border-border/50 hover:border-accent/50 rounded-lg transition-colors"
        >
          + Add step here
        </button>

        {events.map((event: any, idx: number) => {
          const isExpanded = expandedStep === idx;
          const isDisabled = event.disabled;
          const assertions = event.assertions || [];

          return (
            <div key={idx}>
              <div className={`bg-card rounded-xl border border-border overflow-hidden transition-colors ${isDisabled ? 'opacity-50' : ''}`}>
                {/* Step Header */}
                <div
                  className="flex items-center gap-2 px-4 py-3 cursor-pointer hover:bg-card2/30 transition-colors"
                  onClick={() => setExpandedStep(isExpanded ? null : idx)}
                >
                  <span className="text-xs text-muted w-6 text-right flex-shrink-0">{idx + 1}</span>
                  <GripVertical size={12} className="text-muted/50 flex-shrink-0" />
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium flex-shrink-0 ${getStepTypeColor(event.type)}`}>
                    {event.type}
                  </span>
                  <span className="text-sm text-white truncate flex-1">{getStepLabel(event)}</span>
                  {assertions.length > 0 && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-yellow-500/15 text-yellow-400 flex-shrink-0">
                      {assertions.length} assert
                    </span>
                  )}
                  <div className="flex items-center gap-0.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => handleToggleStep(idx)} className="p-1 text-muted hover:text-white transition-colors" title={isDisabled ? 'Enable' : 'Disable'}>
                      {isDisabled ? <EyeOff size={12} /> : <Eye size={12} />}
                    </button>
                    <button onClick={() => handleMoveStep(idx, 'up')} disabled={idx === 0} className="p-1 text-muted hover:text-white transition-colors disabled:opacity-30">
                      <ArrowUp size={12} />
                    </button>
                    <button onClick={() => handleMoveStep(idx, 'down')} disabled={idx === events.length - 1} className="p-1 text-muted hover:text-white transition-colors disabled:opacity-30">
                      <ArrowDown size={12} />
                    </button>
                    <button onClick={() => handleDuplicateStep(idx)} className="p-1 text-muted hover:text-white transition-colors" title="Duplicate">
                      <Copy size={12} />
                    </button>
                    <button onClick={() => handleDeleteStep(idx)} className="p-1 text-muted hover:text-red-400 transition-colors" title="Delete">
                      <Trash2 size={12} />
                    </button>
                  </div>
                  {isExpanded ? <ChevronDown size={14} className="text-muted" /> : <ChevronRight size={14} className="text-muted" />}
                </div>

                {/* Step Detail */}
                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-border space-y-3 pt-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-muted mb-1">Type</label>
                        <select
                          value={event.type}
                          onChange={(e) => handleUpdateStep(idx, { type: e.target.value })}
                          className={inputClass}
                        >
                          {EVENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-muted mb-1">Selector</label>
                        <input
                          defaultValue={event.selector || ''}
                          onBlur={(e) => {
                            if (e.target.value !== (event.selector || '')) {
                              handleUpdateStep(idx, { selector: e.target.value });
                            }
                          }}
                          className={inputClass}
                          placeholder="e.g. #submit-btn"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-muted mb-1">Value</label>
                        <input
                          defaultValue={event.value || ''}
                          onBlur={(e) => {
                            if (e.target.value !== (event.value || '')) {
                              handleUpdateStep(idx, { value: e.target.value });
                            }
                          }}
                          className={inputClass}
                          placeholder="Input value"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-muted mb-1">Wait (ms)</label>
                        <input
                          type="number"
                          defaultValue={event.wait || ''}
                          onBlur={(e) => {
                            const v = parseInt(e.target.value);
                            if (!isNaN(v) && v !== (event.wait || 0)) {
                              handleUpdateStep(idx, { wait: v });
                            }
                          }}
                          className={inputClass}
                          placeholder="0"
                        />
                      </div>
                    </div>

                    {(event.type === 'navigate' || event.url) && (
                      <div>
                        <label className="block text-xs text-muted mb-1">URL</label>
                        <input
                          defaultValue={event.url || ''}
                          onBlur={(e) => {
                            if (e.target.value !== (event.url || '')) {
                              handleUpdateStep(idx, { url: e.target.value });
                            }
                          }}
                          className={inputClass}
                        />
                      </div>
                    )}

                    {/* onFail Editor */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs text-muted">On Fail Policy</label>
                        <button onClick={() => setShowOnFail(showOnFail === idx ? null : idx)} className="text-xs text-accent hover:underline">
                          {event.onFail ? 'Edit' : '+ Set Policy'}
                        </button>
                      </div>
                      {event.onFail && showOnFail !== idx && (
                        <div className="text-xs text-white bg-card2 border border-border rounded-lg p-2 font-mono">
                          {event.onFail.action || 'stop'}{event.onFail.jumpToStep != null ? ` → step ${event.onFail.jumpToStep}` : ''}{event.onFail.maxRetry ? ` (retry: ${event.onFail.maxRetry})` : ''}
                        </div>
                      )}
                      {showOnFail === idx && (
                        <OnFailEditor
                          value={event.onFail || { action: 'stop' }}
                          onSave={(val) => handleUpdateOnFail(idx, val)}
                          onCancel={() => setShowOnFail(null)}
                        />
                      )}
                    </div>

                    {/* Assertions */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-xs text-muted font-medium">Assertions</label>
                        <button onClick={() => handleAddAssertion(idx)} className="text-xs text-accent hover:underline">+ Add</button>
                      </div>
                      {assertions.length > 0 ? (
                        <div className="space-y-1.5">
                          {assertions.map((a: any, ai: number) => (
                            <div key={ai} className="flex items-center gap-2 bg-card2 border border-border rounded-lg p-2">
                              <span className="text-xs text-yellow-400 font-mono flex-1">{a.type}: {a.selector || a.expected || JSON.stringify(a)}</span>
                              <button onClick={() => handleRemoveAssertion(idx, ai)} className="p-0.5 text-muted hover:text-red-400 transition-colors">
                                <Trash2 size={11} />
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted/50">No assertions</p>
                      )}
                    </div>

                    {/* Raw JSON */}
                    <details className="text-xs">
                      <summary className="text-muted cursor-pointer hover:text-white transition-colors">Raw JSON</summary>
                      <pre className="mt-2 bg-card2 border border-border rounded-lg p-2 text-white font-mono overflow-auto max-h-48">
                        {JSON.stringify(event, null, 2)}
                      </pre>
                    </details>
                  </div>
                )}
              </div>

              {/* Add step after */}
              <button
                onClick={() => { setAddAfterIdx(idx); setShowAddStep(true); }}
                className="w-full py-1 text-center text-xs text-muted hover:text-accent border border-dashed border-border/50 hover:border-accent/50 rounded-lg transition-colors mt-1"
              >
                + Add step here
              </button>
            </div>
          );
        })}

        {events.length === 0 && (
          <div className="text-center py-16 text-muted text-sm">
            No steps yet. Click "+ Add step here" to begin.
          </div>
        )}
      </div>

      {/* Add Step Modal */}
      {showAddStep && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowAddStep(false)}>
          <div className="bg-card rounded-2xl border border-border p-6 w-full max-w-md animate-modal-in" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-white mb-4">Add Step {addAfterIdx >= 0 ? `after #${addAfterIdx + 1}` : 'at beginning'}</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-muted mb-1">Type</label>
                <select value={newEvent.type} onChange={(e) => setNewEvent({ ...newEvent, type: e.target.value })} className={inputClass}>
                  {EVENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-muted mb-1">Selector</label>
                <input value={newEvent.selector} onChange={(e) => setNewEvent({ ...newEvent, selector: e.target.value })} className={inputClass} placeholder="CSS selector or XPath" />
              </div>
              <div>
                <label className="block text-xs text-muted mb-1">Value</label>
                <input value={newEvent.value} onChange={(e) => setNewEvent({ ...newEvent, value: e.target.value })} className={inputClass} placeholder="Input value" />
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={() => setShowAddStep(false)} className="flex-1 px-3 py-2 border border-border rounded-lg text-sm text-muted hover:text-white transition-colors">Cancel</button>
                <button onClick={handleInsertStep} className="flex-1 bg-accent text-white px-3 py-2 rounded-lg text-sm hover:bg-accent-hover transition-colors">Add Step</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Includes Modal */}
      {showIncludes && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowIncludes(false)}>
          <div className="bg-card rounded-2xl border border-border p-6 w-full max-w-lg max-h-[80vh] overflow-auto animate-modal-in" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-white mb-4">Scenario Includes</h3>
            <p className="text-xs text-muted mb-3">Include other scenarios to reuse their steps. Included steps are prepended before this scenario's steps during execution.</p>

            {/* Current includes */}
            <div className="space-y-1.5 mb-4">
              {(scenario.scenarioData?.includes || []).length === 0 ? (
                <p className="text-xs text-muted/50">No includes.</p>
              ) : (
                (scenario.scenarioData?.includes || []).map((inc: any, idx: number) => {
                  const incScenario = allScenarios.find((s) => s.id === inc.scenarioId);
                  return (
                    <div key={idx} className="flex items-center gap-2 bg-card2 border border-border rounded-lg p-2">
                      <Link2 size={12} className="text-accent flex-shrink-0" />
                      <span className="text-xs text-white flex-1 truncate">{incScenario?.name || inc.scenarioId.slice(0, 8)}</span>
                      {inc.aliasId && <span className="text-[10px] text-muted font-mono">{inc.aliasId}</span>}
                      <button onClick={() => handleRemoveInclude(idx)} className="p-0.5 text-muted hover:text-red-400 transition-colors">
                        <Trash2 size={11} />
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            {/* Add include */}
            <div>
              <label className="block text-xs text-muted mb-1">Add scenario</label>
              <div className="max-h-40 overflow-auto border border-border rounded-lg divide-y divide-border/50">
                {allScenarios
                  .filter((s) => s.id !== id && !(scenario.scenarioData?.includes || []).some((inc: any) => inc.scenarioId === s.id))
                  .map((s) => (
                    <button
                      key={s.id}
                      onClick={() => handleAddInclude(s.id)}
                      className="w-full flex items-center gap-2 p-2 hover:bg-card2 transition-colors text-left"
                    >
                      <Plus size={11} className="text-accent flex-shrink-0" />
                      <span className="text-xs text-white truncate">{s.name}</span>
                      <span className="text-[10px] text-muted ml-auto">{s.platform}</span>
                    </button>
                  ))}
              </div>
            </div>

            <button onClick={() => setShowIncludes(false)} className="w-full mt-4 px-3 py-2 border border-border rounded-lg text-sm text-muted hover:text-white transition-colors">Close</button>
          </div>
        </div>
      )}

      {/* Variables Modal */}
      {showVars && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowVars(false)}>
          <div className="bg-card rounded-2xl border border-border p-6 w-full max-w-lg max-h-[80vh] overflow-auto animate-modal-in" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-white mb-4">Scenario Variables</h3>
            <VariablesEditor
              variables={scenario.scenarioData?.variables || {}}
              onSave={(vars) => { handleSetVariables(vars); setShowVars(false); }}
            />
            <button onClick={() => setShowVars(false)} className="w-full mt-4 px-3 py-2 border border-border rounded-lg text-sm text-muted hover:text-white transition-colors">Close</button>
          </div>
        </div>
      )}

      {/* Flow Graph Modal */}
      {showFlowGraph && flowGraphData && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowFlowGraph(false)}>
          <div className="bg-card rounded-2xl border border-border p-6 w-full max-w-3xl max-h-[85vh] overflow-auto animate-modal-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-white">Flow Graph</h3>
              <button onClick={() => setShowFlowGraph(false)} className="text-muted hover:text-white transition-colors text-sm">Close</button>
            </div>
            <FlowGraphViewer data={flowGraphData} />
          </div>
        </div>
      )}

      {/* Partial Re-record Modal */}
      {showRerecord && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowRerecord(false)}>
          <div className="bg-card rounded-2xl border border-border p-6 w-full max-w-lg animate-modal-in" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-white mb-1">Partial Re-record</h3>
            <p className="text-xs text-muted mb-4">Re-record a range of steps. The old steps will be replaced with the newly recorded events.</p>

            {!rerecordRequest ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-muted mb-1">From Step</label>
                    <input type="number" value={rerecordFrom} onChange={(e) => setRerecordFrom(Number(e.target.value))} min={0} max={events.length - 1} className={inputClass} />
                  </div>
                  <div>
                    <label className="block text-xs text-muted mb-1">To Step</label>
                    <input type="number" value={rerecordTo} onChange={(e) => setRerecordTo(Number(e.target.value))} min={rerecordFrom} max={events.length - 1} className={inputClass} />
                  </div>
                </div>
                <div className="bg-card2 border border-border rounded-lg p-3 text-xs text-muted">
                  Steps {rerecordFrom + 1} to {rerecordTo + 1} will be replaced ({rerecordTo - rerecordFrom + 1} step{rerecordTo - rerecordFrom !== 0 ? 's' : ''})
                </div>
                <div className="flex gap-2 pt-2">
                  <button onClick={() => setShowRerecord(false)} className="flex-1 px-3 py-2 border border-border rounded-lg text-sm text-muted hover:text-white transition-colors">Cancel</button>
                  <button onClick={handleCreateRerecord} disabled={rerecordLoading} className="flex-1 bg-accent text-white px-3 py-2 rounded-lg text-sm hover:bg-accent-hover transition-colors disabled:opacity-50">
                    {rerecordLoading ? 'Creating...' : 'Start Re-record'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3 text-xs">
                  <p className="text-green-400 font-medium mb-1">Re-record request created</p>
                  <p className="text-muted font-mono">ID: {rerecordRequest.requestId}</p>
                  <p className="text-muted">Steps {rerecordRequest.fromStep + 1} to {rerecordRequest.toStep + 1}</p>
                </div>
                <div>
                  <label className="block text-xs text-muted mb-1">Paste recorded events JSON</label>
                  <textarea
                    value={rerecordEvents}
                    onChange={(e) => setRerecordEvents(e.target.value)}
                    rows={8}
                    className={`${inputClass} font-mono text-[11px]`}
                    placeholder='[{ "type": "click", "selector": "#btn" }, ...]'
                  />
                </div>
                <div className="flex gap-2 pt-2">
                  <button onClick={() => { setRerecordRequest(null); setRerecordEvents(''); }} className="flex-1 px-3 py-2 border border-border rounded-lg text-sm text-muted hover:text-white transition-colors">Back</button>
                  <button onClick={handleApplyRerecord} disabled={!rerecordEvents.trim()} className="flex-1 bg-accent text-white px-3 py-2 rounded-lg text-sm hover:bg-accent-hover transition-colors disabled:opacity-50">
                    Apply Events
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Metadata Modal */}
      {showMeta && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowMeta(false)}>
          <div className="bg-card rounded-2xl border border-border p-6 w-full max-w-md animate-modal-in" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-white mb-4">Scenario Metadata</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-muted mb-1">Name</label>
                <input value={scenario.name} onChange={(e) => setScenario({ ...scenario, name: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className="block text-xs text-muted mb-1">Description</label>
                <textarea value={scenario.description || ''} onChange={(e) => setScenario({ ...scenario, description: e.target.value })} rows={3} className={inputClass} />
              </div>
              <div>
                <label className="block text-xs text-muted mb-1">Tags (comma-separated)</label>
                <input value={(scenario.tags || []).join(', ')} onChange={(e) => setScenario({ ...scenario, tags: e.target.value.split(',').map((t: string) => t.trim()).filter(Boolean) })} className={inputClass} />
              </div>
              <div>
                <label className="block text-xs text-muted mb-1">TC ID</label>
                <input value={scenario.tcId || ''} onChange={(e) => setScenario({ ...scenario, tcId: e.target.value })} className={inputClass} />
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={() => setShowMeta(false)} className="flex-1 px-3 py-2 border border-border rounded-lg text-sm text-muted hover:text-white transition-colors">Cancel</button>
                <button onClick={handleSaveMetadata} disabled={saving} className="flex-1 bg-accent text-white px-3 py-2 rounded-lg text-sm hover:bg-accent-hover transition-colors disabled:opacity-50">
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function OnFailEditor({ value, onSave, onCancel }: { value: any; onSave: (v: any) => void; onCancel: () => void }) {
  const [action, setAction] = useState(value?.action || 'stop');
  const [jumpToStep, setJumpToStep] = useState(value?.jumpToStep ?? '');
  const [maxRetry, setMaxRetry] = useState(value?.maxRetry ?? 0);
  const [retryDelayMs, setRetryDelayMs] = useState(value?.retryDelayMs ?? 1000);

  const save = () => {
    const result: any = { action };
    if (action === 'jump' && jumpToStep !== '') result.jumpToStep = Number(jumpToStep);
    if (action === 'retry') {
      result.maxRetry = Number(maxRetry) || 1;
      result.retryDelayMs = Number(retryDelayMs) || 1000;
    }
    onSave(result);
  };

  const clear = () => onSave(null);

  return (
    <div className="bg-card2 border border-border rounded-lg p-3 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[11px] text-muted mb-0.5">Action</label>
          <select value={action} onChange={(e) => setAction(e.target.value)} className={inputClass}>
            <option value="stop">Stop</option>
            <option value="skip">Skip</option>
            <option value="jump">Jump to Step</option>
            <option value="retry">Retry</option>
            <option value="fallback_route">Fallback Route</option>
          </select>
        </div>
        {action === 'jump' && (
          <div>
            <label className="block text-[11px] text-muted mb-0.5">Jump to Step #</label>
            <input type="number" value={jumpToStep} onChange={(e) => setJumpToStep(e.target.value)} className={inputClass} min={0} />
          </div>
        )}
        {action === 'retry' && (
          <>
            <div>
              <label className="block text-[11px] text-muted mb-0.5">Max Retries</label>
              <input type="number" value={maxRetry} onChange={(e) => setMaxRetry(e.target.value)} className={inputClass} min={1} max={10} />
            </div>
            <div>
              <label className="block text-[11px] text-muted mb-0.5">Retry Delay (ms)</label>
              <input type="number" value={retryDelayMs} onChange={(e) => setRetryDelayMs(e.target.value)} className={inputClass} min={0} step={500} />
            </div>
          </>
        )}
      </div>
      <div className="flex gap-2">
        <button onClick={clear} className="text-xs text-red-400 hover:underline">Remove Policy</button>
        <div className="flex-1" />
        <button onClick={onCancel} className="text-xs text-muted hover:text-white transition-colors">Cancel</button>
        <button onClick={save} className="text-xs text-accent hover:underline">Save</button>
      </div>
    </div>
  );
}

function FlowGraphViewer({ data }: { data: any }) {
  const nodes = data?.nodes || [];
  const edges = data?.edges || [];

  if (nodes.length === 0) {
    return <p className="text-xs text-muted">No flow data available.</p>;
  }

  // Simple text-based visualization with node list and connections
  const nodeMap = new Map(nodes.map((n: any) => [n.id, n]));

  const getNodeColor = (type: string) => {
    const map: Record<string, string> = {
      start: 'border-green-500 bg-green-500/10',
      end: 'border-red-500 bg-red-500/10',
      action: 'border-blue-500 bg-blue-500/10',
      condition: 'border-amber-500 bg-amber-500/10',
      loop: 'border-purple-500 bg-purple-500/10',
      block: 'border-gray-500 bg-gray-500/10',
      wait: 'border-orange-500 bg-orange-500/10',
    };
    return map[type] || 'border-gray-500 bg-gray-500/10';
  };

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted mb-3">{nodes.length} nodes, {edges.length} edges</p>
      <div className="space-y-1.5 max-h-96 overflow-auto">
        {nodes.map((node: any) => {
          const outEdges = edges.filter((e: any) => e.source === node.id);
          return (
            <div key={node.id} className={`border rounded-lg p-2 ${getNodeColor(node.type)}`}>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted font-mono w-6">{node.stepIndex ?? '-'}</span>
                <span className="text-xs text-white font-medium">{node.label || node.type}</span>
                <span className="text-[10px] text-muted uppercase">{node.type}</span>
              </div>
              {outEdges.length > 0 && (
                <div className="mt-1 ml-8 text-[10px] text-muted">
                  {outEdges.map((e: any, i: number) => {
                    const target = nodeMap.get(e.target) as any;
                    return (
                      <span key={i} className="mr-2">
                        → {target?.label || e.target}
                        {e.label && <span className="text-amber-400"> ({e.label})</span>}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Mermaid-style text representation */}
      <details className="mt-3">
        <summary className="text-xs text-muted cursor-pointer hover:text-white">Raw Graph JSON</summary>
        <pre className="mt-2 bg-card2 border border-border rounded-lg p-2 text-[11px] text-white font-mono overflow-auto max-h-48">
          {JSON.stringify(data, null, 2)}
        </pre>
      </details>
    </div>
  );
}

function VariablesEditor({ variables, onSave }: { variables: Record<string, string>; onSave: (v: Record<string, string>) => void }) {
  const [vars, setVars] = useState<{ key: string; value: string }[]>(
    Object.entries(variables).map(([key, value]) => ({ key, value }))
  );

  const addVar = () => setVars([...vars, { key: '', value: '' }]);
  const removeVar = (idx: number) => setVars(vars.filter((_, i) => i !== idx));
  const updateVar = (idx: number, field: 'key' | 'value', val: string) => {
    const updated = [...vars];
    updated[idx] = { ...updated[idx], [field]: val };
    setVars(updated);
  };

  const save = () => {
    const result: Record<string, string> = {};
    vars.forEach((v) => { if (v.key) result[v.key] = v.value; });
    onSave(result);
  };

  return (
    <div className="space-y-2">
      {vars.map((v, i) => (
        <div key={i} className="flex items-center gap-2">
          <input value={v.key} onChange={(e) => updateVar(i, 'key', e.target.value)} className={`${inputClass} flex-1`} placeholder="Variable name" />
          <input value={v.value} onChange={(e) => updateVar(i, 'value', e.target.value)} className={`${inputClass} flex-1`} placeholder="Value" />
          <button onClick={() => removeVar(i)} className="p-1.5 text-muted hover:text-red-400 transition-colors"><Trash2 size={12} /></button>
        </div>
      ))}
      <div className="flex gap-2">
        <button onClick={addVar} className="text-xs text-accent hover:underline">+ Add variable</button>
        <button onClick={save} className="ml-auto bg-accent text-white px-3 py-1.5 rounded-lg text-xs hover:bg-accent-hover transition-colors">Save Variables</button>
      </div>
    </div>
  );
}

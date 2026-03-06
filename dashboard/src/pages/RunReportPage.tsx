import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import {
  ArrowLeft, CheckCircle, XCircle, Clock, AlertTriangle,
  ChevronDown, ChevronRight, FileText, Pause, Play, Image,
  ShieldCheck, Variable, Wrench, Eye, Download,
} from 'lucide-react';

export default function RunReportPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [run, setRun] = useState<any>(null);
  const [scenarios, setScenarios] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSr, setExpandedSr] = useState<string | null>(null);
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());
  const [screenshotModal, setScreenshotModal] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [runData, scenariosData] = await Promise.all([
          api.getRun(id!),
          api.getScenarios(),
        ]);
        setRun(runData);
        setScenarios(scenariosData);
      } catch (err: any) {
        alert(err.message);
        navigate('/runs');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  const reload = async () => {
    try {
      const runData = await api.getRun(id!);
      setRun(runData);
    } catch {}
  };

  const scenarioName = (scenarioId: string) =>
    scenarios.find((s) => s.id === scenarioId)?.name || scenarioId.slice(0, 8);

  const statusIcon = (status: string) => {
    switch (status) {
      case 'passed': case 'completed': return <CheckCircle size={14} className="text-green-400" />;
      case 'failed': case 'infra_failed': return <XCircle size={14} className="text-red-400" />;
      case 'running': return <Clock size={14} className="text-blue-400 animate-pulse" />;
      case 'queued': case 'pending': return <Clock size={14} className="text-yellow-400" />;
      case 'paused': return <Pause size={14} className="text-orange-400" />;
      case 'skipped': case 'cancelled': return <AlertTriangle size={14} className="text-gray-400" />;
      default: return <Clock size={14} className="text-gray-400" />;
    }
  };

  const statusColor = (s: string) => {
    const map: Record<string, string> = {
      completed: 'bg-green-500/15 text-green-400',
      passed: 'bg-green-500/15 text-green-400',
      failed: 'bg-red-500/15 text-red-400',
      infra_failed: 'bg-red-500/15 text-red-400',
      running: 'bg-blue-500/15 text-blue-400',
      queued: 'bg-yellow-500/15 text-yellow-400',
      pending: 'bg-yellow-500/15 text-yellow-400',
      paused: 'bg-orange-500/15 text-orange-400',
      cancelled: 'bg-gray-500/15 text-gray-400',
      skipped: 'bg-gray-500/15 text-gray-400',
    };
    return map[s] || 'bg-gray-500/15 text-gray-400';
  };

  const formatDuration = (ms: number | null | undefined) => {
    if (!ms) return '-';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
  };

  const toggleStepExpand = (key: string) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handlePause = async () => {
    try {
      await api.pauseRun(id!);
      reload();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleResume = async () => {
    try {
      await api.resumeRun(id!);
      reload();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDownloadJson = async () => {
    try {
      const report = await api.getRunReportJson(id!);
      const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `run-report-${id!.slice(0, 8)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDownloadHtml = async () => {
    try {
      const html = await api.getRunReportHtml(id!);
      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `run-report-${id!.slice(0, 8)}.html`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err.message);
    }
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

  if (!run) return null;

  const scenarioRuns = run.scenarioRuns || [];
  const passed = scenarioRuns.filter((sr: any) => sr.status === 'passed').length;
  const failed = scenarioRuns.filter((sr: any) => ['failed', 'infra_failed'].includes(sr.status)).length;
  const totalDuration = scenarioRuns.reduce((sum: number, sr: any) => sum + (sr.durationMs || 0), 0);
  const isActive = ['running', 'queued', 'pending'].includes(run.status);
  const isPaused = run.status === 'paused';

  return (
    <div className="p-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/runs')} className="p-1.5 text-muted hover:text-white transition-colors">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h2 className="text-xl font-bold text-white">Run Report</h2>
            <p className="text-xs text-muted font-mono">{run.id}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isActive && (
            <button onClick={handlePause} className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500/15 text-orange-400 rounded-lg text-sm hover:bg-orange-500/25 transition-colors">
              <Pause size={14} /> Pause
            </button>
          )}
          {isPaused && (
            <button onClick={handleResume} className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500/15 text-green-400 rounded-lg text-sm hover:bg-green-500/25 transition-colors">
              <Play size={14} /> Resume
            </button>
          )}
          {isActive && (
            <button onClick={reload} className="px-3 py-1.5 border border-border rounded-lg text-sm text-muted hover:text-white transition-colors">
              Refresh
            </button>
          )}
          <button onClick={handleDownloadJson} className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-sm text-muted hover:text-white transition-colors">
            <Download size={14} /> JSON
          </button>
          <button onClick={handleDownloadHtml} className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-sm text-muted hover:text-white transition-colors">
            <Download size={14} /> HTML
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <div className="bg-card rounded-xl border border-border p-4">
          <p className="text-xs text-muted mb-1">Status</p>
          <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${statusColor(run.status)}`}>{run.status}</span>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <p className="text-xs text-muted mb-1">Mode</p>
          <p className="text-sm text-white capitalize">{run.mode}</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <p className="text-xs text-muted mb-1">Platform</p>
          <p className="text-sm text-white capitalize">{run.targetPlatform || run.target_platform}</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <p className="text-xs text-muted mb-1">Progress</p>
          <p className="text-sm text-white">
            <span className="text-green-400">{passed}</span>
            {failed > 0 && <> / <span className="text-red-400">{failed}</span></>}
            {' / '}{scenarioRuns.length} total
          </p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <p className="text-xs text-muted mb-1">Duration</p>
          <p className="text-sm text-white">{formatDuration(totalDuration)}</p>
        </div>
      </div>

      {/* Progress Bar */}
      {scenarioRuns.length > 0 && (
        <div className="bg-card rounded-xl border border-border p-4 mb-6">
          <div className="flex gap-0.5 h-3 rounded-full overflow-hidden bg-card2">
            {scenarioRuns.map((sr: any) => (
              <div
                key={sr.id}
                className={`flex-1 transition-all ${
                  sr.status === 'passed' ? 'bg-green-500' :
                  ['failed', 'infra_failed'].includes(sr.status) ? 'bg-red-500' :
                  sr.status === 'running' ? 'bg-blue-500 animate-pulse' :
                  sr.status === 'paused' ? 'bg-orange-500' :
                  ['queued', 'pending'].includes(sr.status) ? 'bg-yellow-500/50' :
                  'bg-gray-500/30'
                }`}
                title={`${scenarioName(sr.scenarioId)}: ${sr.status}`}
              />
            ))}
          </div>
        </div>
      )}

      {/* Timing Info */}
      <div className="bg-card rounded-xl border border-border p-4 mb-6">
        <div className="grid grid-cols-3 gap-4 text-xs">
          <div>
            <span className="text-muted">Created: </span>
            <span className="text-white">{new Date(run.createdAt || run.created_at).toLocaleString('ko-KR')}</span>
          </div>
          {run.startedAt && (
            <div>
              <span className="text-muted">Started: </span>
              <span className="text-white">{new Date(run.startedAt).toLocaleString('ko-KR')}</span>
            </div>
          )}
          {run.completedAt && (
            <div>
              <span className="text-muted">Completed: </span>
              <span className="text-white">{new Date(run.completedAt).toLocaleString('ko-KR')}</span>
            </div>
          )}
        </div>
        {run.error && (
          <div className="mt-3 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
            <p className="text-xs text-red-400 font-mono">{run.error}</p>
          </div>
        )}
      </div>

      {/* Scenario Runs */}
      <h3 className="text-sm font-medium text-muted mb-3">Scenario Runs ({scenarioRuns.length})</h3>
      <div className="space-y-1.5">
        {scenarioRuns
          .sort((a: any, b: any) => a.sequenceNo - b.sequenceNo)
          .map((sr: any) => {
            const isExpanded = expandedSr === sr.id;
            const stepResults = sr.resultJson?.stepResults || sr.resultJson?.results || [];
            const capturedVars = sr.resultJson?.capturedVariables || sr.resultJson?.variables || {};
            const screenshots = sr.resultJson?.screenshots || [];
            const signals = sr.resultJson?.signals || sr.resultJson?.resolvedBy || null;

            return (
              <div key={sr.id} className="bg-card rounded-xl border border-border overflow-hidden">
                <div
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-card2/30 transition-colors"
                  onClick={() => setExpandedSr(isExpanded ? null : sr.id)}
                >
                  <span className="text-xs text-muted w-6 text-right">{sr.sequenceNo + 1}</span>
                  {statusIcon(sr.status)}
                  <span className="text-sm text-white flex-1 truncate">{scenarioName(sr.scenarioId)}</span>
                  <span className="text-xs text-muted">{formatDuration(sr.durationMs)}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${statusColor(sr.status)}`}>{sr.status}</span>
                  {isExpanded ? <ChevronDown size={14} className="text-muted" /> : <ChevronRight size={14} className="text-muted" />}
                </div>

                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-border pt-3">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs mb-3">
                      <div><span className="text-muted">Platform:</span> <span className="text-white capitalize">{sr.platform}</span></div>
                      <div><span className="text-muted">Attempt:</span> <span className="text-white">{sr.attempt}</span></div>
                      {sr.startedAt && <div><span className="text-muted">Started:</span> <span className="text-white">{new Date(sr.startedAt).toLocaleString('ko-KR')}</span></div>}
                      {sr.completedAt && <div><span className="text-muted">Completed:</span> <span className="text-white">{new Date(sr.completedAt).toLocaleString('ko-KR')}</span></div>}
                    </div>

                    {sr.error && (
                      <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 mb-3">
                        <p className="text-xs text-red-400 font-medium mb-1">Error</p>
                        <p className="text-xs text-red-300 font-mono whitespace-pre-wrap">{sr.error}</p>
                      </div>
                    )}

                    {/* Signals / Resolved By */}
                    {signals && (
                      <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3 mb-3">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <Wrench size={12} className="text-amber-400" />
                          <span className="text-xs text-amber-400 font-medium">Resolution Signals</span>
                        </div>
                        <div className="text-xs text-amber-300 font-mono">
                          {typeof signals === 'string' ? signals : JSON.stringify(signals, null, 2)}
                        </div>
                      </div>
                    )}

                    {/* Captured Variables */}
                    {Object.keys(capturedVars).length > 0 && (
                      <div className="bg-cyan-500/5 border border-cyan-500/20 rounded-lg p-3 mb-3">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <Variable size={12} className="text-cyan-400" />
                          <span className="text-xs text-cyan-400 font-medium">Captured Variables</span>
                        </div>
                        <div className="grid grid-cols-2 gap-1">
                          {Object.entries(capturedVars).map(([key, val]) => (
                            <div key={key} className="text-xs">
                              <span className="text-cyan-300 font-mono">{key}</span>
                              <span className="text-muted"> = </span>
                              <span className="text-white">{String(val)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Step Results */}
                    {stepResults.length > 0 && (
                      <div>
                        <h4 className="text-xs font-medium text-muted mb-2">Step Results ({stepResults.length})</h4>
                        <div className="bg-card2 border border-border rounded-lg overflow-hidden">
                          {stepResults.map((step: any, i: number) => {
                            const stepKey = `${sr.id}-${i}`;
                            const isStepExpanded = expandedSteps.has(stepKey);
                            const stepAssertions = step.assertions || step.assertionResults || [];
                            const stepScreenshot = step.screenshot || step.screenshotPath;
                            const resolvedBy = step.resolvedBy || step.selectorUsed;

                            return (
                              <div key={i} className="border-b border-border/50 last:border-0">
                                <div
                                  className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-card/30 transition-colors text-xs"
                                  onClick={() => toggleStepExpand(stepKey)}
                                >
                                  <span className="text-muted w-5 text-right">{i + 1}</span>
                                  <span className="text-white min-w-16">{step.type || step.eventType || '-'}</span>
                                  <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                                    step.status === 'passed' ? 'bg-green-500/15 text-green-400' :
                                    step.status === 'failed' ? 'bg-red-500/15 text-red-400' :
                                    step.status === 'skipped' ? 'bg-gray-500/15 text-gray-400' :
                                    'bg-gray-500/15 text-gray-400'
                                  }`}>
                                    {step.status || '-'}
                                  </span>
                                  <span className="text-muted flex-1 truncate">{step.selector || step.url || step.description || ''}</span>
                                  <span className="text-muted">{formatDuration(step.durationMs)}</span>
                                  {stepAssertions.length > 0 && (
                                    <ShieldCheck size={11} className={stepAssertions.every((a: any) => a.passed) ? 'text-green-400' : 'text-red-400'} />
                                  )}
                                  {stepScreenshot && <Image size={11} className="text-blue-400" />}
                                  {isStepExpanded ? <ChevronDown size={12} className="text-muted" /> : <ChevronRight size={12} className="text-muted" />}
                                </div>

                                {isStepExpanded && (
                                  <div className="px-3 pb-3 space-y-2">
                                    {/* Step Details Grid */}
                                    <div className="grid grid-cols-2 gap-2 text-[11px] pl-7">
                                      {step.selector && (
                                        <div><span className="text-muted">Selector:</span> <span className="text-white font-mono">{step.selector}</span></div>
                                      )}
                                      {step.value && (
                                        <div><span className="text-muted">Value:</span> <span className="text-white">{step.value}</span></div>
                                      )}
                                      {step.url && (
                                        <div className="col-span-2"><span className="text-muted">URL:</span> <span className="text-white font-mono">{step.url}</span></div>
                                      )}
                                      {resolvedBy && (
                                        <div className="col-span-2">
                                          <span className="text-muted">Resolved by:</span>{' '}
                                          <span className="text-amber-300 font-mono">{typeof resolvedBy === 'string' ? resolvedBy : JSON.stringify(resolvedBy)}</span>
                                        </div>
                                      )}
                                    </div>

                                    {/* Step Error */}
                                    {step.error && (
                                      <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-2 ml-7">
                                        <p className="text-[11px] text-red-300 font-mono whitespace-pre-wrap">{step.error}</p>
                                      </div>
                                    )}

                                    {/* Step Assertions */}
                                    {stepAssertions.length > 0 && (
                                      <div className="ml-7">
                                        <p className="text-[11px] text-muted mb-1 flex items-center gap-1">
                                          <ShieldCheck size={10} /> Assertions
                                        </p>
                                        <div className="space-y-1">
                                          {stepAssertions.map((a: any, ai: number) => (
                                            <div key={ai} className="flex items-center gap-1.5 text-[11px]">
                                              {a.passed ? (
                                                <CheckCircle size={10} className="text-green-400 flex-shrink-0" />
                                              ) : (
                                                <XCircle size={10} className="text-red-400 flex-shrink-0" />
                                              )}
                                              <span className="text-white">{a.type || a.assertion}</span>
                                              {a.selector && <span className="text-muted font-mono">{a.selector}</span>}
                                              {a.expected && <span className="text-muted">expected: {a.expected}</span>}
                                              {a.actual !== undefined && <span className={a.passed ? 'text-green-300' : 'text-red-300'}>actual: {String(a.actual)}</span>}
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}

                                    {/* Step Screenshot */}
                                    {stepScreenshot && (
                                      <div className="ml-7">
                                        <button
                                          onClick={() => setScreenshotModal(stepScreenshot)}
                                          className="flex items-center gap-1.5 text-[11px] text-blue-400 hover:text-blue-300 transition-colors"
                                        >
                                          <Eye size={10} /> View Screenshot
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Screenshots Gallery */}
                    {screenshots.length > 0 && (
                      <div className="mt-3">
                        <h4 className="text-xs font-medium text-muted mb-2 flex items-center gap-1"><Image size={12} /> Screenshots ({screenshots.length})</h4>
                        <div className="grid grid-cols-4 gap-2">
                          {screenshots.map((ss: any, i: number) => (
                            <button
                              key={i}
                              onClick={() => setScreenshotModal(ss.data || ss.path || ss)}
                              className="bg-card2 border border-border rounded-lg p-1 hover:border-accent/50 transition-colors"
                            >
                              {typeof ss === 'string' && ss.startsWith('data:') ? (
                                <img src={ss} alt={`Screenshot ${i + 1}`} className="w-full h-20 object-cover rounded" />
                              ) : (
                                <div className="w-full h-20 flex items-center justify-center text-muted text-[10px]">
                                  <Image size={16} className="mr-1" /> {i + 1}
                                </div>
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Raw Result JSON */}
                    {sr.resultJson && (
                      <details className="mt-3 text-xs">
                        <summary className="text-muted cursor-pointer hover:text-white transition-colors flex items-center gap-1">
                          <FileText size={12} /> Raw Result JSON
                        </summary>
                        <pre className="mt-2 bg-card2 border border-border rounded-lg p-2 text-white font-mono overflow-auto max-h-48">
                          {JSON.stringify(sr.resultJson, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                )}
              </div>
            );
          })}
      </div>

      {scenarioRuns.length === 0 && (
        <div className="text-center py-8 text-muted text-sm">No scenario runs recorded.</div>
      )}

      {/* Screenshot Modal */}
      {screenshotModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50" onClick={() => setScreenshotModal(null)}>
          <div className="max-w-4xl max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            {screenshotModal.startsWith('data:') ? (
              <img src={screenshotModal} alt="Screenshot" className="max-w-full rounded-lg" />
            ) : (
              <div className="bg-card rounded-lg border border-border p-8 text-muted text-sm">
                Screenshot path: {screenshotModal}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

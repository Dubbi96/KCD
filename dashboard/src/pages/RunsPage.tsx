import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { Plus, XCircle, ChevronLeft, ChevronRight, FileBarChart, Key } from 'lucide-react';

export default function RunsPage() {
  const navigate = useNavigate();
  const [runs, setRuns] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [scenarios, setScenarios] = useState<any[]>([]);
  const [authProfiles, setAuthProfiles] = useState<any[]>([]);
  const [form, setForm] = useState({
    scenarioIds: [] as string[],
    platform: 'web',
    mode: 'batch',
    authProfileId: '',
    options: { speed: 1, headless: false, takeScreenshots: true, stopOnFailure: false },
  });
  const [saving, setSaving] = useState(false);
  const limit = 15;

  const load = (p = page) => {
    setLoading(true);
    api.getRuns(limit, p * limit)
      .then((res) => { setRuns(res.runs); setTotal(res.total); })
      .catch(() => { setRuns([]); setTotal(0); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [page]);

  const openCreate = async () => {
    const [sc, ap] = await Promise.all([
      api.getScenarios().catch(() => []),
      api.getAuthProfiles().catch(() => []),
    ]);
    setScenarios(sc);
    setAuthProfiles(ap);
    setShowCreate(true);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const data: any = {
        scenarioIds: form.scenarioIds,
        platform: form.platform,
        mode: form.mode,
        options: form.options,
      };
      if (form.authProfileId) data.authProfileId = form.authProfileId;
      await api.createRun(data);
      setShowCreate(false);
      setForm({ scenarioIds: [], platform: 'web', mode: 'batch', authProfileId: '', options: { speed: 1, headless: false, takeScreenshots: true, stopOnFailure: false } });
      load(0);
      setPage(0);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async (id: string) => {
    if (!confirm('Cancel this run?')) return;
    await api.cancelRun(id);
    load();
  };

  const toggleScenario = (id: string) => {
    setForm((f) => ({
      ...f,
      scenarioIds: f.scenarioIds.includes(id) ? f.scenarioIds.filter((s) => s !== id) : [...f.scenarioIds, id],
    }));
  };

  const statusColor = (s: string) => {
    const map: Record<string, string> = {
      completed: 'bg-green-500/15 text-green-400',
      passed: 'bg-green-500/15 text-green-400',
      failed: 'bg-red-500/15 text-red-400',
      running: 'bg-blue-500/15 text-blue-400',
      queued: 'bg-yellow-500/15 text-yellow-400',
      cancelled: 'bg-gray-500/15 text-gray-400',
    };
    return map[s] || 'bg-gray-500/15 text-gray-400';
  };

  const totalPages = Math.ceil(total / limit);
  const inputClass = "w-full px-3 py-2 bg-card2 border border-border rounded-lg text-white text-sm focus:ring-1 focus:ring-accent focus:border-accent outline-none transition-colors";

  return (
    <div className="p-8 animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-white">Runs</h2>
          <p className="text-xs text-muted mt-0.5">{total} total runs</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-1.5 bg-accent text-white px-3 py-1.5 rounded-lg text-sm hover:bg-accent-hover transition-colors">
          <Plus size={14} /> Manual Run
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="bg-card rounded-xl border border-border p-4 h-14 animate-shimmer bg-gradient-to-r from-card via-card2 to-card bg-[length:200%_100%]" />
          ))}
        </div>
      ) : runs.length === 0 ? (
        <div className="text-center py-16 text-muted text-sm">No runs yet.</div>
      ) : (
        <>
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted border-b border-border">
                  <th className="px-4 py-3 font-medium">ID</th>
                  <th className="px-4 py-3 font-medium">Mode</th>
                  <th className="px-4 py-3 font-medium">Platform</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Progress</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                  <th className="px-4 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id} className="border-b border-border/50 last:border-0 hover:bg-card2/30 transition-colors cursor-pointer" onClick={() => navigate(`/runs/${run.id}/report`)}>
                    <td className="px-4 py-3 font-mono text-muted">{run.id.slice(0, 8)}</td>
                    <td className="px-4 py-3 text-white capitalize">{run.mode}</td>
                    <td className="px-4 py-3 text-white capitalize">{run.targetPlatform || run.target_platform}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${statusColor(run.status)}`}>
                        {run.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-white">
                      {run.passedCount || 0}/{run.totalScenarios || run.total_scenarios || 0}
                    </td>
                    <td className="px-4 py-3 text-muted">{new Date(run.createdAt || run.created_at).toLocaleString('ko-KR')}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => navigate(`/runs/${run.id}/report`)} className="p-1 text-muted hover:text-white transition-colors" title="Report">
                          <FileBarChart size={13} />
                        </button>
                        {(run.status === 'queued' || run.status === 'running') && (
                          <button onClick={() => handleCancel(run.id)} className="p-1 text-muted hover:text-red-400 transition-colors" title="Cancel">
                            <XCircle size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 text-xs text-muted">
              <span>Page {page + 1} of {totalPages}</span>
              <div className="flex gap-1">
                <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className="p-1 hover:text-white disabled:opacity-30 transition-colors">
                  <ChevronLeft size={14} />
                </button>
                <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="p-1 hover:text-white disabled:opacity-30 transition-colors">
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowCreate(false)}>
          <div className="bg-card rounded-2xl border border-border p-6 w-full max-w-md max-h-[85vh] overflow-auto animate-modal-in" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-white mb-4">Manual Run</h3>
            <form onSubmit={handleCreate} className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-muted mb-1">Platform</label>
                  <select value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })} className={inputClass}>
                    <option value="web">Web</option>
                    <option value="ios">iOS</option>
                    <option value="android">Android</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-muted mb-1">Mode</label>
                  <select value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })} className={inputClass}>
                    <option value="batch">Batch (Parallel)</option>
                    <option value="chain">Chain (Sequential)</option>
                    <option value="single">Single</option>
                  </select>
                </div>
              </div>

              {authProfiles.length > 0 && (
                <div>
                  <label className="block text-xs text-muted mb-1 flex items-center gap-1"><Key size={10} /> Auth Profile</label>
                  <select value={form.authProfileId} onChange={(e) => setForm({ ...form, authProfileId: e.target.value })} className={inputClass}>
                    <option value="">None</option>
                    {authProfiles.map((ap) => <option key={ap.id} value={ap.id}>{ap.name} ({ap.domain})</option>)}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs text-muted mb-1">Scenarios ({form.scenarioIds.length} selected)</label>
                <div className="max-h-48 overflow-auto border border-border rounded-lg divide-y divide-border/50">
                  {scenarios.length === 0 ? (
                    <div className="p-3 text-xs text-muted">No scenarios available</div>
                  ) : scenarios.map((sc) => (
                    <label key={sc.id} className="flex items-center gap-2 p-2 hover:bg-card2 cursor-pointer transition-colors">
                      <input
                        type="checkbox"
                        checked={form.scenarioIds.includes(sc.id)}
                        onChange={() => toggleScenario(sc.id)}
                        className="rounded border-border text-accent focus:ring-accent"
                      />
                      <span className="text-xs text-white truncate">{sc.name}</span>
                      <span className="text-[10px] text-muted ml-auto">{sc.platform}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Execution Options */}
              <div>
                <label className="block text-xs text-muted mb-2">Execution Options</label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex items-center gap-2 text-xs text-white cursor-pointer">
                    <input type="checkbox" checked={form.options.headless} onChange={(e) => setForm({ ...form, options: { ...form.options, headless: e.target.checked } })} className="rounded border-border text-accent focus:ring-accent" />
                    Headless
                  </label>
                  <label className="flex items-center gap-2 text-xs text-white cursor-pointer">
                    <input type="checkbox" checked={form.options.takeScreenshots} onChange={(e) => setForm({ ...form, options: { ...form.options, takeScreenshots: e.target.checked } })} className="rounded border-border text-accent focus:ring-accent" />
                    Screenshots
                  </label>
                  <label className="flex items-center gap-2 text-xs text-white cursor-pointer">
                    <input type="checkbox" checked={form.options.stopOnFailure} onChange={(e) => setForm({ ...form, options: { ...form.options, stopOnFailure: e.target.checked } })} className="rounded border-border text-accent focus:ring-accent" />
                    Stop on failure
                  </label>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowCreate(false)} className="flex-1 px-3 py-2 border border-border rounded-lg text-sm text-muted hover:text-white transition-colors">Cancel</button>
                <button type="submit" disabled={saving || form.scenarioIds.length === 0} className="flex-1 bg-accent text-white px-3 py-2 rounded-lg text-sm hover:bg-accent-hover transition-colors disabled:opacity-50">
                  {saving ? 'Creating...' : 'Run'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

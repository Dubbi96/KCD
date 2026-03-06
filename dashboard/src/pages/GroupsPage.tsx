import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { Plus, Trash2, Edit2, Play, Layers } from 'lucide-react';

const inputClass = 'w-full px-3 py-2 bg-card2 border border-border rounded-lg text-white text-sm focus:ring-1 focus:ring-accent focus:border-accent outline-none transition-colors';

export default function GroupsPage() {
  const [groups, setGroups] = useState<any[]>([]);
  const [scenarios, setScenarios] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    mode: 'chain' as string,
    scenarioIds: [] as string[],
    options: { speed: 1, takeScreenshots: true, headless: false, stopOnFailure: false },
  });

  const load = () => {
    setLoading(true);
    Promise.all([api.getGroups(), api.getScenarios()])
      .then(([g, s]) => { setGroups(g); setScenarios(s); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', mode: 'chain', scenarioIds: [], options: { speed: 1, takeScreenshots: true, headless: false, stopOnFailure: false } });
    setShowModal(true);
  };

  const openEdit = (group: any) => {
    setEditing(group);
    setForm({
      name: group.name,
      mode: group.mode,
      scenarioIds: group.scenarioIds || [],
      options: group.options || { speed: 1, takeScreenshots: true, headless: false, stopOnFailure: false },
    });
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await api.updateGroup(editing.id, form);
      } else {
        await api.createGroup(form);
      }
      setShowModal(false);
      load();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this group?')) return;
    setGroups((prev) => prev.filter((g) => g.id !== id));
    try {
      await api.deleteGroup(id);
    } catch (err: any) {
      alert(`Delete failed: ${err.message}`);
      load();
    }
  };

  const handleRunGroup = async (group: any) => {
    if (!group.scenarioIds?.length) { alert('Group has no scenarios'); return; }
    try {
      await api.runGroup(group.id, { platform: 'web' });
      alert('Run created successfully');
    } catch (err: any) {
      alert(err.message);
    }
  };

  const toggleScenario = (id: string) => {
    setForm((f) => ({
      ...f,
      scenarioIds: f.scenarioIds.includes(id) ? f.scenarioIds.filter((s) => s !== id) : [...f.scenarioIds, id],
    }));
  };

  const moveScenario = (idx: number, direction: 'up' | 'down') => {
    const newIds = [...form.scenarioIds];
    const target = direction === 'up' ? idx - 1 : idx + 1;
    if (target < 0 || target >= newIds.length) return;
    [newIds[idx], newIds[target]] = [newIds[target], newIds[idx]];
    setForm({ ...form, scenarioIds: newIds });
  };

  const scenarioName = (id: string) => scenarios.find((s) => s.id === id)?.name || id.slice(0, 8);

  const modeColor = (mode: string) => {
    const map: Record<string, string> = {
      chain: 'bg-blue-500/15 text-blue-400',
      batch: 'bg-green-500/15 text-green-400',
      single: 'bg-gray-500/15 text-gray-400',
    };
    return map[mode] || 'bg-gray-500/15 text-gray-400';
  };

  return (
    <div className="p-8 animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-white">Groups</h2>
          <p className="text-xs text-muted mt-0.5">{groups.length} groups</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-1.5 bg-accent text-white px-3 py-1.5 rounded-lg text-sm hover:bg-accent-hover transition-colors">
          <Plus size={14} /> New Group
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-card rounded-xl border border-border p-4 h-20 animate-shimmer bg-gradient-to-r from-card via-card2 to-card bg-[length:200%_100%]" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <div className="text-center py-16 text-muted text-sm">No groups yet. Create one to organize your scenarios.</div>
      ) : (
        <div className="space-y-2">
          {groups.map((group) => (
            <div key={group.id} className="bg-card rounded-xl border border-border p-4 hover:border-border/80 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <Layers size={18} className="text-muted flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-medium text-white truncate">{group.name}</h3>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${modeColor(group.mode)}`}>{group.mode}</span>
                    </div>
                    <p className="text-xs text-muted mt-0.5">
                      {(group.scenarioIds || []).length} scenarios &middot; {new Date(group.updatedAt || group.updated_at).toLocaleString('ko-KR')}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => handleRunGroup(group)} className="p-1.5 text-muted hover:text-green-400 transition-colors" title="Run group">
                    <Play size={14} />
                  </button>
                  <button onClick={() => openEdit(group)} className="p-1.5 text-muted hover:text-white transition-colors" title="Edit">
                    <Edit2 size={14} />
                  </button>
                  <button onClick={() => handleDelete(group.id)} className="p-1.5 text-muted hover:text-red-400 transition-colors" title="Delete">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              {(group.scenarioIds || []).length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2 pl-8">
                  {(group.scenarioIds || []).slice(0, 5).map((sid: string, i: number) => (
                    <span key={i} className="px-2 py-0.5 bg-card2 border border-border rounded text-[10px] text-muted">{scenarioName(sid)}</span>
                  ))}
                  {(group.scenarioIds || []).length > 5 && (
                    <span className="text-[10px] text-muted">+{group.scenarioIds.length - 5} more</span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowModal(false)}>
          <div className="bg-card rounded-2xl border border-border p-6 w-full max-w-lg max-h-[85vh] overflow-auto animate-modal-in" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-white mb-4">{editing ? 'Edit Group' : 'New Group'}</h3>
            <form onSubmit={handleSave} className="space-y-3">
              <div>
                <label className="block text-xs text-muted mb-1">Name</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} required />
              </div>

              <div>
                <label className="block text-xs text-muted mb-1">Mode</label>
                <div className="grid grid-cols-3 gap-2">
                  {['chain', 'batch', 'single'].map((m) => (
                    <button key={m} type="button" onClick={() => setForm({ ...form, mode: m })}
                      className={`px-3 py-2 rounded-lg text-sm border transition-colors capitalize ${form.mode === m ? 'bg-accent text-white border-accent' : 'border-border text-muted hover:text-white'}`}>
                      {m}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-muted mt-1">
                  {form.mode === 'chain' ? 'Run scenarios sequentially, passing variables between them' :
                   form.mode === 'batch' ? 'Run all scenarios in parallel' : 'Run a single scenario'}
                </p>
              </div>

              <div>
                <label className="block text-xs text-muted mb-1">Scenarios ({form.scenarioIds.length} selected)</label>
                <div className="max-h-40 overflow-auto border border-border rounded-lg divide-y divide-border/50">
                  {scenarios.length === 0 ? (
                    <div className="p-3 text-xs text-muted">No scenarios available</div>
                  ) : scenarios.map((sc) => (
                    <label key={sc.id} className="flex items-center gap-2 p-2 hover:bg-card2 cursor-pointer transition-colors">
                      <input type="checkbox" checked={form.scenarioIds.includes(sc.id)} onChange={() => toggleScenario(sc.id)} className="rounded border-border text-accent focus:ring-accent" />
                      <span className="text-xs text-white truncate">{sc.name}</span>
                      <span className="text-[10px] text-muted ml-auto">{sc.platform}</span>
                    </label>
                  ))}
                </div>
              </div>

              {form.mode === 'chain' && form.scenarioIds.length > 0 && (
                <div>
                  <label className="block text-xs text-muted mb-1">Execution Order</label>
                  <div className="space-y-1 border border-border rounded-lg p-2">
                    {form.scenarioIds.map((sid, i) => (
                      <div key={sid} className="flex items-center gap-2 bg-card2 rounded px-2 py-1.5">
                        <span className="text-[10px] text-muted w-4">{i + 1}</span>
                        <span className="text-xs text-white flex-1 truncate">{scenarioName(sid)}</span>
                        <button type="button" onClick={() => moveScenario(i, 'up')} disabled={i === 0} className="text-muted hover:text-white disabled:opacity-30 text-xs">&uarr;</button>
                        <button type="button" onClick={() => moveScenario(i, 'down')} disabled={i === form.scenarioIds.length - 1} className="text-muted hover:text-white disabled:opacity-30 text-xs">&darr;</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs text-muted mb-2">Options</label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex items-center gap-2 text-xs text-white cursor-pointer">
                    <input type="checkbox" checked={form.options.takeScreenshots} onChange={(e) => setForm({ ...form, options: { ...form.options, takeScreenshots: e.target.checked } })} className="rounded border-border text-accent focus:ring-accent" />
                    Screenshots
                  </label>
                  <label className="flex items-center gap-2 text-xs text-white cursor-pointer">
                    <input type="checkbox" checked={form.options.headless} onChange={(e) => setForm({ ...form, options: { ...form.options, headless: e.target.checked } })} className="rounded border-border text-accent focus:ring-accent" />
                    Headless
                  </label>
                  <label className="flex items-center gap-2 text-xs text-white cursor-pointer">
                    <input type="checkbox" checked={form.options.stopOnFailure} onChange={(e) => setForm({ ...form, options: { ...form.options, stopOnFailure: e.target.checked } })} className="rounded border-border text-accent focus:ring-accent" />
                    Stop on failure
                  </label>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-3 py-2 border border-border rounded-lg text-sm text-muted hover:text-white transition-colors">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 bg-accent text-white px-3 py-2 rounded-lg text-sm hover:bg-accent-hover transition-colors disabled:opacity-50">
                  {saving ? 'Saving...' : editing ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

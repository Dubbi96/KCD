import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { Plus, Trash2, Edit2, Play, GitBranch, ChevronRight } from 'lucide-react';

const inputClass = 'w-full px-3 py-2 bg-card2 border border-border rounded-lg text-white text-sm focus:ring-1 focus:ring-accent focus:border-accent outline-none transition-colors';

export default function StreamsPage() {
  const [streams, setStreams] = useState<any[]>([]);
  const [scenarios, setScenarios] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    mode: 'AUTO' as string,
    description: '',
    items: [] as { type: string; refId: string }[],
  });

  const load = () => {
    setLoading(true);
    Promise.all([api.getStreams(), api.getScenarios(), api.getGroups()])
      .then(([st, sc, gr]) => { setStreams(st); setScenarios(sc); setGroups(gr); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', mode: 'AUTO', description: '', items: [] });
    setShowModal(true);
  };

  const openEdit = (stream: any) => {
    setEditing(stream);
    setForm({
      name: stream.name,
      mode: stream.mode,
      description: stream.description || '',
      items: (stream.items || []).map((it: any) => ({ type: it.type, refId: it.refId })),
    });
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await api.updateStream(editing.id, form);
      } else {
        await api.createStream(form);
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
    if (!confirm('Delete this stream?')) return;
    setStreams((prev) => prev.filter((s) => s.id !== id));
    try {
      await api.deleteStream(id);
    } catch (err: any) {
      alert(`Delete failed: ${err.message}`);
      load();
    }
  };

  const handleRunStream = async (stream: any) => {
    if (!(stream.items || []).length) { alert('Stream has no items'); return; }
    try {
      await api.runStream(stream.id, { platform: 'web' });
      alert('Run created successfully');
    } catch (err: any) {
      alert(err.message);
    }
  };

  const addItem = (type: string, refId: string) => {
    setForm({ ...form, items: [...form.items, { type, refId }] });
  };

  const removeItem = (idx: number) => {
    setForm({ ...form, items: form.items.filter((_, i) => i !== idx) });
  };

  const moveItem = (idx: number, direction: 'up' | 'down') => {
    const newItems = [...form.items];
    const target = direction === 'up' ? idx - 1 : idx + 1;
    if (target < 0 || target >= newItems.length) return;
    [newItems[idx], newItems[target]] = [newItems[target], newItems[idx]];
    setForm({ ...form, items: newItems });
  };

  const refName = (type: string, refId: string) => {
    if (type === 'SCENARIO') return scenarios.find((s) => s.id === refId)?.name || refId.slice(0, 8);
    return groups.find((g) => g.id === refId)?.name || refId.slice(0, 8);
  };

  return (
    <div className="p-8 animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-white">Streams</h2>
          <p className="text-xs text-muted mt-0.5">Ordered sequences of scenarios and groups for scheduling</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-1.5 bg-accent text-white px-3 py-1.5 rounded-lg text-sm hover:bg-accent-hover transition-colors">
          <Plus size={14} /> New Stream
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-card rounded-xl border border-border p-4 h-24 animate-shimmer bg-gradient-to-r from-card via-card2 to-card bg-[length:200%_100%]" />
          ))}
        </div>
      ) : streams.length === 0 ? (
        <div className="text-center py-16 text-muted text-sm">No streams yet. Create one to link scenarios/groups for scheduling.</div>
      ) : (
        <div className="space-y-2">
          {streams.map((stream) => (
            <div key={stream.id} className="bg-card rounded-xl border border-border p-4 hover:border-border/80 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <GitBranch size={18} className="text-muted flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-medium text-white truncate">{stream.name}</h3>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${stream.mode === 'AUTO' ? 'bg-green-500/15 text-green-400' : 'bg-yellow-500/15 text-yellow-400'}`}>
                        {stream.mode}
                      </span>
                      {!stream.enabled && <span className="px-1.5 py-0.5 rounded text-[10px] bg-red-500/15 text-red-400">DISABLED</span>}
                    </div>
                    {stream.description && <p className="text-xs text-muted/70 mt-0.5 truncate">{stream.description}</p>}
                    <p className="text-xs text-muted mt-0.5">{(stream.items || []).length} items</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => handleRunStream(stream)} className="p-1.5 text-muted hover:text-green-400 transition-colors" title="Run stream">
                    <Play size={14} />
                  </button>
                  <button onClick={() => openEdit(stream)} className="p-1.5 text-muted hover:text-white transition-colors" title="Edit">
                    <Edit2 size={14} />
                  </button>
                  <button onClick={() => handleDelete(stream.id)} className="p-1.5 text-muted hover:text-red-400 transition-colors" title="Delete">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {/* Stream items preview */}
              {(stream.items || []).length > 0 && (
                <div className="flex items-center gap-1 mt-3 pl-8 overflow-x-auto">
                  {(stream.items || []).map((item: any, i: number) => (
                    <div key={i} className="flex items-center gap-1 flex-shrink-0">
                      {i > 0 && <ChevronRight size={10} className="text-muted/50" />}
                      <span className={`px-2 py-0.5 rounded text-[10px] border ${item.type === 'SCENARIO' ? 'border-blue-500/30 text-blue-400' : 'border-green-500/30 text-green-400'}`}>
                        {item.type === 'SCENARIO' ? 'S' : 'G'}: {refName(item.type, item.refId)}
                      </span>
                    </div>
                  ))}
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
            <h3 className="text-base font-semibold text-white mb-4">{editing ? 'Edit Stream' : 'New Stream'}</h3>
            <form onSubmit={handleSave} className="space-y-3">
              <div>
                <label className="block text-xs text-muted mb-1">Name</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} required />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-muted mb-1">Mode</label>
                  <select value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })} className={inputClass}>
                    <option value="AUTO">AUTO</option>
                    <option value="HUMAN">HUMAN</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs text-muted mb-1">Description</label>
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} className={inputClass} />
              </div>

              {/* Stream Items */}
              <div>
                <label className="block text-xs text-muted mb-2">Items ({form.items.length})</label>
                {form.items.length > 0 && (
                  <div className="space-y-1 mb-3 border border-border rounded-lg p-2">
                    {form.items.map((item, i) => (
                      <div key={i} className="flex items-center gap-2 bg-card2 rounded px-2 py-1.5">
                        <span className="text-[10px] text-muted w-4">{i + 1}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] ${item.type === 'SCENARIO' ? 'bg-blue-500/15 text-blue-400' : 'bg-green-500/15 text-green-400'}`}>{item.type}</span>
                        <span className="text-xs text-white flex-1 truncate">{refName(item.type, item.refId)}</span>
                        <button type="button" onClick={() => moveItem(i, 'up')} disabled={i === 0} className="text-muted hover:text-white disabled:opacity-30 text-xs">&uarr;</button>
                        <button type="button" onClick={() => moveItem(i, 'down')} disabled={i === form.items.length - 1} className="text-muted hover:text-white disabled:opacity-30 text-xs">&darr;</button>
                        <button type="button" onClick={() => removeItem(i)} className="text-muted hover:text-red-400 text-xs">&times;</button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="border border-border rounded-lg p-2">
                  <p className="text-[10px] text-muted mb-1">Add Scenarios:</p>
                  <div className="max-h-28 overflow-auto space-y-0.5">
                    {scenarios.map((sc) => (
                      <button key={sc.id} type="button" onClick={() => addItem('SCENARIO', sc.id)} className="w-full text-left px-2 py-1 text-xs text-white hover:bg-card2 rounded transition-colors truncate">
                        + {sc.name}
                      </button>
                    ))}
                  </div>
                  {groups.length > 0 && (
                    <>
                      <p className="text-[10px] text-muted mb-1 mt-2">Add Groups:</p>
                      <div className="max-h-28 overflow-auto space-y-0.5">
                        {groups.map((gr) => (
                          <button key={gr.id} type="button" onClick={() => addItem('GROUP', gr.id)} className="w-full text-left px-2 py-1 text-xs text-white hover:bg-card2 rounded transition-colors truncate">
                            + {gr.name}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
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

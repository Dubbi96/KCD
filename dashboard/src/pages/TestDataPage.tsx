import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';
import { Plus, Trash2, Pencil, Database, Copy, ChevronDown, ChevronRight } from 'lucide-react';

interface DataSet {
  name: string;
  data: Record<string, string>;
}

const inputClass = 'w-full px-3 py-2 bg-card2 border border-border rounded-lg text-white text-sm focus:ring-1 focus:ring-accent focus:border-accent outline-none transition-colors';

export default function TestDataPage() {
  const [profiles, setProfiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', description: '', dataSets: [{ name: 'default', data: {} }] as DataSet[] });
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    api.getTestDataProfiles().then(setProfiles).catch(() => []).finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const openCreate = () => {
    setEditingId(null);
    setForm({ name: '', description: '', dataSets: [{ name: 'default', data: {} }] });
    setShowModal(true);
  };

  const openEdit = (p: any) => {
    setEditingId(p.id);
    setForm({
      name: p.name || '',
      description: p.description || '',
      dataSets: (p.dataSets || p.data_sets || []).length > 0
        ? p.dataSets || p.data_sets
        : [{ name: 'default', data: {} }],
    });
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { name: form.name, description: form.description, dataSets: form.dataSets };
      if (editingId) {
        await api.updateTestDataProfile(editingId, payload);
      } else {
        await api.createTestDataProfile(payload);
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
    if (!confirm('Delete this test data profile?')) return;
    setProfiles((prev) => prev.filter((p) => p.id !== id));
    try {
      await api.deleteTestDataProfile(id);
    } catch (err: any) {
      alert(`Delete failed: ${err.message}`);
      load();
    }
  };

  const handleDuplicate = async (p: any) => {
    try {
      await api.createTestDataProfile({
        name: `${p.name} (copy)`,
        description: p.description,
        dataSets: p.dataSets || p.data_sets || [],
      });
      load();
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Dataset editing helpers
  const addDataSet = () => {
    setForm((f) => ({
      ...f,
      dataSets: [...f.dataSets, { name: `set-${f.dataSets.length + 1}`, data: {} }],
    }));
  };

  const removeDataSet = (idx: number) => {
    setForm((f) => ({
      ...f,
      dataSets: f.dataSets.filter((_, i) => i !== idx),
    }));
  };

  const updateDataSetName = (idx: number, name: string) => {
    setForm((f) => {
      const dataSets = [...f.dataSets];
      dataSets[idx] = { ...dataSets[idx], name };
      return { ...f, dataSets };
    });
  };

  const updateDataSetData = (idx: number, key: string, value: string) => {
    setForm((f) => {
      const dataSets = [...f.dataSets];
      dataSets[idx] = { ...dataSets[idx], data: { ...dataSets[idx].data, [key]: value } };
      return { ...f, dataSets };
    });
  };

  const addDataField = (idx: number) => {
    const key = prompt('Variable name:');
    if (!key) return;
    updateDataSetData(idx, key, '');
  };

  const removeDataField = (dsIdx: number, key: string) => {
    setForm((f) => {
      const dataSets = [...f.dataSets];
      const data = { ...dataSets[dsIdx].data };
      delete data[key];
      dataSets[dsIdx] = { ...dataSets[dsIdx], data };
      return { ...f, dataSets };
    });
  };

  return (
    <div className="p-8 animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-white">Test Data</h2>
          <p className="text-xs text-muted mt-0.5">Manage reusable test data profiles with variable sets</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-1.5 bg-accent text-white px-3 py-1.5 rounded-lg text-sm hover:bg-accent-hover transition-colors">
          <Plus size={14} /> New Profile
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="bg-card rounded-xl border border-border p-5 h-20 animate-shimmer bg-gradient-to-r from-card via-card2 to-card bg-[length:200%_100%]" />
          ))}
        </div>
      ) : profiles.length === 0 ? (
        <div className="text-center py-16">
          <Database size={32} className="text-muted mx-auto mb-3" />
          <p className="text-muted text-sm">No test data profiles.</p>
          <p className="text-muted text-xs mt-1">Create profiles with variable sets for parameterized testing.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {profiles.map((p) => {
            const dataSets = p.dataSets || p.data_sets || [];
            const isExpanded = expandedId === p.id;
            return (
              <div key={p.id} className="bg-card rounded-xl border border-border overflow-hidden">
                <div className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <Database size={14} className="text-cyan-400 flex-shrink-0" />
                        <h3 className="text-sm font-medium text-white">{p.name}</h3>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-cyan-500/15 text-cyan-400">
                          {dataSets.length} sets
                        </span>
                      </div>
                      {p.description && <p className="text-xs text-muted ml-6">{p.description}</p>}
                      <div className="flex gap-2 mt-1 ml-6">
                        {dataSets.slice(0, 5).map((ds: DataSet, i: number) => (
                          <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-card2 text-muted">{ds.name}</span>
                        ))}
                        {dataSets.length > 5 && <span className="text-[10px] text-muted">+{dataSets.length - 5} more</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0 ml-3">
                      <button onClick={() => setExpandedId(isExpanded ? null : p.id)} className="p-1.5 text-muted hover:text-white transition-colors" title="View">
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                      <button onClick={() => openEdit(p)} className="p-1.5 text-muted hover:text-white transition-colors" title="Edit">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => handleDuplicate(p)} className="p-1.5 text-muted hover:text-white transition-colors" title="Duplicate">
                        <Copy size={14} />
                      </button>
                      <button onClick={() => handleDelete(p.id)} className="p-1.5 text-muted hover:text-red-400 transition-colors" title="Delete">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-border px-4 py-3">
                    <div className="overflow-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-left text-muted border-b border-border">
                            <th className="px-2 py-1.5 font-medium">Set Name</th>
                            {dataSets[0] && Object.keys(dataSets[0].data || {}).map((key) => (
                              <th key={key} className="px-2 py-1.5 font-medium font-mono">{key}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {dataSets.map((ds: DataSet, i: number) => (
                            <tr key={i} className="border-b border-border/50 last:border-0">
                              <td className="px-2 py-1.5 text-white font-medium">{ds.name}</td>
                              {Object.values(ds.data || {}).map((val, vi) => (
                                <td key={vi} className="px-2 py-1.5 text-white font-mono">{val}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowModal(false)}>
          <div className="bg-card rounded-2xl border border-border p-6 w-full max-w-2xl max-h-[85vh] overflow-auto animate-modal-in" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-white mb-4">
              {editingId ? 'Edit Test Data Profile' : 'New Test Data Profile'}
            </h3>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-muted mb-1">Name</label>
                  <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} required />
                </div>
                <div>
                  <label className="block text-xs text-muted mb-1">Description</label>
                  <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={inputClass} />
                </div>
              </div>

              {/* Data Sets */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs text-muted font-medium">Data Sets ({form.dataSets.length})</label>
                  <button type="button" onClick={addDataSet} className="text-xs text-accent hover:underline">+ Add Set</button>
                </div>
                <div className="space-y-3">
                  {form.dataSets.map((ds, dsIdx) => (
                    <div key={dsIdx} className="bg-card2 border border-border rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <input
                          value={ds.name}
                          onChange={(e) => updateDataSetName(dsIdx, e.target.value)}
                          className="px-2 py-1 bg-card border border-border rounded text-white text-xs font-medium w-32"
                          placeholder="Set name"
                        />
                        <button type="button" onClick={() => addDataField(dsIdx)} className="text-xs text-accent hover:underline">+ Add Variable</button>
                        <div className="flex-1" />
                        {form.dataSets.length > 1 && (
                          <button type="button" onClick={() => removeDataSet(dsIdx)} className="text-xs text-red-400 hover:underline">Remove</button>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        {Object.entries(ds.data).map(([key, val]) => (
                          <div key={key} className="flex items-center gap-2">
                            <span className="text-[11px] text-cyan-400 font-mono min-w-24">{key}</span>
                            <input
                              value={val}
                              onChange={(e) => updateDataSetData(dsIdx, key, e.target.value)}
                              className="flex-1 px-2 py-1 bg-card border border-border rounded text-white text-xs"
                              placeholder="Value"
                            />
                            <button type="button" onClick={() => removeDataField(dsIdx, key)} className="p-0.5 text-muted hover:text-red-400">
                              <Trash2 size={10} />
                            </button>
                          </div>
                        ))}
                        {Object.keys(ds.data).length === 0 && (
                          <p className="text-[11px] text-muted">No variables. Click "+ Add Variable" to start.</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-3 py-2 border border-border rounded-lg text-sm text-muted hover:text-white transition-colors">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 bg-accent text-white px-3 py-2 rounded-lg text-sm hover:bg-accent-hover transition-colors disabled:opacity-50">
                  {saving ? 'Saving...' : editingId ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

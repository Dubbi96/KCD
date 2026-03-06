import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { Plus, Trash2, Eye, Upload, Copy, FolderOpen, FolderPlus, ChevronRight, ChevronDown, Edit2, Pencil } from 'lucide-react';

const inputClass = 'w-full px-3 py-2 bg-card2 border border-border rounded-lg text-white text-sm focus:ring-1 focus:ring-accent focus:border-accent outline-none transition-colors';

export default function ScenariosPage() {
  const navigate = useNavigate();
  const [scenarios, setScenarios] = useState<any[]>([]);
  const [folders, setFolders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showFolderCreate, setShowFolderCreate] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [form, setForm] = useState({ name: '', platform: 'web', scenarioData: '' });
  const [folderForm, setFolderForm] = useState({ name: '', parentId: '' });
  const [saving, setSaving] = useState(false);
  const [editingFolder, setEditingFolder] = useState<any>(null);

  const load = () => {
    setLoading(true);
    Promise.all([
      api.getScenarios(undefined, selectedFolder || undefined),
      api.getFolders(),
    ])
      .then(([sc, fl]) => { setScenarios(sc); setFolders(fl); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(load, [selectedFolder]);

  const filtered = scenarios.filter((s) =>
    s.name.toLowerCase().includes(filter.toLowerCase())
  );

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      let scenarioData: any;
      try { scenarioData = JSON.parse(form.scenarioData); } catch { scenarioData = {}; }
      await api.createScenario({ name: form.name, platform: form.platform, scenarioData, folderId: selectedFolder });
      setShowCreate(false);
      setForm({ name: '', platform: 'web', scenarioData: '' });
      load();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this scenario?')) return;
    setScenarios((prev) => prev.filter((s) => s.id !== id));
    try {
      await api.deleteScenario(id);
    } catch (err: any) {
      alert(`Delete failed: ${err.message}`);
      load();
    }
  };

  const handleClone = async (id: string) => {
    try {
      await api.cloneScenario(id);
      load();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setForm({ ...form, scenarioData: ev.target?.result as string, name: form.name || file.name.replace(/\.json$/, '') });
    };
    reader.readAsText(file);
  };

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createFolder({ name: folderForm.name, parentId: folderForm.parentId || undefined });
      setShowFolderCreate(false);
      setFolderForm({ name: '', parentId: '' });
      load();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDeleteFolder = async (id: string) => {
    if (!confirm('Delete this folder?')) return;
    try {
      await api.deleteFolder(id);
      if (selectedFolder === id) setSelectedFolder(null);
      load();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleRenameFolder = async (id: string, name: string) => {
    try {
      await api.updateFolder(id, { name });
      setEditingFolder(null);
      load();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const toggleFolderExpand = (id: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // Build folder tree
  const rootFolders = folders.filter((f) => !f.parentId);
  const childFolders = (parentId: string) => folders.filter((f) => f.parentId === parentId);

  const FolderNode = ({ folder, depth = 0 }: { folder: any; depth?: number }) => {
    const children = childFolders(folder.id);
    const hasChildren = children.length > 0;
    const isExpanded = expandedFolders.has(folder.id);
    const isActive = selectedFolder === folder.id;

    return (
      <div>
        <div
          className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs cursor-pointer transition-colors group ${
            isActive ? 'bg-accent/20 text-white' : 'text-muted hover:bg-card2 hover:text-white'
          }`}
          style={{ paddingLeft: `${8 + depth * 12}px` }}
        >
          {hasChildren ? (
            <button onClick={(e) => { e.stopPropagation(); toggleFolderExpand(folder.id); }} className="p-0.5">
              {isExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
            </button>
          ) : (
            <span className="w-3.5" />
          )}
          <FolderOpen size={12} className="flex-shrink-0" />
          {editingFolder === folder.id ? (
            <input
              autoFocus
              defaultValue={folder.name}
              onBlur={(e) => handleRenameFolder(folder.id, e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleRenameFolder(folder.id, (e.target as HTMLInputElement).value); if (e.key === 'Escape') setEditingFolder(null); }}
              className="bg-transparent text-white text-xs outline-none border-b border-accent flex-1 w-0"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="truncate flex-1" onClick={() => setSelectedFolder(isActive ? null : folder.id)}>{folder.name}</span>
          )}
          <div className="hidden group-hover:flex items-center gap-0.5">
            <button onClick={(e) => { e.stopPropagation(); setEditingFolder(folder.id); }} className="p-0.5 text-muted hover:text-white"><Pencil size={9} /></button>
            <button onClick={(e) => { e.stopPropagation(); handleDeleteFolder(folder.id); }} className="p-0.5 text-muted hover:text-red-400"><Trash2 size={9} /></button>
          </div>
        </div>
        {isExpanded && children.map((child) => (
          <FolderNode key={child.id} folder={child} depth={depth + 1} />
        ))}
      </div>
    );
  };

  return (
    <div className="flex h-full animate-fade-in">
      {/* Folder Sidebar */}
      <div className="w-56 bg-card border-r border-border flex flex-col flex-shrink-0">
        <div className="p-3 border-b border-border flex items-center justify-between">
          <span className="text-xs font-medium text-muted">Folders</span>
          <button onClick={() => setShowFolderCreate(true)} className="p-1 text-muted hover:text-white transition-colors" title="New folder">
            <FolderPlus size={13} />
          </button>
        </div>
        <div className="flex-1 overflow-auto p-2 space-y-0.5">
          <div
            className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs cursor-pointer transition-colors ${
              !selectedFolder ? 'bg-accent/20 text-white' : 'text-muted hover:bg-card2 hover:text-white'
            }`}
            onClick={() => setSelectedFolder(null)}
          >
            <FolderOpen size={12} />
            <span>All Scenarios</span>
          </div>
          {rootFolders.map((folder) => (
            <FolderNode key={folder.id} folder={folder} />
          ))}
        </div>

        {/* Create Folder inline */}
        {showFolderCreate && (
          <div className="p-3 border-t border-border">
            <form onSubmit={handleCreateFolder} className="space-y-2">
              <input value={folderForm.name} onChange={(e) => setFolderForm({ ...folderForm, name: e.target.value })} className={`${inputClass} text-xs py-1.5`} placeholder="Folder name" required autoFocus />
              {folders.length > 0 && (
                <select value={folderForm.parentId} onChange={(e) => setFolderForm({ ...folderForm, parentId: e.target.value })} className={`${inputClass} text-xs py-1.5`}>
                  <option value="">Root level</option>
                  {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              )}
              <div className="flex gap-1">
                <button type="button" onClick={() => setShowFolderCreate(false)} className="flex-1 px-2 py-1 border border-border rounded text-[10px] text-muted hover:text-white transition-colors">Cancel</button>
                <button type="submit" className="flex-1 bg-accent text-white px-2 py-1 rounded text-[10px] hover:bg-accent-hover transition-colors">Create</button>
              </div>
            </form>
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 p-8 overflow-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">
            {selectedFolder ? folders.find((f) => f.id === selectedFolder)?.name || 'Scenarios' : 'All Scenarios'}
          </h2>
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 bg-accent text-white px-3 py-1.5 rounded-lg text-sm hover:bg-accent-hover transition-colors">
            <Plus size={14} /> New Scenario
          </button>
        </div>

        <input
          placeholder="Search scenarios..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="w-full px-3 py-2 bg-card border border-border rounded-lg text-white text-sm placeholder-muted/50 focus:ring-1 focus:ring-accent outline-none mb-4"
        />

        {loading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-card rounded-xl border border-border p-4 h-16 animate-shimmer bg-gradient-to-r from-card via-card2 to-card bg-[length:200%_100%]" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-muted text-sm">
            {scenarios.length === 0 ? 'No scenarios yet. Upload or create one.' : 'No matching scenarios.'}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((s) => {
              return (
                <div key={s.id} className="bg-card rounded-xl border border-border p-4 flex items-center justify-between hover:border-border/80 transition-colors">
                  <div className="min-w-0 flex-1 cursor-pointer" onClick={() => navigate(`/scenarios/${s.id}`)}>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-medium text-white truncate">{s.name}</h3>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-500/15 text-blue-400 uppercase">{s.platform}</span>
                      {s.tcId && <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-500/15 text-gray-400 font-mono">TC:{s.tcId}</span>}
                    </div>
                    <p className="text-xs text-muted mt-0.5">
                      v{s.version} &middot; {s.stepCount ?? 0} steps &middot; {new Date(s.updatedAt || s.updated_at).toLocaleString('ko-KR')}
                    </p>
                    {s.tags?.length > 0 && (
                      <div className="flex gap-1 mt-1">
                        {s.tags.slice(0, 4).map((tag: string) => (
                          <span key={tag} className="px-1.5 py-0.5 rounded text-[9px] bg-card2 text-muted border border-border">{tag}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => navigate(`/scenarios/${s.id}`)} className="p-1.5 text-muted hover:text-white transition-colors" title="Edit">
                      <Edit2 size={14} />
                    </button>
                    <button onClick={() => handleClone(s.id)} className="p-1.5 text-muted hover:text-white transition-colors" title="Clone">
                      <Copy size={14} />
                    </button>
                    <button onClick={() => handleDelete(s.id)} className="p-1.5 text-muted hover:text-red-400 transition-colors" title="Delete">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create Scenario Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowCreate(false)}>
          <div className="bg-card rounded-2xl border border-border p-6 w-full max-w-md animate-modal-in" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-white mb-4">New Scenario</h3>
            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <label className="block text-xs text-muted mb-1">Name</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} required />
              </div>
              <div>
                <label className="block text-xs text-muted mb-1">Platform</label>
                <select value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })} className={inputClass}>
                  <option value="web">Web</option>
                  <option value="ios">iOS</option>
                  <option value="android">Android</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-muted mb-1">Scenario Data (JSON)</label>
                <textarea value={form.scenarioData} onChange={(e) => setForm({ ...form, scenarioData: e.target.value })} rows={6} className={`${inputClass} font-mono text-xs`} placeholder="{}" />
              </div>
              <label className="flex items-center gap-2 text-xs text-accent cursor-pointer hover:underline">
                <Upload size={12} /> Upload JSON file
                <input type="file" accept=".json" className="hidden" onChange={handleFileUpload} />
              </label>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowCreate(false)} className="flex-1 px-3 py-2 border border-border rounded-lg text-sm text-muted hover:text-white transition-colors">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 bg-accent text-white px-3 py-2 rounded-lg text-sm hover:bg-accent-hover transition-colors disabled:opacity-50">
                  {saving ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

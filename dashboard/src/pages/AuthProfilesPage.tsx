import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { Plus, Trash2, Edit2, Key, Globe, Cookie } from 'lucide-react';

const inputClass = 'w-full px-3 py-2 bg-card2 border border-border rounded-lg text-white text-sm focus:ring-1 focus:ring-accent focus:border-accent outline-none transition-colors';

export default function AuthProfilesPage() {
  const [profiles, setProfiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [detail, setDetail] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    domain: '',
    cookies: '[]',
    localStorage: '{}',
    sessionStorage: '{}',
    headers: '{}',
  });

  const load = () => {
    setLoading(true);
    api.getAuthProfiles().then(setProfiles).catch(() => []).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', domain: '', cookies: '[]', localStorage: '{}', sessionStorage: '{}', headers: '{}' });
    setShowModal(true);
  };

  const openEdit = async (profile: any) => {
    try {
      const full = await api.getAuthProfile(profile.id);
      const pd = full.profileData || {};
      setEditing(full);
      setForm({
        name: full.name,
        domain: full.domain || '',
        cookies: JSON.stringify(pd.cookies || [], null, 2),
        localStorage: JSON.stringify(pd.localStorage || {}, null, 2),
        sessionStorage: JSON.stringify(pd.sessionStorage || {}, null, 2),
        headers: JSON.stringify(pd.headers || {}, null, 2),
      });
      setShowModal(true);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const viewDetail = async (profile: any) => {
    try {
      const full = await api.getAuthProfile(profile.id);
      setDetail(full);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const data = {
        name: form.name,
        domain: form.domain,
        profileData: {
          cookies: JSON.parse(form.cookies),
          localStorage: JSON.parse(form.localStorage),
          sessionStorage: JSON.parse(form.sessionStorage),
          headers: JSON.parse(form.headers),
        },
      };
      if (editing) {
        await api.updateAuthProfile(editing.id, data);
      } else {
        await api.createAuthProfile(data);
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
    if (!confirm('Delete this auth profile?')) return;
    setProfiles((prev) => prev.filter((p) => p.id !== id));
    try {
      await api.deleteAuthProfile(id);
    } catch (err: any) {
      alert(`Delete failed: ${err.message}`);
      load();
    }
  };

  const getPd = (d: any) => d?.profileData || {};

  return (
    <div className="p-8 animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-white">Auth Profiles</h2>
          <p className="text-xs text-muted mt-0.5">Manage browser authentication states for test scenarios</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-1.5 bg-accent text-white px-3 py-1.5 rounded-lg text-sm hover:bg-accent-hover transition-colors">
          <Plus size={14} /> New Profile
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-card rounded-xl border border-border p-4 h-20 animate-shimmer bg-gradient-to-r from-card via-card2 to-card bg-[length:200%_100%]" />
          ))}
        </div>
      ) : profiles.length === 0 ? (
        <div className="text-center py-16 text-muted text-sm">No auth profiles yet. Create one to inject cookies/storage into test runs.</div>
      ) : (
        <div className="space-y-2">
          {profiles.map((profile) => (
            <div key={profile.id} className="bg-card rounded-xl border border-border p-4 hover:border-border/80 transition-colors cursor-pointer" onClick={() => viewDetail(profile)}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <Key size={18} className="text-muted flex-shrink-0" />
                  <div className="min-w-0">
                    <h3 className="text-sm font-medium text-white truncate">{profile.name}</h3>
                    {profile.domain && (
                      <div className="flex items-center gap-2 mt-0.5">
                        <Globe size={10} className="text-muted" />
                        <span className="text-xs text-muted truncate">{profile.domain}</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => openEdit(profile)} className="p-1.5 text-muted hover:text-white transition-colors" title="Edit">
                    <Edit2 size={14} />
                  </button>
                  <button onClick={() => handleDelete(profile.id)} className="p-1.5 text-muted hover:text-red-400 transition-colors" title="Delete">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail Modal */}
      {detail && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setDetail(null)}>
          <div className="bg-card rounded-2xl border border-border p-6 w-full max-w-lg max-h-[80vh] overflow-auto animate-modal-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-white">{detail.name}</h3>
              <span className="text-xs text-muted">{detail.domain}</span>
            </div>

            {getPd(detail).cookies?.length > 0 && (
              <div className="mb-4">
                <h4 className="text-xs font-medium text-muted mb-2 flex items-center gap-1"><Cookie size={12} /> Cookies ({getPd(detail).cookies.length})</h4>
                <div className="space-y-1 max-h-40 overflow-auto">
                  {getPd(detail).cookies.map((c: any, i: number) => (
                    <div key={i} className="bg-card2 border border-border rounded px-2 py-1.5 text-xs">
                      <span className="text-white font-mono">{c.name}</span>
                      <span className="text-muted ml-2 truncate">{c.domain || ''}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {Object.keys(getPd(detail).localStorage || {}).length > 0 && (
              <div className="mb-4">
                <h4 className="text-xs font-medium text-muted mb-2">Local Storage ({Object.keys(getPd(detail).localStorage).length} keys)</h4>
                <pre className="bg-card2 border border-border rounded-lg p-2 text-xs text-white font-mono overflow-auto max-h-32">{JSON.stringify(getPd(detail).localStorage, null, 2)}</pre>
              </div>
            )}

            {Object.keys(getPd(detail).headers || {}).length > 0 && (
              <div className="mb-4">
                <h4 className="text-xs font-medium text-muted mb-2">Headers</h4>
                <pre className="bg-card2 border border-border rounded-lg p-2 text-xs text-white font-mono overflow-auto max-h-32">{JSON.stringify(getPd(detail).headers, null, 2)}</pre>
              </div>
            )}

            {/* Raw profile data */}
            <details className="text-xs mb-4">
              <summary className="text-muted cursor-pointer hover:text-white transition-colors">Raw Profile Data</summary>
              <pre className="mt-2 bg-card2 border border-border rounded-lg p-2 text-white font-mono overflow-auto max-h-48">
                {JSON.stringify(detail.profileData, null, 2)}
              </pre>
            </details>

            <button onClick={() => setDetail(null)} className="w-full mt-2 px-3 py-2 border border-border rounded-lg text-sm text-muted hover:text-white transition-colors">Close</button>
          </div>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowModal(false)}>
          <div className="bg-card rounded-2xl border border-border p-6 w-full max-w-lg max-h-[85vh] overflow-auto animate-modal-in" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-white mb-4">{editing ? 'Edit Auth Profile' : 'New Auth Profile'}</h3>
            <form onSubmit={handleSave} className="space-y-3">
              <div>
                <label className="block text-xs text-muted mb-1">Name</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} required />
              </div>
              <div>
                <label className="block text-xs text-muted mb-1">Domain</label>
                <input value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })} className={inputClass} placeholder="https://example.com" />
              </div>
              <div>
                <label className="block text-xs text-muted mb-1">Cookies (JSON array)</label>
                <textarea value={form.cookies} onChange={(e) => setForm({ ...form, cookies: e.target.value })} rows={4} className={`${inputClass} font-mono text-xs`} />
              </div>
              <div>
                <label className="block text-xs text-muted mb-1">Local Storage (JSON object)</label>
                <textarea value={form.localStorage} onChange={(e) => setForm({ ...form, localStorage: e.target.value })} rows={3} className={`${inputClass} font-mono text-xs`} />
              </div>
              <div>
                <label className="block text-xs text-muted mb-1">Session Storage (JSON object)</label>
                <textarea value={form.sessionStorage} onChange={(e) => setForm({ ...form, sessionStorage: e.target.value })} rows={3} className={`${inputClass} font-mono text-xs`} />
              </div>
              <div>
                <label className="block text-xs text-muted mb-1">Headers (JSON object)</label>
                <textarea value={form.headers} onChange={(e) => setForm({ ...form, headers: e.target.value })} rows={3} className={`${inputClass} font-mono text-xs`} />
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

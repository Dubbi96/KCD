import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';
import {
  Plus, Trash2, Webhook, Pencil, Zap, ToggleLeft, ToggleRight,
  ChevronDown, ChevronRight, Clock, CheckCircle, XCircle, AlertTriangle,
} from 'lucide-react';

const EVENT_TYPES = [
  { value: 'run.created', label: 'Run Created' },
  { value: 'run.started', label: 'Run Started' },
  { value: 'run.completed', label: 'Run Completed' },
  { value: 'run.failed', label: 'Run Failed' },
  { value: 'run.cancelled', label: 'Run Cancelled' },
  { value: 'scenario.started', label: 'Scenario Started' },
  { value: 'scenario.passed', label: 'Scenario Passed' },
  { value: 'scenario.failed', label: 'Scenario Failed' },
  { value: 'scenario.skipped', label: 'Scenario Skipped' },
  { value: 'retry.scheduled', label: 'Retry Scheduled' },
  { value: 'retry.exhausted', label: 'Retry Exhausted' },
];

const CHANNEL_TYPES = [
  { value: 'generic', label: 'Generic (JSON)' },
  { value: 'slack', label: 'Slack' },
  { value: 'discord', label: 'Discord' },
  { value: 'teams', label: 'Microsoft Teams' },
];

const defaultForm = {
  name: '',
  url: '',
  secret: '',
  type: 'generic',
  eventsFilter: [] as string[],
  enabled: true,
};

export default function WebhooksPage() {
  const [webhooks, setWebhooks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...defaultForm });
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api.getWebhooks().then(setWebhooks).catch(() => []).finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const loadEvents = async (webhookId: string) => {
    setEventsLoading(true);
    try {
      const data = await api.getWebhookEvents(webhookId);
      setEvents(Array.isArray(data) ? data : data.events || []);
    } catch {
      setEvents([]);
    } finally {
      setEventsLoading(false);
    }
  };

  const toggleExpand = (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
    } else {
      setExpandedId(id);
      loadEvents(id);
    }
  };

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...defaultForm });
    setShowModal(true);
  };

  const openEdit = (w: any) => {
    setEditingId(w.id);
    setForm({
      name: w.name || '',
      url: w.url || '',
      secret: w.secret || '',
      type: w.type || 'generic',
      eventsFilter: w.eventsFilter || w.events_filter || w.events || [],
      enabled: w.enabled !== false,
    });
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        url: form.url,
        secret: form.secret || undefined,
        type: form.type,
        eventsFilter: form.eventsFilter,
        enabled: form.enabled,
      };
      if (editingId) {
        await api.updateWebhook(editingId, payload);
      } else {
        await api.createWebhook(payload);
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
    if (!confirm('Delete this webhook?')) return;
    setWebhooks((prev) => prev.filter((w) => w.id !== id));
    try {
      await api.deleteWebhook(id);
    } catch (err: any) {
      alert(`Delete failed: ${err.message}`);
      load();
    }
  };

  const handleToggle = async (w: any) => {
    const next = !(w.enabled !== false);
    setWebhooks((prev) => prev.map((x) => x.id === w.id ? { ...x, enabled: next } : x));
    try {
      await api.updateWebhook(w.id, { enabled: next });
    } catch (err: any) {
      alert(`Toggle failed: ${err.message}`);
      load();
    }
  };

  const handleTest = async (id: string) => {
    try {
      await api.testWebhook(id);
      alert('Test event sent');
    } catch (err: any) {
      alert(`Test failed: ${err.message}`);
    }
  };

  const toggleEvent = (ev: string) => {
    setForm((f) => ({
      ...f,
      eventsFilter: f.eventsFilter.includes(ev)
        ? f.eventsFilter.filter((e) => e !== ev)
        : [...f.eventsFilter, ev],
    }));
  };

  const channelBadgeColor = (type: string) => {
    const map: Record<string, string> = {
      slack: 'bg-green-500/15 text-green-400',
      discord: 'bg-indigo-500/15 text-indigo-400',
      teams: 'bg-blue-500/15 text-blue-400',
      generic: 'bg-gray-500/15 text-gray-400',
    };
    return map[type] || 'bg-gray-500/15 text-gray-400';
  };

  const eventStatusIcon = (status: string) => {
    switch (status) {
      case 'delivered': return <CheckCircle size={12} className="text-green-400" />;
      case 'failed': case 'exhausted': return <XCircle size={12} className="text-red-400" />;
      case 'pending': return <Clock size={12} className="text-yellow-400" />;
      default: return <AlertTriangle size={12} className="text-gray-400" />;
    }
  };

  const inputClass = 'w-full px-3 py-2 bg-card2 border border-border rounded-lg text-white text-sm focus:ring-1 focus:ring-accent focus:border-accent outline-none transition-colors';

  return (
    <div className="p-8 animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-white">Webhooks</h2>
          <p className="text-xs text-muted mt-0.5">Get notified on Slack, Discord, Teams, or custom endpoints</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-1.5 bg-accent text-white px-3 py-1.5 rounded-lg text-sm hover:bg-accent-hover transition-colors">
          <Plus size={14} /> Add Webhook
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="bg-card rounded-xl border border-border p-5 h-20 animate-shimmer bg-gradient-to-r from-card via-card2 to-card bg-[length:200%_100%]" />
          ))}
        </div>
      ) : webhooks.length === 0 ? (
        <div className="text-center py-16">
          <Webhook size={32} className="text-muted mx-auto mb-3" />
          <p className="text-muted text-sm">No webhooks configured.</p>
          <p className="text-muted text-xs mt-1">Add a webhook to receive notifications on Slack, Discord, or your API.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {webhooks.map((w) => {
            const isExpanded = expandedId === w.id;
            const filterEvents = w.eventsFilter || w.events_filter || w.events || [];

            return (
              <div key={w.id} className="bg-card rounded-xl border border-border overflow-hidden">
                <div className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        {w.name && <span className="text-sm text-white font-medium">{w.name}</span>}
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium uppercase ${channelBadgeColor(w.type || 'generic')}`}>
                          {w.type || 'generic'}
                        </span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${(w.enabled !== false) ? 'bg-green-500/15 text-green-400' : 'bg-gray-500/15 text-gray-400'}`}>
                          {(w.enabled !== false) ? 'Active' : 'Paused'}
                        </span>
                      </div>
                      <p className="text-xs text-muted font-mono truncate">{w.url}</p>
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        {filterEvents.map((ev: string) => (
                          <span key={ev} className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-500/15 text-purple-400">{ev}</span>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0 ml-3">
                      <button onClick={() => handleToggle(w)} className={`p-1.5 transition-colors ${(w.enabled !== false) ? 'text-green-400' : 'text-gray-500'}`} title="Toggle">
                        {(w.enabled !== false) ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                      </button>
                      <button onClick={() => handleTest(w.id)} className="p-1.5 text-muted hover:text-yellow-400 transition-colors" title="Test">
                        <Zap size={14} />
                      </button>
                      <button onClick={() => openEdit(w)} className="p-1.5 text-muted hover:text-white transition-colors" title="Edit">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => toggleExpand(w.id)} className="p-1.5 text-muted hover:text-white transition-colors" title="Events">
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                      <button onClick={() => handleDelete(w.id)} className="p-1.5 text-muted hover:text-red-400 transition-colors" title="Delete">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Event History */}
                {isExpanded && (
                  <div className="border-t border-border px-4 py-3">
                    <h4 className="text-xs font-medium text-muted mb-2">Recent Events</h4>
                    {eventsLoading ? (
                      <p className="text-xs text-muted">Loading...</p>
                    ) : events.length === 0 ? (
                      <p className="text-xs text-muted">No events yet.</p>
                    ) : (
                      <div className="space-y-1">
                        {events.slice(0, 10).map((ev: any) => (
                          <div key={ev.id} className="flex items-center gap-2 text-xs py-1.5 border-b border-border/30 last:border-0">
                            {eventStatusIcon(ev.status)}
                            <span className="text-white font-mono min-w-32">{ev.eventType || ev.event_type}</span>
                            <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                              ev.status === 'delivered' ? 'bg-green-500/15 text-green-400' :
                              ev.status === 'failed' || ev.status === 'exhausted' ? 'bg-red-500/15 text-red-400' :
                              'bg-yellow-500/15 text-yellow-400'
                            }`}>{ev.status}</span>
                            <span className="text-muted">attempt {ev.attempt || 0}</span>
                            <span className="text-muted ml-auto">
                              {new Date(ev.createdAt || ev.created_at).toLocaleString('ko-KR')}
                            </span>
                            {ev.lastError && (
                              <span className="text-red-400 truncate max-w-32" title={ev.lastError}>{ev.lastError}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
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
          <div className="bg-card rounded-2xl border border-border p-6 w-full max-w-md max-h-[85vh] overflow-auto animate-modal-in" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-white mb-4">
              {editingId ? 'Edit Webhook' : 'Add Webhook'}
            </h3>
            <form onSubmit={handleSave} className="space-y-3">
              <div>
                <label className="block text-xs text-muted mb-1">Name</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} placeholder="My Slack Notification" />
              </div>

              <div>
                <label className="block text-xs text-muted mb-1">URL</label>
                <input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} className={inputClass} placeholder="https://hooks.slack.com/..." required />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-muted mb-1">Channel Type</label>
                  <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className={inputClass}>
                    {CHANNEL_TYPES.map((ch) => (
                      <option key={ch.value} value={ch.value}>{ch.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-muted mb-1">Secret (optional)</label>
                  <input value={form.secret} onChange={(e) => setForm({ ...form, secret: e.target.value })} className={`${inputClass} font-mono`} placeholder="whsec_..." />
                </div>
              </div>

              <div>
                <label className="block text-xs text-muted mb-1">Events ({form.eventsFilter.length} selected)</label>
                <div className="max-h-48 overflow-auto border border-border rounded-lg divide-y divide-border/50">
                  {EVENT_TYPES.map((ev) => (
                    <label key={ev.value} className="flex items-center gap-2 p-2 hover:bg-card2 cursor-pointer transition-colors">
                      <input
                        type="checkbox"
                        checked={form.eventsFilter.includes(ev.value)}
                        onChange={() => toggleEvent(ev.value)}
                        className="rounded border-border text-accent focus:ring-accent"
                      />
                      <span className="text-xs text-white">{ev.label}</span>
                      <span className="text-[10px] text-muted ml-auto font-mono">{ev.value}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-3 pt-1">
                <label className="text-xs text-muted">Enabled</label>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, enabled: !form.enabled })}
                  className={`transition-colors ${form.enabled ? 'text-green-400' : 'text-gray-500'}`}
                >
                  {form.enabled ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
                </button>
              </div>

              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-3 py-2 border border-border rounded-lg text-sm text-muted hover:text-white transition-colors">Cancel</button>
                <button type="submit" disabled={saving || form.eventsFilter.length === 0} className="flex-1 bg-accent text-white px-3 py-2 rounded-lg text-sm hover:bg-accent-hover transition-colors disabled:opacity-50">
                  {saving ? 'Saving...' : editingId ? 'Update' : 'Add'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

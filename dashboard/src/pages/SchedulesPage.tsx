import { useState, useEffect, useMemo, useCallback } from 'react';
import { api } from '../api/client';
import {
  Plus, Trash2, Play, Clock, Pencil, ChevronRight, ChevronDown,
  CornerDownRight, ToggleLeft, ToggleRight, Zap,
} from 'lucide-react';

interface Schedule {
  id: string;
  name: string;
  type: 'CRON' | 'AT' | 'AFTER';
  streamId: string;
  cronExpr?: string;
  timezone?: string;
  runAt?: number;
  delayMs?: number;
  afterStreamId?: string;
  triggerOn?: string;
  overlapPolicy?: string;
  misfirePolicy?: string;
  enabled: boolean;
  orderNo?: number;
  // snake_case variants from API
  stream_id?: string;
  cron_expr?: string;
  run_at?: number;
  delay_ms?: number;
  after_stream_id?: string;
  trigger_on?: string;
  overlap_policy?: string;
  misfire_policy?: string;
  order_no?: number;
}

interface Stream {
  id: string;
  name: string;
  mode?: string;
}

interface TreeNode {
  schedule: Schedule;
  children: TreeNode[];
  depth: number;
}

/** Normalize snake_case API fields to camelCase */
function normalize(s: any): Schedule {
  return {
    ...s,
    streamId: s.streamId || s.stream_id,
    cronExpr: s.cronExpr || s.cron_expr,
    runAt: s.runAt || s.run_at,
    delayMs: s.delayMs ?? s.delay_ms ?? 0,
    afterStreamId: s.afterStreamId || s.after_stream_id,
    triggerOn: s.triggerOn || s.trigger_on || 'DONE',
    overlapPolicy: s.overlapPolicy || s.overlap_policy || 'SKIP',
    misfirePolicy: s.misfirePolicy || s.misfire_policy || 'RUN_LATEST_ONLY',
    orderNo: s.orderNo ?? s.order_no ?? 0,
  };
}

const defaultForm = {
  name: '',
  type: 'CRON' as 'CRON' | 'AT' | 'AFTER',
  streamId: '',
  cronExpr: '',
  timezone: 'Asia/Seoul',
  runAt: '',
  delayMs: 10000,
  afterStreamId: '',
  triggerOn: 'DONE' as string,
  overlapPolicy: 'SKIP' as string,
  misfirePolicy: 'RUN_LATEST_ONLY' as string,
  enabled: true,
};

export default function SchedulesPage() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [streams, setStreams] = useState<Stream[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...defaultForm });
  const [saving, setSaving] = useState(false);
  const [cronPreview, setCronPreview] = useState<string[]>([]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.getSchedules().catch(() => []),
      api.getStreams().catch(() => []),
    ])
      .then(([sched, str]) => {
        setSchedules(sched.map(normalize));
        setStreams(str);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  // Stream name lookup
  const streamMap = useMemo(() => {
    const m = new Map<string, Stream>();
    streams.forEach((s) => m.set(s.id, s));
    return m;
  }, [streams]);

  // Build hierarchy tree: AFTER schedules whose afterStreamId matches a parent's streamId
  const treeRows = useMemo(() => {
    // Map streamId → schedule (the schedule that RUNS this stream)
    const byStreamId = new Map<string, Schedule[]>();
    schedules.forEach((s) => {
      if (!s.streamId) return;
      const arr = byStreamId.get(s.streamId) || [];
      arr.push(s);
      byStreamId.set(s.streamId, arr);
    });

    // Find children: schedules whose afterStreamId === parent.streamId
    function getChildren(parentStreamId: string): Schedule[] {
      return schedules.filter((s) => s.type === 'AFTER' && s.afterStreamId === parentStreamId);
    }

    // Root nodes: non-AFTER or AFTER whose afterStreamId doesn't match any schedule's streamId
    const childIds = new Set<string>();
    schedules.forEach((s) => {
      if (s.type === 'AFTER' && s.afterStreamId) {
        // Check if afterStreamId belongs to another schedule's streamId
        const parentExists = schedules.some((p) => p.streamId === s.afterStreamId && p.id !== s.id);
        if (parentExists) childIds.add(s.id);
      }
    });

    const roots = schedules.filter((s) => !childIds.has(s.id));

    // Flatten tree with depth
    const rows: { schedule: Schedule; depth: number; hasChildren: boolean }[] = [];
    function walk(sched: Schedule, depth: number) {
      const children = getChildren(sched.streamId);
      rows.push({ schedule: sched, depth, hasChildren: children.length > 0 });
      if (!collapsed.has(sched.id)) {
        children
          .sort((a, b) => (a.orderNo || 0) - (b.orderNo || 0))
          .forEach((child) => walk(child, depth + 1));
      }
    }

    roots
      .sort((a, b) => (a.orderNo || 0) - (b.orderNo || 0))
      .forEach((r) => walk(r, 0));

    return rows;
  }, [schedules, collapsed]);

  const toggleCollapse = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Format trigger info
  const triggerInfo = (s: Schedule) => {
    if (s.type === 'CRON') return s.cronExpr || '-';
    if (s.type === 'AT') {
      if (!s.runAt) return '-';
      return new Date(Number(s.runAt)).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
    }
    if (s.type === 'AFTER') {
      const afterStream = s.afterStreamId ? streamMap.get(s.afterStreamId) : null;
      const name = afterStream?.name || s.afterStreamId?.slice(0, 8) || '-';
      const delay = s.delayMs ? `+${s.delayMs / 1000}s` : '';
      const on = s.triggerOn !== 'DONE' ? ` (${s.triggerOn})` : '';
      return `${name} ${delay}${on}`;
    }
    return '-';
  };

  const policyText = (s: Schedule) => {
    const parts: string[] = [];
    if (s.overlapPolicy && s.overlapPolicy !== 'SKIP') parts.push(`overlap:${s.overlapPolicy}`);
    if (s.misfirePolicy && s.misfirePolicy !== 'RUN_LATEST_ONLY') parts.push(`misfire:${s.misfirePolicy}`);
    if (parts.length === 0) return 'default';
    return parts.join(', ');
  };

  // Modal helpers
  const openCreate = () => {
    setEditingId(null);
    setForm({ ...defaultForm, streamId: streams[0]?.id || '' });
    setCronPreview([]);
    setShowModal(true);
  };

  const openEdit = (s: Schedule) => {
    setEditingId(s.id);
    setForm({
      name: s.name,
      type: s.type,
      streamId: s.streamId || '',
      cronExpr: s.cronExpr || '',
      timezone: s.timezone || 'Asia/Seoul',
      runAt: s.runAt ? new Date(Number(s.runAt)).toISOString().slice(0, 16) : '',
      delayMs: s.delayMs || 10000,
      afterStreamId: s.afterStreamId || '',
      triggerOn: s.triggerOn || 'DONE',
      overlapPolicy: s.overlapPolicy || 'SKIP',
      misfirePolicy: s.misfirePolicy || 'RUN_LATEST_ONLY',
      enabled: s.enabled,
    });
    setCronPreview([]);
    setShowModal(true);
  };

  const handleCronPreview = async () => {
    if (!form.cronExpr) return;
    try {
      const res = await api.cronPreview({ cronExpr: form.cronExpr, count: 5, timezone: form.timezone });
      setCronPreview(res.nextRuns || []);
    } catch {
      setCronPreview([]);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: any = {
        name: form.name,
        streamId: form.streamId,
        type: form.type,
        overlapPolicy: form.overlapPolicy,
        misfirePolicy: form.misfirePolicy,
        enabled: form.enabled,
      };

      if (form.type === 'CRON') {
        payload.cronExpr = form.cronExpr;
        payload.timezone = form.timezone;
      } else if (form.type === 'AT') {
        payload.runAt = form.runAt ? new Date(form.runAt).getTime() : undefined;
      } else if (form.type === 'AFTER') {
        payload.afterStreamId = form.afterStreamId;
        payload.delayMs = Number(form.delayMs) || 0;
        payload.triggerOn = form.triggerOn;
      }

      if (editingId) {
        await api.updateSchedule(editingId, payload);
      } else {
        await api.createSchedule(payload);
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
    if (!confirm('Delete this schedule?')) return;
    setSchedules((prev) => prev.filter((s) => s.id !== id));
    try {
      await api.deleteSchedule(id);
    } catch (err: any) {
      alert(`Delete failed: ${err.message}`);
      load();
    }
  };

  const handleToggle = async (s: Schedule) => {
    const next = !s.enabled;
    setSchedules((prev) => prev.map((x) => (x.id === s.id ? { ...x, enabled: next } : x)));
    try {
      await api.updateSchedule(s.id, { enabled: next });
    } catch (err: any) {
      alert(`Toggle failed: ${err.message}`);
      load();
    }
  };

  const handleRunNow = async (id: string) => {
    try {
      await api.runScheduleNow(id);
      alert('Run created');
    } catch (err: any) {
      alert(err.message);
    }
  };

  const typeColor = (t: string) => {
    const map: Record<string, string> = {
      CRON: 'bg-purple-500/15 text-purple-400',
      AT: 'bg-orange-500/15 text-orange-400',
      AFTER: 'bg-cyan-500/15 text-cyan-400',
    };
    return map[t] || 'bg-gray-500/15 text-gray-400';
  };

  const inputClass =
    'w-full px-3 py-2 bg-card2 border border-border rounded-lg text-white text-sm focus:ring-1 focus:ring-accent focus:border-accent outline-none transition-colors';

  // Streams that are assigned to an AFTER trigger (to show in "after" dropdown, we show streams assigned to OTHER schedules)
  const afterStreamOptions = useMemo(() => {
    // All streams are valid AFTER targets
    return streams;
  }, [streams]);

  return (
    <div className="p-8 animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-white">Schedules</h2>
          <p className="text-muted text-xs mt-0.5">{schedules.length} schedules across {streams.length} streams</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 bg-accent text-white px-3 py-1.5 rounded-lg text-sm hover:bg-accent-hover transition-colors"
        >
          <Plus size={14} /> New Schedule
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="bg-card rounded-xl border border-border p-4 h-14 animate-shimmer bg-gradient-to-r from-card via-card2 to-card bg-[length:200%_100%]"
            />
          ))}
        </div>
      ) : schedules.length === 0 ? (
        <div className="text-center py-16 text-muted text-sm">No schedules yet.</div>
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[1fr_70px_160px_200px_120px_80px_100px] gap-2 px-4 py-2.5 border-b border-border text-[11px] text-muted uppercase tracking-wider font-medium">
            <span>Name</span>
            <span>Type</span>
            <span>Stream</span>
            <span>Trigger</span>
            <span>Policy</span>
            <span>Status</span>
            <span className="text-right">Actions</span>
          </div>

          {/* Table rows */}
          {treeRows.map(({ schedule: s, depth, hasChildren }) => (
            <div
              key={s.id}
              className="grid grid-cols-[1fr_70px_160px_200px_120px_80px_100px] gap-2 px-4 py-2.5 border-b border-border/50 hover:bg-card2/50 transition-colors items-center text-sm"
            >
              {/* Name with hierarchy indent */}
              <div className="flex items-center gap-1 min-w-0" style={{ paddingLeft: `${depth * 24}px` }}>
                {depth > 0 && (
                  <CornerDownRight size={12} className="text-muted flex-shrink-0" />
                )}
                {hasChildren ? (
                  <button
                    onClick={() => toggleCollapse(s.id)}
                    className="p-0.5 text-muted hover:text-white transition-colors flex-shrink-0"
                  >
                    {collapsed.has(s.id) ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                  </button>
                ) : (
                  <span className="w-5 flex-shrink-0" />
                )}
                <span className="text-white truncate font-medium text-[13px]">{s.name}</span>
              </div>

              {/* Type badge */}
              <div>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium uppercase ${typeColor(s.type)}`}>
                  {s.type}
                </span>
              </div>

              {/* Stream */}
              <div className="text-xs text-muted truncate">
                {s.streamId ? (streamMap.get(s.streamId)?.name || s.streamId.slice(0, 8)) : '-'}
              </div>

              {/* Trigger */}
              <div className="text-xs text-muted truncate flex items-center gap-1">
                {s.type === 'CRON' && <Clock size={10} className="flex-shrink-0" />}
                {s.type === 'AFTER' && <Zap size={10} className="flex-shrink-0 text-cyan-400" />}
                <span className="truncate">{triggerInfo(s)}</span>
              </div>

              {/* Policy */}
              <div className="text-[11px] text-muted truncate">{policyText(s)}</div>

              {/* Status toggle */}
              <div>
                <button
                  onClick={() => handleToggle(s)}
                  className={`transition-colors ${s.enabled ? 'text-green-400' : 'text-gray-500'}`}
                  title={s.enabled ? 'Disable' : 'Enable'}
                >
                  {s.enabled ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                </button>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-0.5">
                <button
                  onClick={() => openEdit(s)}
                  className="p-1.5 text-muted hover:text-white transition-colors"
                  title="Edit"
                >
                  <Pencil size={13} />
                </button>
                <button
                  onClick={() => handleRunNow(s.id)}
                  className="p-1.5 text-muted hover:text-green-400 transition-colors"
                  title="Run Now"
                >
                  <Play size={13} />
                </button>
                <button
                  onClick={() => handleDelete(s.id)}
                  className="p-1.5 text-muted hover:text-red-400 transition-colors"
                  title="Delete"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowModal(false)}>
          <div
            className="bg-card rounded-2xl border border-border p-6 w-full max-w-lg max-h-[85vh] overflow-auto animate-modal-in"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-white mb-4">
              {editingId ? 'Edit Schedule' : 'New Schedule'}
            </h3>
            <form onSubmit={handleSave} className="space-y-3">
              {/* Name */}
              <div>
                <label className="block text-xs text-muted mb-1">Name</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className={inputClass}
                  required
                />
              </div>

              {/* Type + Stream */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-muted mb-1">Type</label>
                  <select
                    value={form.type}
                    onChange={(e) => setForm({ ...form, type: e.target.value as any })}
                    className={inputClass}
                  >
                    <option value="CRON">CRON</option>
                    <option value="AT">AT (One-time)</option>
                    <option value="AFTER">AFTER (Chained)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-muted mb-1">Stream to Execute</label>
                  <select
                    value={form.streamId}
                    onChange={(e) => setForm({ ...form, streamId: e.target.value })}
                    className={inputClass}
                    required
                  >
                    <option value="">Select stream...</option>
                    {streams.map((st) => (
                      <option key={st.id} value={st.id}>
                        {st.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* CRON fields */}
              {form.type === 'CRON' && (
                <div className="space-y-2">
                  <div>
                    <label className="block text-xs text-muted mb-1">Cron Expression</label>
                    <div className="flex gap-2">
                      <input
                        value={form.cronExpr}
                        onChange={(e) => setForm({ ...form, cronExpr: e.target.value })}
                        className={`${inputClass} font-mono`}
                        placeholder="0 9 * * 1-5"
                        required
                      />
                      <button
                        type="button"
                        onClick={handleCronPreview}
                        className="px-2 py-1 border border-border rounded-lg text-xs text-muted hover:text-white transition-colors whitespace-nowrap"
                      >
                        Preview
                      </button>
                    </div>
                    {cronPreview.length > 0 && (
                      <div className="mt-2 text-[11px] text-muted space-y-0.5">
                        {cronPreview.map((t, i) => (
                          <div key={i}>{new Date(t).toLocaleString('ko-KR')}</div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs text-muted mb-1">Timezone</label>
                    <input
                      value={form.timezone}
                      onChange={(e) => setForm({ ...form, timezone: e.target.value })}
                      className={inputClass}
                    />
                  </div>
                </div>
              )}

              {/* AT fields */}
              {form.type === 'AT' && (
                <div>
                  <label className="block text-xs text-muted mb-1">Run At</label>
                  <input
                    type="datetime-local"
                    value={form.runAt}
                    onChange={(e) => setForm({ ...form, runAt: e.target.value })}
                    className={inputClass}
                    required
                  />
                </div>
              )}

              {/* AFTER fields */}
              {form.type === 'AFTER' && (
                <div className="space-y-2">
                  <div>
                    <label className="block text-xs text-muted mb-1">Trigger After Stream</label>
                    <select
                      value={form.afterStreamId}
                      onChange={(e) => setForm({ ...form, afterStreamId: e.target.value })}
                      className={inputClass}
                      required
                    >
                      <option value="">Select stream...</option>
                      {afterStreamOptions.map((st) => (
                        <option key={st.id} value={st.id}>
                          {st.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-muted mb-1">Delay (ms)</label>
                      <input
                        type="number"
                        value={form.delayMs}
                        onChange={(e) => setForm({ ...form, delayMs: Number(e.target.value) })}
                        className={inputClass}
                        min={0}
                        step={1000}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-muted mb-1">Trigger On</label>
                      <select
                        value={form.triggerOn}
                        onChange={(e) => setForm({ ...form, triggerOn: e.target.value })}
                        className={inputClass}
                      >
                        <option value="DONE">DONE (Success)</option>
                        <option value="FAIL">FAIL (Failure)</option>
                        <option value="ANY">ANY (Always)</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* Policies */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-muted mb-1">Overlap Policy</label>
                  <select
                    value={form.overlapPolicy}
                    onChange={(e) => setForm({ ...form, overlapPolicy: e.target.value })}
                    className={inputClass}
                  >
                    <option value="SKIP">SKIP</option>
                    <option value="QUEUE">QUEUE</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-muted mb-1">Misfire Policy</label>
                  <select
                    value={form.misfirePolicy}
                    onChange={(e) => setForm({ ...form, misfirePolicy: e.target.value })}
                    className={inputClass}
                  >
                    <option value="RUN_LATEST_ONLY">RUN_LATEST_ONLY</option>
                    <option value="RUN_ALL">RUN_ALL</option>
                    <option value="SKIP_ALL">SKIP_ALL</option>
                  </select>
                </div>
              </div>

              {/* Enabled toggle */}
              <div className="flex items-center gap-3 pt-1">
                <label className="text-xs text-muted">Enabled</label>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, enabled: !form.enabled })}
                  className={`transition-colors ${form.enabled ? 'text-green-400' : 'text-gray-500'}`}
                >
                  {form.enabled ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
                </button>
                <span className="text-xs text-muted">{form.enabled ? 'Active' : 'Paused'}</span>
              </div>

              {/* Buttons */}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-3 py-2 border border-border rounded-lg text-sm text-muted hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-accent text-white px-3 py-2 rounded-lg text-sm hover:bg-accent-hover transition-colors disabled:opacity-50"
                >
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

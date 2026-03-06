import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { Plus, Trash2, Monitor, Wifi, WifiOff, Play, Square, RotateCw, Globe, Smartphone, TabletSmartphone } from 'lucide-react';

const PLATFORM_CONFIG = {
  web: { label: 'Web', icon: Globe, color: 'blue', desc: 'Playwright-based browser recording & testing' },
  ios: { label: 'iOS', icon: Smartphone, color: 'green', desc: 'XCUITest via Appium for real iOS devices' },
  android: { label: 'Android', icon: TabletSmartphone, color: 'yellow', desc: 'UIAutomator2 via Appium for Android devices' },
} as const;

export default function RunnersPage() {
  const [runners, setRunners] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [platform, setPlatform] = useState<'web' | 'ios' | 'android'>('web');
  const [saving, setSaving] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    api.getRunners().then(setRunners).catch(() => []).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.createRunner({ name, platform });
      setName('');
      setPlatform('web');
      setShowCreate(false);
      load();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this runner? The process will be terminated.')) return;
    setRunners((prev) => prev.filter((r) => r.id !== id));
    try {
      await api.deleteRunner(id);
    } catch (err: any) {
      alert(`Delete failed: ${err.message}`);
      load();
    }
  };

  const handleStart = async (id: string) => {
    setActionId(id);
    try { await api.startRunner(id); load(); } catch (err: any) { alert(err.message); } finally { setActionId(null); }
  };

  const handleStop = async (id: string) => {
    setActionId(id);
    try { await api.stopRunner(id); load(); } catch (err: any) { alert(err.message); } finally { setActionId(null); }
  };

  const handleRestart = async (id: string) => {
    setActionId(id);
    try { await api.restartRunner(id); setTimeout(load, 2000); } catch (err: any) { alert(err.message); } finally { setActionId(null); }
  };

  const isOnline = (r: any) => {
    if (!r.lastHeartbeatAt && !r.lastHeartbeat && !r.last_heartbeat_at) return false;
    const last = new Date(r.lastHeartbeatAt || r.lastHeartbeat || r.last_heartbeat_at).getTime();
    return Date.now() - last < 90000;
  };

  const inputClass = "w-full px-3 py-2 bg-card2 border border-border rounded-lg text-white text-sm focus:ring-1 focus:ring-accent focus:border-accent outline-none transition-colors";

  // Group by platform
  const webRunners = runners.filter(r => r.platform === 'web');
  const iosRunners = runners.filter(r => r.platform === 'ios');
  const androidRunners = runners.filter(r => r.platform === 'android');
  // Include runners without platform field (legacy) in web
  const untyped = runners.filter(r => !r.platform);
  if (untyped.length > 0) webRunners.push(...untyped);

  const renderRunnerCard = (r: any) => {
    const online = isOnline(r);
    const processUp = r.processRunning;
    const busy = actionId === r.id;
    const pConfig = PLATFORM_CONFIG[(r.platform as keyof typeof PLATFORM_CONFIG) || 'web'];
    const PIcon = pConfig.icon;
    const colorMap: Record<string, string> = {
      blue: 'bg-blue-500/15 text-blue-400',
      green: 'bg-green-500/15 text-green-400',
      yellow: 'bg-yellow-500/15 text-yellow-400',
    };

    return (
      <div key={r.id} className="bg-card rounded-xl border border-border p-5 hover:border-border/80 transition-colors">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${online ? 'bg-green-500/15' : 'bg-gray-500/15'}`}>
              {online ? <Wifi size={16} className="text-green-400" /> : <WifiOff size={16} className="text-gray-400" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-medium text-white">{r.name}</h3>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${colorMap[pConfig.color]}`}>
                  {pConfig.label}
                </span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${online ? 'bg-green-500/15 text-green-400' : processUp ? 'bg-yellow-500/15 text-yellow-400' : 'bg-gray-500/15 text-gray-400'}`}>
                  {online ? 'Online' : processUp ? 'Starting...' : 'Offline'}
                </span>
                {r.localPort && <span className="text-[10px] text-muted font-mono">:{r.localPort}</span>}
              </div>
              <div className="text-xs text-muted mt-0.5 flex items-center gap-3">
                <span className="font-mono">{r.id.slice(0, 8)}</span>
                {r.lastHeartbeatAt || r.lastHeartbeat || r.last_heartbeat_at ? (
                  <span>Last seen: {new Date(r.lastHeartbeatAt || r.lastHeartbeat || r.last_heartbeat_at).toLocaleString('ko-KR')}</span>
                ) : (<span>Never connected</span>)}
                {r.metadata?.devices?.length > 0 && <span>{r.metadata.devices.length} device(s)</span>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {processUp || online ? (
              <>
                <button onClick={() => handleRestart(r.id)} disabled={busy} className="p-1.5 text-muted hover:text-yellow-400 transition-colors disabled:opacity-30" title="Restart"><RotateCw size={14} /></button>
                <button onClick={() => handleStop(r.id)} disabled={busy} className="p-1.5 text-muted hover:text-orange-400 transition-colors disabled:opacity-30" title="Stop"><Square size={14} /></button>
              </>
            ) : (
              <button onClick={() => handleStart(r.id)} disabled={busy} className="p-1.5 text-muted hover:text-green-400 transition-colors disabled:opacity-30" title="Start"><Play size={14} /></button>
            )}
            <button onClick={() => handleDelete(r.id)} className="p-1.5 text-muted hover:text-red-400 transition-colors" title="Delete"><Trash2 size={14} /></button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="p-8 animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-white">Runners</h2>
          <p className="text-xs text-muted mt-0.5">Platform-specific local processes. Each runner handles one platform.</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 bg-accent text-white px-3 py-1.5 rounded-lg text-sm hover:bg-accent-hover transition-colors">
          <Plus size={14} /> New Runner
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="bg-card rounded-xl border border-border p-5 h-24 animate-shimmer bg-gradient-to-r from-card via-card2 to-card bg-[length:200%_100%]" />
          ))}
        </div>
      ) : runners.length === 0 ? (
        <div className="text-center py-16">
          <Monitor size={32} className="text-muted mx-auto mb-3" />
          <p className="text-muted text-sm">No runners yet.</p>
          <p className="text-muted text-xs mt-1">Create a platform-specific runner (Web, iOS, or Android) to start testing.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {webRunners.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2 flex items-center gap-1.5"><Globe size={12} className="text-blue-400" /> Web</h3>
              <div className="space-y-2">{webRunners.map(renderRunnerCard)}</div>
            </div>
          )}
          {iosRunners.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2 flex items-center gap-1.5"><Smartphone size={12} className="text-green-400" /> iOS</h3>
              <div className="space-y-2">{iosRunners.map(renderRunnerCard)}</div>
            </div>
          )}
          {androidRunners.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2 flex items-center gap-1.5"><TabletSmartphone size={12} className="text-yellow-400" /> Android</h3>
              <div className="space-y-2">{androidRunners.map(renderRunnerCard)}</div>
            </div>
          )}
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowCreate(false)}>
          <div className="bg-card rounded-2xl border border-border p-6 w-full max-w-sm animate-modal-in" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-white mb-1">New Runner</h3>
            <p className="text-xs text-muted mb-4">Choose a platform. The runner process starts automatically after creation.</p>
            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <label className="block text-xs text-muted mb-1">Platform</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['web', 'ios', 'android'] as const).map((p) => {
                    const cfg = PLATFORM_CONFIG[p];
                    const PIcon = cfg.icon;
                    const selected = platform === p;
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPlatform(p)}
                        className={`p-3 rounded-xl border text-center transition-all ${
                          selected
                            ? 'border-accent bg-accent/10'
                            : 'border-border bg-card2 hover:border-border/80'
                        }`}
                      >
                        <PIcon size={20} className={`mx-auto mb-1 ${selected ? 'text-accent' : 'text-muted'}`} />
                        <div className={`text-xs font-medium ${selected ? 'text-white' : 'text-muted'}`}>{cfg.label}</div>
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-muted mt-1.5">{PLATFORM_CONFIG[platform].desc}</p>
              </div>
              <div>
                <label className="block text-xs text-muted mb-1">Runner Name</label>
                <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder={`e.g. ${platform}-runner-1`} required />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowCreate(false)} className="flex-1 px-3 py-2 border border-border rounded-lg text-sm text-muted hover:text-white transition-colors">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 bg-accent text-white px-3 py-2 rounded-lg text-sm hover:bg-accent-hover transition-colors disabled:opacity-50">
                  {saving ? 'Creating...' : 'Create & Start'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

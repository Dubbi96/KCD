import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { Plus, Trash2, Monitor, Wifi, WifiOff, Play, Square, RotateCw, Globe, Smartphone, TabletSmartphone, BookOpen, Copy, Check } from 'lucide-react';

const PLATFORM_CONFIG = {
  web: { label: 'Web', icon: Globe, color: 'blue', desc: 'Playwright-based browser recording & testing' },
  ios: { label: 'iOS', icon: Smartphone, color: 'green', desc: 'XCUITest via Appium for real iOS devices' },
  android: { label: 'Android', icon: TabletSmartphone, color: 'yellow', desc: 'UIAutomator2 via Appium for Android devices' },
} as const;

export default function RunnersPage() {
  const [runners, setRunners] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showSetup, setShowSetup] = useState<any>(null);
  const [name, setName] = useState('');
  const [platform, setPlatform] = useState<'web' | 'ios' | 'android'>('web');
  const [saving, setSaving] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const isExternalMode = runners.length > 0 && runners[0]?.runnerMode === 'external';

  const load = () => {
    setLoading(true);
    api.getRunners().then(setRunners).catch(() => []).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const result = await api.createRunner({ name, platform });
      setName('');
      setPlatform('web');
      setShowCreate(false);
      if (result.setupGuide) {
        setShowSetup(result.setupGuide);
      }
      load();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this runner registration? The KRC node agent will need to re-register.')) return;
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
    try {
      const result = await api.startRunner(id);
      if (result.setupGuide) {
        setShowSetup(result.setupGuide);
      }
      load();
    } catch (err: any) { alert(err.message); } finally { setActionId(null); }
  };

  const handleStop = async (id: string) => {
    setActionId(id);
    try { await api.stopRunner(id); load(); } catch (err: any) { alert(err.message); } finally { setActionId(null); }
  };

  const handleRestart = async (id: string) => {
    setActionId(id);
    try { await api.restartRunner(id); setTimeout(load, 2000); } catch (err: any) { alert(err.message); } finally { setActionId(null); }
  };

  const handleShowSetup = async (runner: any) => {
    try {
      const result = await api.startRunner(runner.id);
      if (result.setupGuide) {
        setShowSetup(result.setupGuide);
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const isOnline = (r: any) => {
    if (!r.lastHeartbeatAt && !r.lastHeartbeat && !r.last_heartbeat_at) return false;
    const last = new Date(r.lastHeartbeatAt || r.lastHeartbeat || r.last_heartbeat_at).getTime();
    return Date.now() - last < 90000;
  };

  const inputClass = "w-full px-3 py-2 bg-card2 border border-border rounded-lg text-white text-sm focus:ring-1 focus:ring-accent focus:border-accent outline-none transition-colors";

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
              <div className="text-xs text-muted mt-0.5 flex items-center gap-3 flex-wrap">
                <span className="font-mono">{r.id.slice(0, 8)}</span>
                {r.lastHeartbeatAt || r.lastHeartbeat || r.last_heartbeat_at ? (
                  <span>Last seen: {new Date(r.lastHeartbeatAt || r.lastHeartbeat || r.last_heartbeat_at).toLocaleString('ko-KR')}</span>
                ) : (<span>Never connected</span>)}
                {r.metadata?.devices?.length > 0 && <span>{r.metadata.devices.length} device(s)</span>}
                {r.localHost && r.localHost !== 'localhost' && <span className="font-mono">{r.localHost}</span>}
                {r.metadata?.supportedPlatforms?.length > 0 && (
                  <span className="flex items-center gap-1">
                    Platforms: {(r.metadata.supportedPlatforms as string[]).map((p: string) => (
                      <span key={p} className={`px-1 py-0.5 rounded text-[9px] font-medium ${
                        p === 'web' ? 'bg-blue-500/15 text-blue-400' :
                        p === 'ios' ? 'bg-green-500/15 text-green-400' :
                        'bg-yellow-500/15 text-yellow-400'
                      }`}>{p}</span>
                    ))}
                  </span>
                )}
                {r.metadata?.activeJobCount !== undefined && r.metadata.activeJobCount > 0 && (
                  <span className="text-blue-400">{r.metadata.activeJobCount} job(s) running</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {isExternalMode ? (
              <>
                <button onClick={() => handleShowSetup(r)} className="p-1.5 text-muted hover:text-blue-400 transition-colors" title="Setup Guide">
                  <BookOpen size={14} />
                </button>
              </>
            ) : (
              processUp || online ? (
                <>
                  <button onClick={() => handleRestart(r.id)} disabled={busy} className="p-1.5 text-muted hover:text-yellow-400 transition-colors disabled:opacity-30" title="Restart"><RotateCw size={14} /></button>
                  <button onClick={() => handleStop(r.id)} disabled={busy} className="p-1.5 text-muted hover:text-orange-400 transition-colors disabled:opacity-30" title="Stop"><Square size={14} /></button>
                </>
              ) : (
                <button onClick={() => handleStart(r.id)} disabled={busy} className="p-1.5 text-muted hover:text-green-400 transition-colors disabled:opacity-30" title="Start"><Play size={14} /></button>
              )
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
          <p className="text-xs text-muted mt-0.5">
            {isExternalMode
              ? 'Node Agents (KRC). Each runner is deployed independently on its host machine.'
              : 'Node Agents (KRC). Each runner is an independent node registered via Control Plane.'}
          </p>
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
          <p className="text-muted text-xs mt-1">Register a KRC node agent to start testing.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {runners.map(renderRunnerCard)}
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowCreate(false)}>
          <div className="bg-card rounded-2xl border border-border p-6 w-full max-w-sm animate-modal-in" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-white mb-1">New Runner</h3>
            <p className="text-xs text-muted mb-4">
              {isExternalMode
                ? 'Register a runner token. After creation, deploy KRC on the target machine with the generated credentials.'
                : 'Register a KRC node agent. Deploy KRC on the target machine with the generated token.'}
            </p>
            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <label className="block text-xs text-muted mb-1">Runner Name</label>
                <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="e.g. office-mac-1" required />
              </div>
              <div>
                <label className="block text-xs text-muted mb-1">Platform</label>
                <select value={platform} onChange={(e) => setPlatform(e.target.value as any)} className={inputClass}>
                  <option value="web">Web (Playwright)</option>
                  <option value="ios">iOS (Appium XCUITest)</option>
                  <option value="android">Android (Appium UiAutomator2)</option>
                </select>
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowCreate(false)} className="flex-1 px-3 py-2 border border-border rounded-lg text-sm text-muted hover:text-white transition-colors">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 bg-accent text-white px-3 py-2 rounded-lg text-sm hover:bg-accent-hover transition-colors disabled:opacity-50">
                  {saving ? 'Creating...' : 'Register'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Setup Guide Modal */}
      {showSetup && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowSetup(null)}>
          <div className="bg-card rounded-2xl border border-border p-6 w-full max-w-lg animate-modal-in" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-white mb-1">KRC Setup Guide</h3>
            <p className="text-xs text-muted mb-4">Deploy KRC on the target machine with the following configuration.</p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs text-muted mb-1">1. Environment Variables (.env)</label>
                <div className="relative">
                  <pre className="bg-card2 border border-border rounded-lg p-3 text-xs text-green-400 font-mono overflow-x-auto whitespace-pre">
{Object.entries(showSetup.envVars || {}).map(([k, v]: [string, any]) => `${k}=${v}`).join('\n')}
                  </pre>
                  <button
                    onClick={() => copyToClipboard(
                      Object.entries(showSetup.envVars || {}).map(([k, v]: [string, any]) => `${k}=${v}`).join('\n'),
                      'env'
                    )}
                    className="absolute top-2 right-2 p-1 text-muted hover:text-white transition-colors"
                    title="Copy"
                  >
                    {copied === 'env' ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs text-muted mb-1">2. Quick Start Command</label>
                <div className="relative">
                  <pre className="bg-card2 border border-border rounded-lg p-3 text-xs text-blue-400 font-mono overflow-x-auto whitespace-pre">
{showSetup.command || `cd KRC && npx ts-node src/main.ts`}
                  </pre>
                  <button
                    onClick={() => copyToClipboard(showSetup.command || '', 'cmd')}
                    className="absolute top-2 right-2 p-1 text-muted hover:text-white transition-colors"
                    title="Copy"
                  >
                    {copied === 'cmd' ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs text-muted mb-1">3. As a macOS Service (launchd)</label>
                <p className="text-xs text-muted">
                  Copy the env vars to <code className="text-white">.env</code> in the KRC directory, then:
                </p>
                <pre className="bg-card2 border border-border rounded-lg p-3 text-xs text-yellow-400 font-mono mt-1 overflow-x-auto whitespace-pre">
{`sudo cp KRC/launchd/com.katab.krc.plist /Library/LaunchDaemons/
sudo launchctl load /Library/LaunchDaemons/com.katab.krc.plist`}
                </pre>
              </div>
            </div>

            <div className="flex gap-2 pt-4">
              <button onClick={() => setShowSetup(null)} className="flex-1 px-3 py-2 bg-accent text-white rounded-lg text-sm hover:bg-accent-hover transition-colors">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

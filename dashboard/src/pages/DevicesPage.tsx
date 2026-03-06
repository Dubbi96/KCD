import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import {
  Smartphone, Monitor, Wifi, WifiOff, Play, Square, Video, RefreshCw,
  Globe, ChevronDown, TabletSmartphone, ArrowLeftRight,
} from 'lucide-react';

export default function DevicesPage() {
  const navigate = useNavigate();
  const [devices, setDevices] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const hasLoadedOnce = useRef(false);

  // Web borrow form state
  const [webUrl, setWebUrl] = useState('https://');
  const [webFps, setWebFps] = useState(2);
  const [webDeviceType, setWebDeviceType] = useState('desktop');
  const [webBorrowing, setWebBorrowing] = useState(false);

  // iOS form state
  const [iosBundleId, setIosBundleId] = useState('');
  const [iosBorrowing, setIosBorrowing] = useState(false);

  // Android form state
  const [androidPackage, setAndroidPackage] = useState('');
  const [androidActivity, setAndroidActivity] = useState('');
  const [androidBorrowing, setAndroidBorrowing] = useState(false);

  const load = async (isInitial = false) => {
    if (isInitial) setInitialLoading(true);
    try {
      const [d, s] = await Promise.all([
        api.getDevices().catch(() => []),
        api.getDeviceSessions().catch(() => []),
      ]);
      setDevices(d);
      setSessions(s);
      hasLoadedOnce.current = true;
    } finally {
      if (isInitial) setInitialLoading(false);
    }
  };

  useEffect(() => { load(true); }, []);
  useEffect(() => {
    const t = setInterval(() => load(false), 10000);
    return () => clearInterval(t);
  }, []);

  // Borrow a device (create session)
  const handleBorrow = async (device: any, extra: Record<string, any> = {}) => {
    try {
      const session = await api.createDeviceSession({
        deviceId: device.id,
        ...extra,
      });
      navigate(`/devices/mirror/${session.id}`);
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Return a device (close session)
  const handleReturn = async (sessionId: string) => {
    if (!confirm('Return this device? The session will be closed.')) return;
    setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, status: 'closed' } : s));
    try {
      await api.closeDeviceSession(sessionId);
    } catch {
      load(false);
    }
  };

  // Web session (no device needed — standalone)
  const handleWebSession = async () => {
    if (!webUrl || webUrl === 'https://') { alert('Enter a URL.'); return; }
    setWebBorrowing(true);
    try {
      const session = await api.createWebSession({
        url: webUrl,
        fps: webFps,
        deviceType: webDeviceType,
      });
      navigate(`/devices/mirror/${session.id}`);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setWebBorrowing(false);
    }
  };

  // iOS borrow
  const handleIOSBorrow = async (device: any) => {
    setIosBorrowing(true);
    try {
      await handleBorrow(device, { bundleId: iosBundleId || undefined, fps: 2 });
    } finally {
      setIosBorrowing(false);
    }
  };

  // Android borrow
  const handleAndroidBorrow = async (device: any) => {
    setAndroidBorrowing(true);
    try {
      await handleBorrow(device, {
        appPackage: androidPackage || undefined,
        appActivity: androidActivity || undefined,
        fps: 2,
      });
    } finally {
      setAndroidBorrowing(false);
    }
  };

  // Categorize devices (only physical devices — web sessions are standalone)
  const iosDevices = devices.filter(d => d.platform === 'ios');
  const androidDevices = devices.filter(d => d.platform === 'android');
  const physicalDevices = [...iosDevices, ...androidDevices];
  const activeSessions = sessions.filter(s => s.status !== 'closed');

  const statusBadge = (status: string) => {
    if (status === 'available') return 'bg-green-500/15 text-green-400';
    if (status === 'in_use') return 'bg-yellow-500/15 text-yellow-400';
    return 'bg-gray-500/15 text-gray-400';
  };

  const statusLabel = (status: string) => {
    if (status === 'available') return 'Available';
    if (status === 'in_use') return 'In Use';
    return 'Offline';
  };

  const platformIcon = (p: string) => {
    if (p === 'ios') return <Smartphone size={16} className="text-green-400" />;
    if (p === 'android') return <TabletSmartphone size={16} className="text-yellow-400" />;
    return <Monitor size={16} className="text-blue-400" />;
  };

  const platformBg = (p: string) => {
    if (p === 'ios') return 'bg-green-500/15';
    if (p === 'android') return 'bg-yellow-500/15';
    return 'bg-blue-500/15';
  };

  const inputClass = "w-full px-3 py-2 bg-card2 border border-border rounded-lg text-white text-sm focus:ring-1 focus:ring-accent focus:border-accent outline-none transition-colors";

  if (initialLoading) {
    return (
      <div className="p-8 animate-fade-in">
        <h2 className="text-xl font-bold text-white mb-6">Device Pool</h2>
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-card rounded-xl border border-border p-5 h-20 animate-shimmer bg-gradient-to-r from-card via-card2 to-card bg-[length:200%_100%]" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-white">Device Pool</h2>
          <p className="text-xs text-muted mt-0.5">
            Devices are registered by Runners automatically. Borrow a device to start mirroring or recording.
          </p>
        </div>
        <button onClick={() => load(false)} className="flex items-center gap-1.5 text-muted hover:text-white text-sm transition-colors">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Pool Summary (physical devices only) */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Devices', count: physicalDevices.length, color: 'text-white' },
          { label: 'Available', count: physicalDevices.filter(d => d.status === 'available').length, color: 'text-green-400' },
          { label: 'In Use', count: physicalDevices.filter(d => d.status === 'in_use').length, color: 'text-yellow-400' },
          { label: 'Offline', count: physicalDevices.filter(d => d.status === 'offline').length, color: 'text-gray-400' },
        ].map((s) => (
          <div key={s.label} className="bg-card rounded-xl border border-border p-3 text-center">
            <div className={`text-lg font-bold ${s.color}`}>{s.count}</div>
            <div className="text-xs text-muted">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Active Sessions (Borrowed Devices) */}
      {activeSessions.length > 0 && (
        <div className="mb-8">
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <ArrowLeftRight size={14} className="text-accent" /> Borrowed Devices
          </h3>
          <div className="space-y-2">
            {activeSessions.map(s => (
              <div key={s.id} className="bg-card rounded-xl border border-border p-4 hover:border-border/80 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${platformBg(s.platform)}`}>
                      {platformIcon(s.platform)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-white uppercase">{s.platform}</span>
                        <span className="text-xs font-mono text-muted">{s.deviceId?.slice(0, 12)}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          s.status === 'active' || s.status === 'recording' ? 'bg-green-500/15 text-green-400' :
                          s.status === 'creating' ? 'bg-yellow-500/15 text-yellow-400' :
                          'bg-red-500/15 text-red-400'
                        }`}>
                          {s.status === 'recording' ? 'REC' : s.status}
                        </span>
                      </div>
                      <div className="text-xs text-muted mt-0.5">
                        Borrowed {new Date(s.createdAt).toLocaleString('ko-KR')}
                        {s.options?.url && <span className="ml-2">| {s.options.url}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {(s.status === 'active' || s.status === 'recording') && (
                      <button
                        onClick={() => navigate(`/devices/mirror/${s.id}`)}
                        className="flex items-center gap-1 bg-accent/15 text-accent px-2.5 py-1 rounded-lg text-xs hover:bg-accent/25 transition-colors"
                      >
                        <Play size={12} /> Open
                      </button>
                    )}
                    <button onClick={() => handleReturn(s.id)} className="flex items-center gap-1 text-muted hover:text-red-400 text-xs transition-colors px-2 py-1" title="Return device">
                      <Square size={12} /> Return
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Web Recording (standalone — no device needed) */}
      <div className="mb-8">
        <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <Globe size={14} className="text-blue-400" /> Web Recording
        </h3>
        <div className="bg-card rounded-xl border border-border p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2.5 rounded-lg bg-blue-500/15"><Monitor size={16} className="text-blue-400" /></div>
            <div className="flex-1">
              <span className="text-sm font-medium text-white">Browser Session</span>
              <p className="text-xs text-muted mt-0.5">Start a web recording session directly. No device registration needed.</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
            <div className="md:col-span-2">
              <label className="block text-xs text-muted mb-1">URL</label>
              <input type="url" value={webUrl} onChange={(e) => setWebUrl(e.target.value)} placeholder="https://example.com" className={inputClass} />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Device Preset</label>
              <div className="relative">
                <select value={webDeviceType} onChange={(e) => setWebDeviceType(e.target.value)} className={`${inputClass} appearance-none pr-8`}>
                  <option value="desktop">Desktop (1280x800)</option>
                  <option value="desktop-hd">Desktop HD (1920x1080)</option>
                  <option value="iphone-14">iPhone 14 (390x844)</option>
                  <option value="iphone-14-pro-max">iPhone 14 Pro Max (430x932)</option>
                  <option value="iphone-15-pro">iPhone 15 Pro (393x852)</option>
                  <option value="pixel-7">Pixel 7 (412x915)</option>
                  <option value="galaxy-s24">Galaxy S24 (360x800)</option>
                  <option value="ipad-pro-11">iPad Pro 11 (834x1194)</option>
                </select>
                <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
              </div>
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">FPS</label>
              <div className="relative">
                <select value={webFps} onChange={(e) => setWebFps(Number(e.target.value))} className={`${inputClass} appearance-none pr-8`}>
                  <option value={1}>1</option><option value={2}>2</option><option value={3}>3</option><option value={5}>5</option>
                </select>
                <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
              </div>
            </div>
            <div>
              <button onClick={handleWebSession} disabled={webBorrowing} className="w-full flex items-center justify-center gap-1.5 bg-blue-500 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-600 transition-colors disabled:opacity-50">
                <Video size={14} /> {webBorrowing ? 'Starting...' : 'Start Recording'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* iOS Devices */}
      <div className="mb-8">
        <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <Smartphone size={14} className="text-green-400" /> iOS Devices
        </h3>
        {iosDevices.length === 0 ? (
          <div className="bg-card rounded-xl border border-border p-5 text-center">
            <Smartphone size={24} className="text-muted mx-auto mb-2" />
            <p className="text-sm text-muted">No iOS devices registered.</p>
            <p className="text-xs text-muted mt-1">Connect an iPhone/iPad via USB to a machine running an iOS runner.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="mb-2">
              <label className="block text-xs text-muted mb-1">Bundle ID (optional)</label>
              <input value={iosBundleId} onChange={(e) => setIosBundleId(e.target.value)} placeholder="com.example.app" className={`${inputClass} max-w-xs`} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {iosDevices.map(device => (
                <DeviceCard
                  key={device.id}
                  device={device}
                  platformIcon={<Smartphone size={16} className="text-green-400" />}
                  platformBgClass="bg-green-500/15"
                  osLabel={`iOS ${device.version || ''}`}
                  statusBadge={statusBadge}
                  statusLabel={statusLabel}
                  onBorrow={() => handleIOSBorrow(device)}
                  onReturn={() => device.activeSessionId && handleReturn(device.activeSessionId)}
                  onOpen={() => device.activeSessionId && navigate(`/devices/mirror/${device.activeSessionId}`)}
                  borrowing={iosBorrowing}
                  borrowLabel="Borrow"
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Android Devices */}
      <div className="mb-8">
        <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <TabletSmartphone size={14} className="text-yellow-400" /> Android Devices
        </h3>
        {androidDevices.length === 0 ? (
          <div className="bg-card rounded-xl border border-border p-5 text-center">
            <TabletSmartphone size={24} className="text-muted mx-auto mb-2" />
            <p className="text-sm text-muted">No Android devices registered.</p>
            <p className="text-xs text-muted mt-1">Connect an Android device via USB with ADB debugging enabled.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 max-w-md mb-2">
              <div>
                <label className="block text-xs text-muted mb-1">Package (optional)</label>
                <input value={androidPackage} onChange={(e) => setAndroidPackage(e.target.value)} placeholder="com.example.app" className={inputClass} />
              </div>
              <div>
                <label className="block text-xs text-muted mb-1">Activity (optional)</label>
                <input value={androidActivity} onChange={(e) => setAndroidActivity(e.target.value)} placeholder=".MainActivity" className={inputClass} />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {androidDevices.map(device => (
                <DeviceCard
                  key={device.id}
                  device={device}
                  platformIcon={<TabletSmartphone size={16} className="text-yellow-400" />}
                  platformBgClass="bg-yellow-500/15"
                  osLabel={`Android ${device.version || ''}`}
                  statusBadge={statusBadge}
                  statusLabel={statusLabel}
                  onBorrow={() => handleAndroidBorrow(device)}
                  onReturn={() => device.activeSessionId && handleReturn(device.activeSessionId)}
                  onOpen={() => device.activeSessionId && navigate(`/devices/mirror/${device.activeSessionId}`)}
                  borrowing={androidBorrowing}
                  borrowLabel="Borrow"
                  borrowBgClass="bg-yellow-500 hover:bg-yellow-400 text-black"
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DeviceCard({
  device,
  platformIcon,
  platformBgClass,
  osLabel,
  statusBadge,
  statusLabel,
  onBorrow,
  onReturn,
  onOpen,
  borrowing,
  borrowLabel,
  borrowBgClass,
}: {
  device: any;
  platformIcon: React.ReactNode;
  platformBgClass: string;
  osLabel: string;
  statusBadge: (s: string) => string;
  statusLabel: (s: string) => string;
  onBorrow: () => void;
  onReturn: () => void;
  onOpen: () => void;
  borrowing: boolean;
  borrowLabel: string;
  borrowBgClass?: string;
}) {
  return (
    <div className="bg-card rounded-xl border border-border p-4 hover:border-border/80 transition-colors">
      <div className="flex items-center gap-3 mb-3">
        <div className={`p-2.5 rounded-lg ${platformBgClass}`}>{platformIcon}</div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-white truncate">{device.name || device.model}</div>
          <div className="text-xs text-muted">{osLabel}</div>
        </div>
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${statusBadge(device.status)}`}>
          {statusLabel(device.status)}
        </span>
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted font-mono">{(device.deviceUdid || device.id)?.slice(0, 12)}...</span>
        {device.status === 'available' ? (
          <button
            onClick={onBorrow}
            disabled={borrowing}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] transition-colors disabled:opacity-50 ${
              borrowBgClass || 'bg-green-500 text-white hover:bg-green-600'
            }`}
          >
            <Play size={10} /> {borrowing ? 'Starting...' : borrowLabel}
          </button>
        ) : device.status === 'in_use' ? (
          <div className="flex items-center gap-1.5">
            <button onClick={onOpen} className="flex items-center gap-1 bg-accent/15 text-accent px-2 py-1 rounded-lg text-[10px] hover:bg-accent/25 transition-colors">
              <Play size={9} /> Open
            </button>
            <button onClick={onReturn} className="text-muted hover:text-red-400 text-[10px] transition-colors">
              Return
            </button>
          </div>
        ) : (
          <span className="text-gray-500 text-[10px]">Offline</span>
        )}
      </div>
      {device.runnerName && (
        <div className="text-[10px] text-muted mt-2 flex items-center gap-1">
          {device.runnerOnline ? <Wifi size={10} className="text-green-400" /> : <WifiOff size={10} className="text-gray-400" />}
          Runner: {device.runnerName}
        </div>
      )}
    </div>
  );
}

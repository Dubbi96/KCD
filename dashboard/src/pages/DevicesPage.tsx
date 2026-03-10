import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import {
  Smartphone, Monitor, Wifi, WifiOff, Play, Square, Video, RefreshCw,
  Globe, ChevronDown, TabletSmartphone, ArrowLeftRight, Lock, Unlock, MonitorPlay,
} from 'lucide-react';

export default function DevicesPage() {
  const navigate = useNavigate();
  const [devices, setDevices] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const hasLoadedOnce = useRef(false);

  // Web session form state
  const [webUrl, setWebUrl] = useState('https://');
  const [webFps, setWebFps] = useState(2);
  const [webDeviceType, setWebDeviceType] = useState('desktop');
  const [webBorrowing, setWebBorrowing] = useState(false);

  // Session creation form (for borrowed devices)
  const [sessionDeviceId, setSessionDeviceId] = useState<string | null>(null);
  const [sessionBundleId, setSessionBundleId] = useState('');
  const [sessionPackage, setSessionPackage] = useState('');
  const [sessionActivity, setSessionActivity] = useState('');
  const [creatingSession, setCreatingSession] = useState(false);

  // Borrow loading
  const [borrowingId, setBorrowingId] = useState<string | null>(null);

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

  // ─── Borrow / Return (device reservation) ─────

  const handleBorrow = async (device: any) => {
    if (device.borrowedBy && !device.borrowedByMe) {
      alert('이 디바이스는 이미 다른 사용자가 대여 중입니다.');
      return;
    }
    setBorrowingId(device.id);
    try {
      await api.borrowDevice(device.id);
      await load(false);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setBorrowingId(null);
    }
  };

  const handleReturn = async (device: any) => {
    if (!confirm('이 디바이스를 반납하시겠습니까? 활성 세션이 모두 종료됩니다.')) return;
    try {
      await api.returnDevice(device.id);
      await load(false);
    } catch (err: any) {
      alert(err.message);
    }
  };

  // ─── Session lifecycle ────────────────────────

  const handleCreateSession = async (device: any) => {
    setCreatingSession(true);
    try {
      const extra: Record<string, any> = {};
      if (device.platform === 'ios' && sessionBundleId) extra.bundleId = sessionBundleId;
      if (device.platform === 'android') {
        if (sessionPackage) extra.appPackage = sessionPackage;
        if (sessionActivity) extra.appActivity = sessionActivity;
      }
      const session = await api.createDeviceSession({ deviceId: device.id, fps: 2, ...extra });
      navigate(`/devices/mirror/${session.id}`);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setCreatingSession(false);
      setSessionDeviceId(null);
    }
  };

  const handleCloseSession = async (sessionId: string) => {
    if (!confirm('세션을 종료하시겠습니까? 디바이스는 대여 상태로 유지됩니다.')) return;
    try {
      await api.closeDeviceSession(sessionId);
      await load(false);
    } catch {
      load(false);
    }
  };

  // Web session (no device needed)
  const handleWebSession = async () => {
    if (!webUrl || webUrl === 'https://') { alert('URL을 입력하세요.'); return; }
    setWebBorrowing(true);
    try {
      const session = await api.createWebSession({ url: webUrl, fps: webFps, deviceType: webDeviceType });
      navigate(`/devices/mirror/${session.id}`);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setWebBorrowing(false);
    }
  };

  // ─── Device categorization ───────────────────

  const iosDevices = devices.filter(d => d.platform === 'ios');
  const androidDevices = devices.filter(d => d.platform === 'android');
  const physicalDevices = [...iosDevices, ...androidDevices];
  const borrowedDevices = devices.filter(d => d.borrowedByMe);
  const activeSessions = sessions.filter(s => s.status !== 'closed' && s.status !== 'error');
  // Orphaned sessions: active sessions not tied to a currently borrowed device (e.g. web sessions, or device was returned but session lingered)
  const borrowedDeviceUdids = new Set(borrowedDevices.map(d => d.deviceUdid));
  const orphanedSessions = activeSessions.filter(s => !borrowedDeviceUdids.has(s.deviceId));

  // Find active session for a device
  const deviceSession = (deviceUdid: string) =>
    activeSessions.find(s => s.deviceId === deviceUdid && s.status !== 'closed' && s.status !== 'error');

  const statusBadge = (status: string) => {
    if (status === 'available') return 'bg-green-500/15 text-green-400';
    if (status === 'in_use') return 'bg-yellow-500/15 text-yellow-400';
    return 'bg-gray-500/15 text-gray-400';
  };

  const statusLabel = (status: string) => {
    if (status === 'available') return 'Available';
    if (status === 'in_use') return 'Borrowed';
    return 'Offline';
  };

  const healthBadge = (health?: string) => {
    if (!health || health === 'unknown') return null;
    const map: Record<string, string> = {
      healthy: 'bg-green-500/15 text-green-400',
      degraded: 'bg-yellow-500/15 text-yellow-400',
      unhealthy: 'bg-red-500/15 text-red-400',
      quarantined: 'bg-orange-500/15 text-orange-400',
    };
    return map[health] || null;
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
            디바이스를 대여한 후, 세션을 생성하여 미러링/녹화/테스트에 사용할 수 있습니다.
          </p>
        </div>
        <button onClick={() => load(false)} className="flex items-center gap-1.5 text-muted hover:text-white text-sm transition-colors">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Pool Summary */}
      <div className="grid grid-cols-5 gap-3 mb-6">
        {[
          { label: 'Devices', count: physicalDevices.length, color: 'text-white' },
          { label: 'Available', count: physicalDevices.filter(d => d.status === 'available').length, color: 'text-green-400' },
          { label: 'Borrowed', count: borrowedDevices.length, color: 'text-yellow-400' },
          { label: 'Quarantined', count: physicalDevices.filter(d => d.healthStatus === 'quarantined').length, color: 'text-orange-400' },
          { label: 'Offline', count: physicalDevices.filter(d => d.status === 'offline').length, color: 'text-gray-400' },
        ].map((s) => (
          <div key={s.label} className="bg-card rounded-xl border border-border p-3 text-center">
            <div className={`text-lg font-bold ${s.color}`}>{s.count}</div>
            <div className="text-xs text-muted">{s.label}</div>
          </div>
        ))}
      </div>

      {/* ═══ Borrowed Devices ═══ */}
      {borrowedDevices.length > 0 && (
        <div className="mb-8">
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <Lock size={14} className="text-yellow-400" /> 대여 중인 디바이스
          </h3>
          <div className="space-y-2">
            {borrowedDevices.map(device => {
              const session = deviceSession(device.deviceUdid);
              const showSessionForm = sessionDeviceId === device.id;

              return (
                <div key={device.id} className="bg-card rounded-xl border border-border p-4 hover:border-border/80 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${platformBg(device.platform)}`}>
                        {platformIcon(device.platform)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-white">{device.name || device.model}</span>
                          <span className="text-xs font-mono text-muted">{device.deviceUdid?.slice(0, 12)}</span>
                          {session && (
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                              session.status === 'recording' ? 'bg-red-500/15 text-red-400' :
                              session.status === 'active' ? 'bg-green-500/15 text-green-400' :
                              'bg-yellow-500/15 text-yellow-400'
                            }`}>
                              {session.status === 'recording' ? 'REC' : session.status}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted mt-0.5">
                          대여: {device.borrowedAt ? new Date(device.borrowedAt).toLocaleString('ko-KR') : '-'}
                          {session?.options?.url && <span className="ml-2">| {session.options.url}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {/* Session actions */}
                      {session ? (
                        <>
                          {(session.status === 'active' || session.status === 'recording') && (
                            <button
                              onClick={() => navigate(`/devices/mirror/${session.id}`)}
                              className="flex items-center gap-1 bg-accent/15 text-accent px-2.5 py-1 rounded-lg text-xs hover:bg-accent/25 transition-colors"
                            >
                              <Play size={12} /> Open
                            </button>
                          )}
                          <button
                            onClick={() => handleCloseSession(session.id)}
                            className="flex items-center gap-1 text-muted hover:text-orange-400 text-xs transition-colors px-2 py-1"
                            title="세션만 종료 (대여 유지)"
                          >
                            <Square size={12} /> 세션 종료
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => setSessionDeviceId(showSessionForm ? null : device.id)}
                          className="flex items-center gap-1 bg-accent/15 text-accent px-2.5 py-1 rounded-lg text-xs hover:bg-accent/25 transition-colors"
                        >
                          <MonitorPlay size={12} /> 새 세션
                        </button>
                      )}
                      <button
                        onClick={() => handleReturn(device)}
                        className="flex items-center gap-1 text-muted hover:text-red-400 text-xs transition-colors px-2 py-1"
                        title="디바이스 반납"
                      >
                        <Unlock size={12} /> 반납
                      </button>
                    </div>
                  </div>

                  {/* Session creation form (inline) */}
                  {showSessionForm && !session && (
                    <div className="mt-3 pt-3 border-t border-border">
                      <div className="flex items-center gap-3">
                        {device.platform === 'ios' && (
                          <div className="flex-1">
                            <label className="block text-xs text-muted mb-1">Bundle ID (optional)</label>
                            <input value={sessionBundleId} onChange={(e) => setSessionBundleId(e.target.value)} placeholder="com.example.app" className={inputClass} />
                          </div>
                        )}
                        {device.platform === 'android' && (
                          <>
                            <div className="flex-1">
                              <label className="block text-xs text-muted mb-1">Package (optional)</label>
                              <input value={sessionPackage} onChange={(e) => setSessionPackage(e.target.value)} placeholder="com.example.app" className={inputClass} />
                            </div>
                            <div className="flex-1">
                              <label className="block text-xs text-muted mb-1">Activity (optional)</label>
                              <input value={sessionActivity} onChange={(e) => setSessionActivity(e.target.value)} placeholder=".MainActivity" className={inputClass} />
                            </div>
                          </>
                        )}
                        <div className="pt-4">
                          <button
                            onClick={() => handleCreateSession(device)}
                            disabled={creatingSession}
                            className="flex items-center gap-1.5 bg-accent text-white px-4 py-2 rounded-lg text-sm hover:bg-accent/90 transition-colors disabled:opacity-50"
                          >
                            <Video size={14} /> {creatingSession ? 'Starting...' : '세션 시작'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══ Active Sessions (reconnectable) ═══ */}
      {orphanedSessions.length > 0 && (
        <div className="mb-8">
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <MonitorPlay size={14} className="text-blue-400" /> Active Sessions
            <span className="text-xs text-muted font-normal">- 진행 중인 세션에 다시 접속할 수 있습니다</span>
          </h3>
          <div className="space-y-2">
            {orphanedSessions.map(session => (
              <div key={session.id} className="bg-card rounded-xl border border-border p-4 hover:border-border/80 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${platformBg(session.platform)}`}>
                      {platformIcon(session.platform)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-white">{session.deviceName || `${session.platform}:${session.deviceId?.slice(0, 12)}`}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          session.status === 'recording' ? 'bg-red-500/15 text-red-400' :
                          'bg-green-500/15 text-green-400'
                        }`}>
                          {session.status === 'recording' ? 'REC' : session.status}
                        </span>
                      </div>
                      <div className="text-xs text-muted mt-0.5">
                        {session.options?.url && <span>{session.options.url} | </span>}
                        생성: {new Date(session.createdAt).toLocaleString('ko-KR')}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => navigate(`/devices/mirror/${session.id}`)}
                      className="flex items-center gap-1 bg-accent/15 text-accent px-2.5 py-1 rounded-lg text-xs hover:bg-accent/25 transition-colors"
                    >
                      <ArrowLeftRight size={12} /> Reconnect
                    </button>
                    <button
                      onClick={() => handleCloseSession(session.id)}
                      className="flex items-center gap-1 text-muted hover:text-orange-400 text-xs transition-colors px-2 py-1"
                    >
                      <Square size={12} /> Close
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ Web Recording (standalone) ═══ */}
      <div className="mb-8">
        <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <Globe size={14} className="text-blue-400" /> Web Recording
        </h3>
        <div className="bg-card rounded-xl border border-border p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2.5 rounded-lg bg-blue-500/15"><Monitor size={16} className="text-blue-400" /></div>
            <div className="flex-1">
              <span className="text-sm font-medium text-white">Browser Session</span>
              <p className="text-xs text-muted mt-0.5">별도 디바이스 없이 웹 브라우저 세션을 바로 시작합니다.</p>
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

      {/* ═══ iOS Devices ═══ */}
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
                onBorrow={() => handleBorrow(device)}
                borrowing={borrowingId === device.id}
              />
            ))}
          </div>
        )}
      </div>

      {/* ═══ Android Devices ═══ */}
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
                onBorrow={() => handleBorrow(device)}
                borrowing={borrowingId === device.id}
                borrowBgClass="bg-yellow-500 hover:bg-yellow-400 text-black"
              />
            ))}
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
  borrowing,
  borrowBgClass,
}: {
  device: any;
  platformIcon: React.ReactNode;
  platformBgClass: string;
  osLabel: string;
  statusBadge: (s: string) => string;
  statusLabel: (s: string) => string;
  onBorrow: () => void;
  borrowing: boolean;
  borrowBgClass?: string;
}) {
  const isBorrowedByOther = device.status === 'in_use' && !device.borrowedByMe;
  const isUnavailable = device.status === 'in_use' || device.status === 'offline';

  return (
    <div className={`bg-card rounded-xl border border-border p-4 transition-colors ${
      isBorrowedByOther ? 'opacity-50 pointer-events-none' : 'hover:border-border/80'
    }`}>
      <div className="flex items-center gap-3 mb-3">
        <div className={`p-2.5 rounded-lg ${platformBgClass}`}>{platformIcon}</div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-white truncate">{device.name || device.model}</div>
          <div className="text-xs text-muted">{osLabel}</div>
        </div>
        <div className="flex items-center gap-1">
          {device.healthStatus && device.healthStatus !== 'unknown' && (
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
              device.healthStatus === 'healthy' ? 'bg-green-500/15 text-green-400' :
              device.healthStatus === 'degraded' ? 'bg-yellow-500/15 text-yellow-400' :
              device.healthStatus === 'unhealthy' ? 'bg-red-500/15 text-red-400' :
              device.healthStatus === 'quarantined' ? 'bg-orange-500/15 text-orange-400' :
              'bg-gray-500/15 text-gray-400'
            }`}>
              {device.healthStatus}
            </span>
          )}
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${statusBadge(device.status)}`}>
            {statusLabel(device.status)}
          </span>
        </div>
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
            <Lock size={10} /> {borrowing ? '대여 중...' : '대여'}
          </button>
        ) : device.status === 'in_use' ? (
          <span className="text-yellow-400/70 text-[10px] flex items-center gap-1">
            <Lock size={9} /> {isBorrowedByOther ? '다른 사용자 대여 중' : '대여됨'}
          </span>
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

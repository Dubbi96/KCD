import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import {
  Video, Monitor, Smartphone, TabletSmartphone, Play, Square,
  Globe, ChevronDown, RefreshCw, ArrowLeftRight, Circle,
} from 'lucide-react';

export default function RecorderPage() {
  const navigate = useNavigate();
  const [devices, setDevices] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const hasLoaded = useRef(false);

  // Web session form
  const [webUrl, setWebUrl] = useState('https://');
  const [webFps, setWebFps] = useState(2);
  const [webDeviceType, setWebDeviceType] = useState('desktop');
  const [webStarting, setWebStarting] = useState(false);

  // Mobile session
  const [recordingDeviceId, setRecordingDeviceId] = useState<string | null>(null);
  const [bundleId, setBundleId] = useState('');
  const [appPackage, setAppPackage] = useState('');
  const [appActivity, setAppActivity] = useState('');
  const [mobileStarting, setMobileStarting] = useState(false);

  const load = async (initial = false) => {
    if (initial) setLoading(true);
    try {
      const [d, s] = await Promise.all([
        api.getDevices().catch(() => []),
        api.getDeviceSessions().catch(() => []),
      ]);
      setDevices(d);
      setSessions(s);
      hasLoaded.current = true;
    } finally {
      if (initial) setLoading(false);
    }
  };

  useEffect(() => { load(true); }, []);
  useEffect(() => {
    const t = setInterval(() => load(false), 10000);
    return () => clearInterval(t);
  }, []);

  const activeSessions = sessions.filter(s => s.status !== 'closed' && s.status !== 'error');
  const recordingSessions = activeSessions.filter(s => s.status === 'recording' || s.status === 'active');

  // Available devices for recording (available or borrowed by me)
  const availableDevices = devices.filter(
    d => d.status === 'available' || (d.status === 'in_use' && d.borrowedByMe)
  );
  const iosDevices = availableDevices.filter(d => d.platform === 'ios');
  const androidDevices = availableDevices.filter(d => d.platform === 'android');

  const handleWebRecord = async () => {
    if (!webUrl || webUrl === 'https://') { alert('URL을 입력하세요.'); return; }
    setWebStarting(true);
    try {
      const session = await api.createWebSession({ url: webUrl, fps: webFps, deviceType: webDeviceType });
      navigate(`/devices/mirror/${session.id}`);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setWebStarting(false);
    }
  };

  const handleMobileRecord = async (device: any) => {
    setMobileStarting(true);
    try {
      // Auto-borrow if not already borrowed
      if (device.status === 'available') {
        await api.borrowDevice(device.id);
      }
      const extra: Record<string, any> = {};
      if (device.platform === 'ios' && bundleId) extra.bundleId = bundleId;
      if (device.platform === 'android') {
        if (appPackage) extra.appPackage = appPackage;
        if (appActivity) extra.appActivity = appActivity;
      }
      const session = await api.createDeviceSession({ deviceId: device.id, fps: 2, ...extra });
      navigate(`/devices/mirror/${session.id}`);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setMobileStarting(false);
      setRecordingDeviceId(null);
    }
  };

  const handleCloseSession = async (sessionId: string) => {
    if (!confirm('녹화 세션을 종료하시겠습니까?')) return;
    try {
      await api.closeDeviceSession(sessionId);
      await load(false);
    } catch {
      load(false);
    }
  };

  const inputClass = 'w-full px-3 py-2 bg-card2 border border-border rounded-lg text-white text-sm focus:ring-1 focus:ring-accent focus:border-accent outline-none transition-colors';

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

  if (loading) {
    return (
      <div className="p-8 animate-fade-in">
        <h2 className="text-xl font-bold text-white mb-2">시나리오 녹화</h2>
        <p className="text-xs text-muted mb-6">디바이스를 선택하고 조작을 녹화하여 시나리오를 생성합니다.</p>
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
          <h2 className="text-xl font-bold text-white">시나리오 녹화</h2>
          <p className="text-xs text-muted mt-0.5">
            브라우저 또는 모바일 디바이스에서 조작을 녹화하여 시나리오를 생성합니다.
          </p>
        </div>
        <button onClick={() => load(false)} className="flex items-center gap-1.5 text-muted hover:text-white text-sm transition-colors">
          <RefreshCw size={14} /> 새로고침
        </button>
      </div>

      {/* ═══ Active Recording Sessions ═══ */}
      {recordingSessions.length > 0 && (
        <div className="mb-8">
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <Circle size={10} className="text-red-400 fill-red-400 animate-pulse" /> 진행 중인 녹화
          </h3>
          <div className="space-y-2">
            {recordingSessions.map(session => (
              <div key={session.id} className="bg-card rounded-xl border border-red-500/20 p-4 hover:border-red-500/40 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${platformBg(session.platform)}`}>
                      {platformIcon(session.platform)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-white">
                          {session.deviceName || `${session.platform} session`}
                        </span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-500/15 text-red-400">
                          REC
                        </span>
                      </div>
                      <div className="text-xs text-muted mt-0.5">
                        {session.options?.url && <span>{session.options.url} | </span>}
                        시작: {new Date(session.createdAt).toLocaleString('ko-KR')}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => navigate(`/devices/mirror/${session.id}`)}
                      className="flex items-center gap-1 bg-accent/15 text-accent px-2.5 py-1 rounded-lg text-xs hover:bg-accent/25 transition-colors"
                    >
                      <ArrowLeftRight size={12} /> 다시 열기
                    </button>
                    <button
                      onClick={() => handleCloseSession(session.id)}
                      className="flex items-center gap-1 text-muted hover:text-orange-400 text-xs transition-colors px-2 py-1"
                    >
                      <Square size={12} /> 종료
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ Web Recording ═══ */}
      <div className="mb-8">
        <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <Globe size={14} className="text-blue-400" /> 웹 녹화
        </h3>
        <div className="bg-card rounded-xl border border-border p-5">
          <p className="text-xs text-muted mb-4">
            별도 디바이스 없이 웹 브라우저에서 바로 녹화를 시작합니다.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
            <div className="md:col-span-2">
              <label className="block text-xs text-muted mb-1">URL</label>
              <input type="url" value={webUrl} onChange={(e) => setWebUrl(e.target.value)} placeholder="https://example.com" className={inputClass} />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">디바이스 프리셋</label>
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
                  <option value={1}>1</option>
                  <option value={2}>2</option>
                  <option value={3}>3</option>
                  <option value={5}>5</option>
                </select>
                <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
              </div>
            </div>
            <div>
              <button
                onClick={handleWebRecord}
                disabled={webStarting}
                className="w-full flex items-center justify-center gap-1.5 bg-blue-500 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-600 transition-colors disabled:opacity-50"
              >
                <Video size={14} /> {webStarting ? '시작 중...' : '녹화 시작'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ iOS Recording ═══ */}
      <div className="mb-8">
        <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <Smartphone size={14} className="text-green-400" /> iOS 녹화
        </h3>
        {iosDevices.length === 0 ? (
          <div className="bg-card rounded-xl border border-border p-5 text-center">
            <Smartphone size={24} className="text-muted mx-auto mb-2" />
            <p className="text-sm text-muted">사용 가능한 iOS 디바이스가 없습니다.</p>
            <p className="text-xs text-muted mt-1">KRC 노드에 iPhone/iPad를 USB로 연결하세요.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {iosDevices.map(device => (
              <RecordDeviceCard
                key={device.id}
                device={device}
                icon={<Smartphone size={16} className="text-green-400" />}
                bgClass="bg-green-500/15"
                osLabel={`iOS ${device.version || ''}`}
                expanded={recordingDeviceId === device.id}
                onToggle={() => setRecordingDeviceId(recordingDeviceId === device.id ? null : device.id)}
                onRecord={() => handleMobileRecord(device)}
                starting={mobileStarting}
              >
                <div>
                  <label className="block text-xs text-muted mb-1">Bundle ID (선택)</label>
                  <input value={bundleId} onChange={(e) => setBundleId(e.target.value)} placeholder="com.example.app" className={inputClass} />
                </div>
              </RecordDeviceCard>
            ))}
          </div>
        )}
      </div>

      {/* ═══ Android Recording ═══ */}
      <div className="mb-8">
        <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <TabletSmartphone size={14} className="text-yellow-400" /> Android 녹화
        </h3>
        {androidDevices.length === 0 ? (
          <div className="bg-card rounded-xl border border-border p-5 text-center">
            <TabletSmartphone size={24} className="text-muted mx-auto mb-2" />
            <p className="text-sm text-muted">사용 가능한 Android 디바이스가 없습니다.</p>
            <p className="text-xs text-muted mt-1">ADB 디버깅이 활성화된 Android 기기를 연결하세요.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {androidDevices.map(device => (
              <RecordDeviceCard
                key={device.id}
                device={device}
                icon={<TabletSmartphone size={16} className="text-yellow-400" />}
                bgClass="bg-yellow-500/15"
                osLabel={`Android ${device.version || ''}`}
                expanded={recordingDeviceId === device.id}
                onToggle={() => setRecordingDeviceId(recordingDeviceId === device.id ? null : device.id)}
                onRecord={() => handleMobileRecord(device)}
                starting={mobileStarting}
                recordBtnClass="bg-yellow-500 hover:bg-yellow-400 text-black"
              >
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-xs text-muted mb-1">Package (선택)</label>
                    <input value={appPackage} onChange={(e) => setAppPackage(e.target.value)} placeholder="com.example.app" className={inputClass} />
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs text-muted mb-1">Activity (선택)</label>
                    <input value={appActivity} onChange={(e) => setAppActivity(e.target.value)} placeholder=".MainActivity" className={inputClass} />
                  </div>
                </div>
              </RecordDeviceCard>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function RecordDeviceCard({
  device,
  icon,
  bgClass,
  osLabel,
  expanded,
  onToggle,
  onRecord,
  starting,
  recordBtnClass,
  children,
}: {
  device: any;
  icon: React.ReactNode;
  bgClass: string;
  osLabel: string;
  expanded: boolean;
  onToggle: () => void;
  onRecord: () => void;
  starting: boolean;
  recordBtnClass?: string;
  children: React.ReactNode;
}) {
  const isBorrowedByMe = device.borrowedByMe;

  return (
    <div className="bg-card rounded-xl border border-border p-4 hover:border-border/80 transition-colors">
      <div className="flex items-center gap-3 mb-3">
        <div className={`p-2.5 rounded-lg ${bgClass}`}>{icon}</div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-white truncate">{device.name || device.model}</div>
          <div className="text-xs text-muted">{osLabel}</div>
        </div>
        {isBorrowedByMe && (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-yellow-500/15 text-yellow-400">대여 중</span>
        )}
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted font-mono">{(device.deviceUdid || device.id)?.slice(0, 12)}...</span>
        <button
          onClick={onToggle}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] transition-colors ${
            expanded ? 'bg-red-500/15 text-red-400' : (recordBtnClass || 'bg-green-500 text-white hover:bg-green-600')
          }`}
        >
          <Video size={10} /> {expanded ? '취소' : '녹화'}
        </button>
      </div>
      {expanded && (
        <div className="mt-3 pt-3 border-t border-border space-y-3">
          {children}
          <button
            onClick={onRecord}
            disabled={starting}
            className={`w-full flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-50 ${
              recordBtnClass || 'bg-green-500 text-white hover:bg-green-600'
            }`}
          >
            <Play size={14} /> {starting ? '세션 생성 중...' : '녹화 시작'}
          </button>
        </div>
      )}
    </div>
  );
}

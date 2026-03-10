import { Shield, ShieldAlert, ShieldOff, ShieldQuestion, AlertTriangle } from 'lucide-react';

interface Device {
  id: string;
  name?: string;
  model?: string;
  platform: string;
  deviceUdid?: string;
  status: string;
  healthStatus?: string;
  quarantineUntil?: string;
  lastFailureCode?: string;
  failureCount?: number;
  consecutiveFailures?: number;
  lastHealthCheckAt?: string;
}

const healthConfig: Record<string, { color: string; bg: string; icon: typeof Shield; label: string }> = {
  healthy:      { color: 'text-green-400',  bg: 'bg-green-500/15',  icon: Shield,         label: 'Healthy' },
  degraded:     { color: 'text-yellow-400', bg: 'bg-yellow-500/15', icon: AlertTriangle,   label: 'Degraded' },
  unhealthy:    { color: 'text-red-400',    bg: 'bg-red-500/15',    icon: ShieldAlert,     label: 'Unhealthy' },
  quarantined:  { color: 'text-orange-400', bg: 'bg-orange-500/15', icon: ShieldOff,       label: 'Quarantined' },
  unknown:      { color: 'text-gray-400',   bg: 'bg-gray-500/15',   icon: ShieldQuestion,  label: 'Unknown' },
};

export function HealthBadge({ status }: { status?: string }) {
  const s = status || 'unknown';
  const cfg = healthConfig[s] || healthConfig.unknown;
  const Icon = cfg.icon;

  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${cfg.bg} ${cfg.color}`}>
      <Icon size={10} />
      {cfg.label}
    </span>
  );
}

export function QuarantineBadge({ until }: { until?: string }) {
  if (!until) return null;
  const remaining = new Date(until).getTime() - Date.now();
  if (remaining <= 0) return null;
  const mins = Math.ceil(remaining / 60000);
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-500/15 text-orange-400">
      <ShieldOff size={10} />
      {mins}m remaining
    </span>
  );
}

export default function HealthMatrix({ devices, onQuarantine, onUnquarantine }: {
  devices: Device[];
  onQuarantine?: (id: string) => void;
  onUnquarantine?: (id: string) => void;
}) {
  if (!devices.length) {
    return <p className="text-sm text-muted py-4 text-center">No devices found.</p>;
  }

  const platforms = [...new Set(devices.map(d => d.platform))].sort();

  return (
    <div className="space-y-4">
      {platforms.map(platform => {
        const pDevices = devices.filter(d => d.platform === platform);
        const healthy = pDevices.filter(d => d.healthStatus === 'healthy').length;
        const degraded = pDevices.filter(d => d.healthStatus === 'degraded').length;
        const unhealthy = pDevices.filter(d => d.healthStatus === 'unhealthy').length;
        const quarantined = pDevices.filter(d => d.healthStatus === 'quarantined' || (d.quarantineUntil && new Date(d.quarantineUntil) > new Date())).length;

        return (
          <div key={platform} className="bg-card2 border border-border rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-semibold text-white capitalize">{platform}</h4>
              <div className="flex items-center gap-2 text-[10px]">
                <span className="text-green-400">{healthy} healthy</span>
                {degraded > 0 && <span className="text-yellow-400">{degraded} degraded</span>}
                {unhealthy > 0 && <span className="text-red-400">{unhealthy} unhealthy</span>}
                {quarantined > 0 && <span className="text-orange-400">{quarantined} quarantined</span>}
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              {pDevices.map(device => {
                const isQuarantined = device.quarantineUntil && new Date(device.quarantineUntil) > new Date();
                return (
                  <div
                    key={device.id}
                    className={`border border-border rounded-lg p-2.5 transition-colors ${
                      isQuarantined ? 'bg-orange-500/5 border-orange-500/20' :
                      device.healthStatus === 'unhealthy' ? 'bg-red-500/5 border-red-500/20' :
                      'bg-card hover:border-border/80'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-white truncate">{device.name || device.model || device.deviceUdid?.slice(0, 8)}</span>
                      <HealthBadge status={isQuarantined ? 'quarantined' : device.healthStatus} />
                    </div>
                    <div className="text-[10px] text-muted space-y-0.5">
                      <div>Status: {device.status}</div>
                      {device.consecutiveFailures ? <div>Consecutive failures: {device.consecutiveFailures}</div> : null}
                      {device.lastFailureCode && <div className="text-red-400/80 truncate">Last: {device.lastFailureCode}</div>}
                    </div>
                    {isQuarantined && (
                      <div className="mt-1.5 flex items-center justify-between">
                        <QuarantineBadge until={device.quarantineUntil} />
                        {onUnquarantine && (
                          <button
                            onClick={() => onUnquarantine(device.id)}
                            className="text-[10px] text-orange-400 hover:text-orange-300 transition-colors"
                          >
                            Release
                          </button>
                        )}
                      </div>
                    )}
                    {!isQuarantined && device.healthStatus === 'unhealthy' && onQuarantine && (
                      <button
                        onClick={() => onQuarantine(device.id)}
                        className="mt-1.5 text-[10px] text-orange-400 hover:text-orange-300 transition-colors"
                      >
                        Quarantine
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

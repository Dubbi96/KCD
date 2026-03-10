import { AlertCircle, Wrench, Lightbulb } from 'lucide-react';

interface ScenarioResult {
  name?: string;
  status?: string;
  error?: string;
  failureCode?: string;
  failureCategory?: string;
  infraFailure?: boolean;
  recoveryAction?: string;
  passed?: boolean;
}

const CATEGORY_LABELS: Record<string, string> = {
  DEVICE: 'Device',
  SESSION: 'Session',
  APP: 'App',
  CAPTURE: 'Capture',
  INFRA: 'Infra',
  NETWORK: 'Network',
  UNKNOWN: 'Unknown',
};

const RECOMMENDATIONS: Record<string, string> = {
  DEVICE_DISCONNECTED: 'Check USB cable or Wi-Fi pairing. Ensure device is unlocked.',
  WDA_NOT_REACHABLE: 'Restart WebDriverAgent or re-sign with a valid provisioning profile.',
  ADB_OFFLINE: 'Re-enable USB debugging. Try: adb reconnect',
  SESSION_STALE: 'Session timed out. Increase timeout or reduce test duration.',
  BROWSER_CRASH: 'Check memory usage. Reduce parallel browser count.',
  APP_NOT_INSTALLED: 'Verify bundle ID / package name. Install the app before running.',
  APP_LAUNCH_TIMEOUT: 'App launch is slow. Increase launch timeout or check device resources.',
  ELEMENT_NOT_FOUND: 'UI element missing. Check selector or wait for element to appear.',
  SCREENSHOT_FAILED: 'Screenshot capture failed. Check screen lock settings.',
  NETWORK_TIMEOUT: 'Network timeout. Check connectivity and proxy settings.',
  PORT_CONFLICT: 'Port in use. Kill conflicting processes or change port range.',
  UNKNOWN: 'Unexpected error. Check runner logs for details.',
};

export default function DiagnosisSummary({ scenarios }: { scenarios: ScenarioResult[] }) {
  const failed = scenarios.filter(s => s.status === 'failed' || s.passed === false);
  if (!failed.length) return null;

  // Group by failure code
  const byCode: Record<string, ScenarioResult[]> = {};
  for (const s of failed) {
    const code = s.failureCode || 'UNKNOWN';
    if (!byCode[code]) byCode[code] = [];
    byCode[code].push(s);
  }

  const infraCount = failed.filter(s => s.infraFailure).length;
  const testCount = failed.length - infraCount;

  return (
    <div className="bg-card rounded-xl border border-border p-4">
      <h4 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
        <AlertCircle size={14} className="text-red-400" /> Failure Diagnosis
      </h4>

      <div className="flex items-center gap-3 mb-3 text-[11px]">
        {infraCount > 0 && (
          <span className="px-2 py-0.5 rounded bg-orange-500/15 text-orange-400">
            Infra: {infraCount}
          </span>
        )}
        {testCount > 0 && (
          <span className="px-2 py-0.5 rounded bg-red-500/15 text-red-400">
            Test: {testCount}
          </span>
        )}
      </div>

      <div className="space-y-2">
        {Object.entries(byCode).map(([code, items]) => {
          const category = items[0]?.failureCategory || 'UNKNOWN';
          const recommendation = RECOMMENDATIONS[code] || RECOMMENDATIONS.UNKNOWN;

          return (
            <div key={code} className="bg-card2 border border-border rounded-lg p-3">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-medium text-red-400">{code}</span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-gray-500/15 text-gray-400">
                    {CATEGORY_LABELS[category] || category}
                  </span>
                  {items[0]?.infraFailure && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-orange-500/15 text-orange-400">Infra</span>
                  )}
                </div>
                <span className="text-[10px] text-muted">{items.length} scenario{items.length > 1 ? 's' : ''}</span>
              </div>

              {items[0]?.recoveryAction && (
                <div className="flex items-center gap-1.5 text-[11px] text-yellow-400 mb-1">
                  <Wrench size={10} />
                  Recovery: {items[0].recoveryAction}
                </div>
              )}

              <div className="flex items-start gap-1.5 text-[11px] text-blue-400">
                <Lightbulb size={10} className="mt-0.5 flex-shrink-0" />
                <span>{recommendation}</span>
              </div>

              {items.length <= 3 && (
                <div className="mt-1.5 text-[10px] text-muted">
                  {items.map((s, i) => (
                    <span key={i}>
                      {i > 0 && ', '}
                      {s.name || 'unnamed'}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

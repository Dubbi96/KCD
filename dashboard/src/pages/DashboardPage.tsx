import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { Activity, FileText, Clock, Monitor } from 'lucide-react';

export default function DashboardPage() {
  const [stats, setStats] = useState({ scenarios: 0, schedules: 0, runners: 0, recentRuns: [] as any[] });
  const [queueStats, setQueueStats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.getScenarios().catch(() => []),
      api.getSchedules().catch(() => []),
      api.getRunners().catch(() => []),
      api.getRuns(5, 0).catch(() => ({ runs: [], total: 0 })),
      api.getQueueStats().catch(() => []),
    ]).then(([scenarios, schedules, runners, runs, qs]) => {
      setStats({
        scenarios: scenarios.length,
        schedules: schedules.length,
        runners: runners.length,
        recentRuns: runs.runs || [],
      });
      setQueueStats(qs);
      setLoading(false);
    });
  }, []);

  const statusColor = (s: string) => {
    const map: Record<string, string> = {
      completed: 'bg-green-500/15 text-green-400',
      passed: 'bg-green-500/15 text-green-400',
      failed: 'bg-red-500/15 text-red-400',
      running: 'bg-blue-500/15 text-blue-400',
      queued: 'bg-yellow-500/15 text-yellow-400',
      cancelled: 'bg-gray-500/15 text-gray-400',
    };
    return map[s] || 'bg-gray-500/15 text-gray-400';
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="grid grid-cols-4 gap-4 mb-8">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-card rounded-xl border border-border p-5 h-24 animate-shimmer bg-gradient-to-r from-card via-card2 to-card bg-[length:200%_100%]" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 animate-fade-in">
      <h2 className="text-xl font-bold text-white mb-6">Dashboard</h2>

      {/* Stats cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Scenarios', value: stats.scenarios, icon: FileText, color: 'text-blue-400' },
          { label: 'Schedules', value: stats.schedules, icon: Clock, color: 'text-purple-400' },
          { label: 'Runners', value: stats.runners, icon: Monitor, color: 'text-green-400' },
          { label: 'Recent Runs', value: stats.recentRuns.length, icon: Activity, color: 'text-orange-400' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-card rounded-xl border border-border p-5 hover:border-border/80 transition-colors">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted">{label}</p>
                <p className="text-2xl font-bold text-white mt-1">{value}</p>
              </div>
              <Icon size={22} className={color} />
            </div>
          </div>
        ))}
      </div>

      {/* Queue Stats */}
      {queueStats.length > 0 && (
        <div className="bg-card rounded-xl border border-border p-5 mb-8">
          <h3 className="text-sm font-semibold text-white mb-4">Queue Status</h3>
          <div className="grid grid-cols-3 gap-3">
            {queueStats.map((q) => (
              <div key={q.platform} className="bg-card2 border border-border rounded-lg p-4">
                <h4 className="text-xs font-medium text-white capitalize mb-2">{q.platform}</h4>
                <div className="grid grid-cols-2 gap-1.5 text-xs">
                  <div><span className="text-muted">Waiting:</span> <span className="text-white font-medium">{q.waiting}</span></div>
                  <div><span className="text-muted">Active:</span> <span className="text-white font-medium">{q.active}</span></div>
                  <div><span className="text-muted">Completed:</span> <span className="text-white font-medium">{q.completed}</span></div>
                  <div><span className="text-muted">Failed:</span> <span className="text-white font-medium">{q.failed}</span></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Runs */}
      <div className="bg-card rounded-xl border border-border p-5">
        <h3 className="text-sm font-semibold text-white mb-4">Recent Runs</h3>
        {stats.recentRuns.length === 0 ? (
          <p className="text-muted text-xs">No runs yet. Create a run from Schedules or Runs page.</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-muted border-b border-border">
                <th className="pb-2.5 font-medium">ID</th>
                <th className="pb-2.5 font-medium">Mode</th>
                <th className="pb-2.5 font-medium">Platform</th>
                <th className="pb-2.5 font-medium">Status</th>
                <th className="pb-2.5 font-medium">Scenarios</th>
                <th className="pb-2.5 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {stats.recentRuns.map((run) => (
                <tr key={run.id} className="border-b border-border/50 last:border-0">
                  <td className="py-2.5 font-mono text-muted">{run.id.slice(0, 8)}</td>
                  <td className="py-2.5 text-white capitalize">{run.mode}</td>
                  <td className="py-2.5 text-white capitalize">{run.targetPlatform || run.target_platform}</td>
                  <td className="py-2.5">
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${statusColor(run.status)}`}>
                      {run.status}
                    </span>
                  </td>
                  <td className="py-2.5 text-white">{run.passedCount || 0}/{run.totalScenarios || run.total_scenarios || 0}</td>
                  <td className="py-2.5 text-muted">{new Date(run.createdAt || run.created_at).toLocaleString('ko-KR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

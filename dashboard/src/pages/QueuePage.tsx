import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { RefreshCw, RotateCcw, Trash2, ChevronDown } from 'lucide-react';

const PLATFORMS = ['web', 'ios', 'android'] as const;
const STATUSES = ['waiting', 'active', 'completed', 'failed', 'delayed'] as const;

export default function QueuePage() {
  const [platform, setPlatform] = useState<string>('web');
  const [status, setStatus] = useState<string>('waiting');
  const [stats, setStats] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [expandedJob, setExpandedJob] = useState<string | null>(null);

  const loadStats = () => {
    api.getQueueStats().then(setStats).catch(() => []);
  };

  const loadJobs = (p = platform, s = status) => {
    setJobsLoading(true);
    api.getQueueJobs(p, s, 0, 49)
      .then(setJobs)
      .catch(() => setJobs([]))
      .finally(() => setJobsLoading(false));
  };

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.getQueueStats().catch(() => []),
      api.getQueueJobs(platform, status, 0, 49).catch(() => []),
    ]).then(([s, j]) => {
      setStats(s);
      setJobs(j);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    loadJobs(platform, status);
  }, [platform, status]);

  const refresh = () => {
    loadStats();
    loadJobs();
  };

  const handleRetry = async (jobId: string) => {
    await api.retryJob(platform, jobId);
    loadJobs();
    loadStats();
  };

  const handleRemove = async (jobId: string) => {
    if (!confirm('Remove this job from the queue?')) return;
    await api.removeJob(platform, jobId);
    loadJobs();
    loadStats();
  };

  const statusColor = (s: string) => {
    const map: Record<string, string> = {
      waiting: 'bg-yellow-500/15 text-yellow-400',
      active: 'bg-blue-500/15 text-blue-400',
      completed: 'bg-green-500/15 text-green-400',
      failed: 'bg-red-500/15 text-red-400',
      delayed: 'bg-orange-500/15 text-orange-400',
    };
    return map[s] || 'bg-gray-500/15 text-gray-400';
  };

  const currentStat = stats.find((s) => s.platform === platform);

  return (
    <div className="p-8 animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-white">Queue Management</h2>
          <p className="text-xs text-muted mt-0.5">Monitor and manage BullMQ job queues per platform</p>
        </div>
        <button onClick={refresh} className="flex items-center gap-1.5 text-muted hover:text-white text-sm transition-colors">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Platform Stats Overview */}
      {loading ? (
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-card rounded-xl border border-border p-4 h-24 animate-shimmer bg-gradient-to-r from-card via-card2 to-card bg-[length:200%_100%]" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3 mb-6">
          {PLATFORMS.map((p) => {
            const s = stats.find((x) => x.platform === p);
            const isActive = platform === p;
            return (
              <button
                key={p}
                onClick={() => setPlatform(p)}
                className={`bg-card rounded-xl border p-4 text-left transition-colors ${
                  isActive ? 'border-accent' : 'border-border hover:border-border/80'
                }`}
              >
                <h4 className="text-xs font-medium text-white capitalize mb-2">{p}</h4>
                {s ? (
                  <div className="grid grid-cols-2 gap-1 text-[11px]">
                    <div><span className="text-yellow-400">{s.waiting}</span> <span className="text-muted">waiting</span></div>
                    <div><span className="text-blue-400">{s.active}</span> <span className="text-muted">active</span></div>
                    <div><span className="text-green-400">{s.completed}</span> <span className="text-muted">done</span></div>
                    <div><span className="text-red-400">{s.failed}</span> <span className="text-muted">failed</span></div>
                  </div>
                ) : (
                  <p className="text-[11px] text-muted">No data</p>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Status Tabs */}
      <div className="flex gap-1 mb-4">
        {STATUSES.map((s) => {
          const count = s === 'waiting' ? currentStat?.waiting
            : s === 'active' ? currentStat?.active
            : s === 'completed' ? currentStat?.completed
            : s === 'failed' ? currentStat?.failed : 0;
          return (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize ${
                status === s
                  ? 'bg-accent text-white'
                  : 'text-muted hover:text-white hover:bg-card2'
              }`}
            >
              {s} {count != null && <span className="opacity-60">({count})</span>}
            </button>
          );
        })}
      </div>

      {/* Jobs List */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        {jobsLoading ? (
          <div className="p-8 text-center text-muted text-sm">Loading jobs...</div>
        ) : jobs.length === 0 ? (
          <div className="p-8 text-center text-muted text-sm">
            No {status} jobs in <span className="capitalize">{platform}</span> queue
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {jobs.map((job) => (
              <div key={job.id} className="hover:bg-card2/30 transition-colors">
                <div className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <button
                      onClick={() => setExpandedJob(expandedJob === job.id ? null : job.id)}
                      className="text-muted hover:text-white transition-colors"
                    >
                      <ChevronDown size={14} className={`transition-transform ${expandedJob === job.id ? 'rotate-180' : ''}`} />
                    </button>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-white">{job.id?.slice(0, 12)}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${statusColor(status)}`}>{status}</span>
                      </div>
                      <div className="text-[11px] text-muted mt-0.5">
                        Scenario: {job.data?.scenarioId?.slice(0, 8) || '-'}
                        {job.attemptsMade > 0 && <span className="ml-2">Attempts: {job.attemptsMade}</span>}
                        {job.timestamp && <span className="ml-2">{new Date(job.timestamp).toLocaleString('ko-KR')}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {status === 'failed' && (
                      <button onClick={() => handleRetry(job.id)} className="p-1.5 text-muted hover:text-blue-400 transition-colors" title="Retry">
                        <RotateCcw size={13} />
                      </button>
                    )}
                    {['waiting', 'failed', 'delayed'].includes(status) && (
                      <button onClick={() => handleRemove(job.id)} className="p-1.5 text-muted hover:text-red-400 transition-colors" title="Remove">
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>

                {expandedJob === job.id && (
                  <div className="px-4 pb-3 animate-fade-in">
                    <pre className="bg-card2 border border-border rounded-lg p-3 text-[11px] text-muted font-mono overflow-auto max-h-48">
{JSON.stringify({
  data: job.data,
  attemptsMade: job.attemptsMade,
  processedOn: job.processedOn ? new Date(job.processedOn).toISOString() : null,
  finishedOn: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
  failedReason: job.failedReason,
  returnvalue: job.returnvalue,
}, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

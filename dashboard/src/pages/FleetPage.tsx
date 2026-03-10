import { useState, useEffect } from 'react';
import { api } from '../api/client';
import {
  Server, Cpu, HardDrive, Activity, RefreshCw, AlertTriangle,
  ChevronDown, ChevronUp, Wifi, WifiOff, Shield,
} from 'lucide-react';
import HealthMatrix from '../components/HealthMatrix';

export default function FleetPage() {
  const [pool, setPool] = useState<any>(null);
  const [nodes, setNodes] = useState<any[]>([]);
  const [devices, setDevices] = useState<any[]>([]);
  const [forecasts, setForecasts] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [expandedNode, setExpandedNode] = useState<string | null>(null);
  const [nodeDetails, setNodeDetails] = useState<Record<string, any>>({});

  const load = async () => {
    try {
      const [p, n, d] = await Promise.all([
        api.getPoolOverview().catch(() => null),
        api.getFleetNodes().catch(() => []),
        api.getFleetDevices().catch(() => []),
      ]);
      setPool(p);
      setNodes(n || []);
      setDevices(d || []);

      // Load forecasts for known platforms
      const platforms = p?.devices ? Object.keys(p.devices) : ['web', 'ios', 'android'];
      const fc: Record<string, any> = {};
      await Promise.all(
        platforms.map(async (pl) => {
          try {
            fc[pl] = await api.getCapacityForecast(pl);
          } catch { /* ignore */ }
        }),
      );
      setForecasts(fc);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => {
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  const toggleNode = async (nodeId: string) => {
    if (expandedNode === nodeId) {
      setExpandedNode(null);
      return;
    }
    setExpandedNode(nodeId);
    if (!nodeDetails[nodeId]) {
      try {
        const detail = await api.getFleetNodeDetail(nodeId);
        setNodeDetails(prev => ({ ...prev, [nodeId]: detail }));
      } catch { /* ignore */ }
    }
  };

  const handleQuarantine = async (deviceId: string) => {
    if (!confirm('Quarantine this device for 30 minutes?')) return;
    try {
      await api.quarantineDevice(deviceId, 30, 'manual');
      load();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleUnquarantine = async (deviceId: string) => {
    try {
      await api.unquarantineDevice(deviceId);
      load();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDrain = async (nodeId: string) => {
    if (!confirm('Drain this node? Running jobs will complete but no new jobs will be assigned.')) return;
    try {
      await api.drainNode(nodeId);
      load();
    } catch (err: any) {
      alert(err.message);
    }
  };

  if (loading) {
    return (
      <div className="p-8 animate-fade-in">
        <h2 className="text-xl font-bold text-white mb-6">Fleet</h2>
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-card rounded-xl border border-border p-5 h-20 animate-shimmer bg-gradient-to-r from-card via-card2 to-card bg-[length:200%_100%]" />
          ))}
        </div>
      </div>
    );
  }

  const cluster = pool?.cluster;
  const jobStats = pool?.jobs;
  const metrics = pool?.metrics;

  return (
    <div className="p-8 animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-white">Fleet</h2>
          <p className="text-xs text-muted mt-0.5">Cluster nodes, devices, and capacity overview</p>
        </div>
        <button onClick={load} className="flex items-center gap-1.5 text-muted hover:text-white text-sm transition-colors">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Cluster Overview */}
      {cluster && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">
          {[
            { label: 'Nodes', value: cluster.totalNodes, icon: Server, color: 'text-blue-400' },
            { label: 'Online', value: cluster.onlineNodes, icon: Wifi, color: 'text-green-400' },
            { label: 'CPU', value: `${cluster.avgCpuUsagePercent}%`, icon: Cpu, color: cluster.avgCpuUsagePercent > 80 ? 'text-red-400' : 'text-cyan-400' },
            { label: 'Memory', value: `${cluster.avgMemoryUsagePercent}%`, icon: HardDrive, color: cluster.avgMemoryUsagePercent > 80 ? 'text-red-400' : 'text-purple-400' },
            { label: 'Active Leases', value: pool?.activeLeases || 0, icon: Activity, color: 'text-yellow-400' },
            { label: 'Draining', value: cluster.drainingNodes, icon: AlertTriangle, color: cluster.drainingNodes > 0 ? 'text-orange-400' : 'text-gray-500' },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="bg-card rounded-xl border border-border p-3">
              <div className="flex items-center justify-between mb-1">
                <Icon size={14} className={color} />
              </div>
              <div className="text-lg font-bold text-white">{value}</div>
              <div className="text-[10px] text-muted">{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Operational Metrics */}
      {metrics && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-card rounded-xl border border-border p-4">
            <div className="text-xs text-muted mb-1">Recent Jobs</div>
            <div className="text-lg font-bold text-white">{metrics.recentJobCount}</div>
          </div>
          <div className="bg-card rounded-xl border border-border p-4">
            <div className="text-xs text-muted mb-1">Fail Rate</div>
            <div className={`text-lg font-bold ${metrics.recentFailRate > 20 ? 'text-red-400' : metrics.recentFailRate > 5 ? 'text-yellow-400' : 'text-green-400'}`}>
              {metrics.recentFailRate}%
            </div>
          </div>
          <div className="bg-card rounded-xl border border-border p-4">
            <div className="text-xs text-muted mb-1">Infra Fail Rate</div>
            <div className={`text-lg font-bold ${metrics.recentInfraFailRate > 10 ? 'text-red-400' : metrics.recentInfraFailRate > 2 ? 'text-yellow-400' : 'text-green-400'}`}>
              {metrics.recentInfraFailRate}%
            </div>
          </div>
        </div>
      )}

      {/* Capacity Forecasts */}
      {Object.keys(forecasts).length > 0 && (
        <div className="bg-card rounded-xl border border-border p-5 mb-6">
          <h3 className="text-sm font-semibold text-white mb-3">Capacity Forecast</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {Object.entries(forecasts).map(([platform, fc]) => (
              <div key={platform} className="bg-card2 border border-border rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-medium text-white capitalize">{platform}</h4>
                  {fc?.hasCapacity ? (
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-green-500/15 text-green-400">Available</span>
                  ) : (
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-red-500/15 text-red-400">No Capacity</span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                  <div><span className="text-muted">Slots:</span> <span className="text-white">{fc?.slots?.available || 0}/{fc?.slots?.total || 0}</span></div>
                  <div><span className="text-muted">Devices:</span> <span className="text-white">{fc?.availableDevices || 0}</span></div>
                  <div><span className="text-muted">Pending:</span> <span className="text-white">{fc?.pendingJobs || 0}</span></div>
                  <div><span className="text-muted">Running:</span> <span className="text-white">{fc?.runningJobs || 0}</span></div>
                  {(fc?.quarantinedDevices || 0) > 0 && (
                    <div className="col-span-2"><span className="text-orange-400">Quarantined: {fc.quarantinedDevices}</span></div>
                  )}
                  <div className="col-span-2">
                    <span className="text-muted">Est. delay:</span>{' '}
                    <span className={`${(fc?.estimatedQueueDelayMinutes || 0) > 10 ? 'text-yellow-400' : 'text-white'}`}>
                      {fc?.estimatedQueueDelayMinutes || 0}m
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Nodes */}
      <div className="bg-card rounded-xl border border-border p-5 mb-6">
        <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <Server size={14} className="text-blue-400" /> Nodes
        </h3>
        {nodes.length === 0 ? (
          <p className="text-sm text-muted py-4 text-center">No nodes registered.</p>
        ) : (
          <div className="space-y-2">
            {nodes.map((node: any) => {
              const isExpanded = expandedNode === node.id;
              const detail = nodeDetails[node.id];
              return (
                <div key={node.id} className="border border-border rounded-lg overflow-hidden">
                  <button
                    onClick={() => toggleNode(node.id)}
                    className="w-full flex items-center justify-between p-3 hover:bg-card2/30 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      {node.status === 'online' ? <Wifi size={14} className="text-green-400" /> : <WifiOff size={14} className="text-gray-400" />}
                      <div>
                        <span className="text-sm font-medium text-white">{node.name || node.id.slice(0, 8)}</span>
                        <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          node.status === 'online' ? 'bg-green-500/15 text-green-400' :
                          node.status === 'draining' ? 'bg-orange-500/15 text-orange-400' :
                          'bg-gray-500/15 text-gray-400'
                        }`}>
                          {node.status}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-[11px] text-muted">
                      <span>CPU: {node.cpuUsagePercent}%</span>
                      <span>MEM: {node.memoryUsagePercent}%</span>
                      <span>Platforms: {(node.platforms || []).join(', ')}</span>
                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </div>
                  </button>
                  {isExpanded && detail && (
                    <div className="border-t border-border p-3 bg-card2/20">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[11px] mb-3">
                        <div><span className="text-muted">Slots:</span> <span className="text-white">{JSON.stringify(detail.slots)}</span></div>
                        <div><span className="text-muted">Active Jobs:</span> <span className="text-white">{detail.activeJobs?.length || 0}</span></div>
                        <div><span className="text-muted">Devices:</span> <span className="text-white">{detail.devices?.length || 0}</span></div>
                        <div>
                          <span className="text-muted">Fail Rate:</span>{' '}
                          <span className={`${(detail.nodeFailRate || 0) > 20 ? 'text-red-400' : 'text-white'}`}>{detail.nodeFailRate || 0}%</span>
                        </div>
                      </div>
                      {node.status === 'online' && (
                        <button
                          onClick={() => handleDrain(node.id)}
                          className="text-[11px] text-orange-400 hover:text-orange-300 transition-colors flex items-center gap-1"
                        >
                          <AlertTriangle size={10} /> Drain Node
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Device Health Matrix */}
      <div className="bg-card rounded-xl border border-border p-5">
        <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <Shield size={14} className="text-green-400" /> Device Health
        </h3>
        <HealthMatrix
          devices={devices}
          onQuarantine={handleQuarantine}
          onUnquarantine={handleUnquarantine}
        />
      </div>
    </div>
  );
}

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * KCP Proxy Service
 *
 * Proxies resource/capacity queries from KCD to KCP (Control Plane).
 * KCD never computes resource state itself — KCP is the single source of truth
 * for nodes, devices, slots, leases, and jobs.
 */
@Injectable()
export class ControlPlaneService {
  private readonly logger = new Logger('ControlPlaneService');
  private readonly kcpBaseUrl: string;
  private readonly serviceToken: string;

  constructor(config: ConfigService) {
    this.kcpBaseUrl = config.get('KCP_API_URL', 'http://localhost:4100/api');
    this.serviceToken = config.get('KCP_SERVICE_TOKEN', '');
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.serviceToken) {
      headers['X-Service-Token'] = this.serviceToken;
    }
    return headers;
  }

  private async request(path: string, method = 'GET', body?: any): Promise<any> {
    try {
      const opts: RequestInit = {
        method,
        headers: this.buildHeaders(),
      };
      if (body) opts.body = JSON.stringify(body);

      const res = await fetch(`${this.kcpBaseUrl}${path}`, opts);
      if (!res.ok) return null;
      return await res.json();
    } catch (e: any) {
      this.logger.warn(`KCP request failed (${path}): ${e.message}`);
      return null;
    }
  }

  async getCapacity(tenantId?: string): Promise<any> {
    const query = tenantId ? `?tenantId=${tenantId}` : '';
    return this.request(`/resources/capacity${query}`);
  }

  async getPoolOverview(): Promise<any> {
    return this.request('/resources/pool');
  }

  async getNodes(): Promise<any> {
    return this.request('/nodes');
  }

  async getNodeDetail(nodeId: string): Promise<any> {
    return this.request(`/resources/nodes/${nodeId}`);
  }

  async drainNode(nodeId: string): Promise<any> {
    return this.request(`/nodes/${nodeId}/drain`, 'POST');
  }

  // === Device queries (KCP is source of truth for device inventory) ===

  async getDevices(filters?: { platform?: string; status?: string }): Promise<any[]> {
    const params = new URLSearchParams();
    if (filters?.platform) params.set('platform', filters.platform);
    if (filters?.status) params.set('status', filters.status);
    const query = params.toString() ? `?${params}` : '';
    return (await this.request(`/devices${query}`)) || [];
  }

  async getAvailableDevices(platform: string): Promise<any[]> {
    return (await this.request(`/devices/available?platform=${platform}`)) || [];
  }

  // === Job dispatch (KCD → KCP) ===

  async createJob(params: {
    tenantId: string;
    runId: string;
    scenarioRunId: string;
    scenarioId: string;
    platform: string;
    payload: Record<string, any>;
    priority?: number;
    requiredLabels?: string[];
  }): Promise<{ id: string } | null> {
    return this.request('/jobs', 'POST', params);
  }

  async cancelJob(jobId: string): Promise<any> {
    return this.request(`/jobs/${jobId}`, 'DELETE');
  }

  async getJobsByRun(runId: string): Promise<any[]> {
    return (await this.request(`/jobs/run/${runId}`)) || [];
  }

  async getJobStats(): Promise<Record<string, Record<string, number>> | null> {
    return this.request('/jobs/stats');
  }

  // === Device Health / Quarantine (Phase 5+) ===

  async getDeviceHealth(deviceId: string): Promise<any> {
    return this.request(`/devices/${deviceId}`);
  }

  async quarantineDevice(deviceId: string, durationMinutes?: number, reason?: string): Promise<any> {
    return this.request(`/devices/${deviceId}/quarantine`, 'POST', { durationMinutes, reason });
  }

  async unquarantineDevice(deviceId: string): Promise<any> {
    return this.request(`/devices/${deviceId}/quarantine`, 'DELETE');
  }

  async getCapacityForecast(platform: string): Promise<any> {
    return this.request(`/resources/capacity/forecast?platform=${platform}`);
  }
}

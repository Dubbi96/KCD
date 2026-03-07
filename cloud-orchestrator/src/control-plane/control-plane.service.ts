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

  constructor(config: ConfigService) {
    this.kcpBaseUrl = config.get('KCP_API_URL', 'http://localhost:4100/api');
  }

  private async request(path: string): Promise<any> {
    try {
      const res = await fetch(`${this.kcpBaseUrl}${path}`);
      if (!res.ok) return null;
      return await res.json();
    } catch (e: any) {
      this.logger.warn(`KCP request failed (${path}): ${e.message}`);
      return null;
    }
  }

  /**
   * Customer-facing capacity summary: available slots and devices per platform.
   * Hides internal node details — customers see abstract capacity.
   */
  async getCapacity(tenantId?: string): Promise<any> {
    const query = tenantId ? `?tenantId=${tenantId}` : '';
    return this.request(`/resources/capacity${query}`);
  }

  /**
   * Full cluster pool overview (admin/operational view).
   */
  async getPoolOverview(): Promise<any> {
    return this.request('/resources/pool');
  }

  /**
   * List all registered nodes.
   */
  async getNodes(): Promise<any> {
    return this.request('/nodes');
  }

  /**
   * Get specific node details.
   */
  async getNodeDetail(nodeId: string): Promise<any> {
    return this.request(`/resources/nodes/${nodeId}`);
  }

  /**
   * Initiate node drain via KCP.
   */
  async drainNode(nodeId: string): Promise<any> {
    try {
      const res = await fetch(`${this.kcpBaseUrl}/nodes/${nodeId}/drain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) return null;
      return await res.json();
    } catch (e: any) {
      this.logger.warn(`KCP drain request failed: ${e.message}`);
      return null;
    }
  }
}

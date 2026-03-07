import { Injectable, Logger } from '@nestjs/common';
import { ControlPlaneService } from '../control-plane/control-plane.service';

export interface ScenarioJobPayload {
  tenantId: string;
  scenarioRunId: string;
  runId: string;
  scenarioId: string;
  sequenceNo: number;
  platform: 'web' | 'ios' | 'android';
  options: Record<string, any>;
  attempt: number;
}

/**
 * RunQueueService — dispatches jobs to KCP (Control Plane).
 *
 * Previously used BullMQ/Redis for per-tenant queues.
 * Now proxies all job operations to KCP, which uses PostgreSQL
 * SELECT FOR UPDATE SKIP LOCKED for atomic job claiming by KRC nodes.
 */
@Injectable()
export class RunQueueService {
  private readonly logger = new Logger('RunQueueService');

  constructor(private readonly controlPlane: ControlPlaneService) {}

  async enqueueScenarioJob(payload: ScenarioJobPayload): Promise<string | null> {
    const job = await this.controlPlane.createJob({
      tenantId: payload.tenantId,
      runId: payload.runId,
      scenarioRunId: payload.scenarioRunId,
      scenarioId: payload.scenarioId,
      platform: payload.platform,
      payload: {
        sequenceNo: payload.sequenceNo,
        options: payload.options,
        attempt: payload.attempt,
      },
    });

    if (!job?.id) {
      this.logger.warn(`Failed to create KCP job for scenarioRun ${payload.scenarioRunId}`);
      return null;
    }

    this.logger.log(`Job ${job.id} created in KCP for scenarioRun ${payload.scenarioRunId}`);
    return job.id;
  }

  async cancelJob(jobId: string): Promise<void> {
    if (!jobId) return;
    const result = await this.controlPlane.cancelJob(jobId);
    if (!result) {
      this.logger.warn(`Failed to cancel KCP job ${jobId}`);
    }
  }

  async getQueueStats(tenantId: string, platform: string) {
    const stats = await this.controlPlane.getJobStats();
    if (!stats) return { platform, waiting: 0, active: 0, completed: 0, failed: 0 };

    const platformStats = stats[platform] || {};
    return {
      platform,
      waiting: (platformStats['pending'] || 0),
      active: (platformStats['assigned'] || 0) + (platformStats['running'] || 0),
      completed: platformStats['completed'] || 0,
      failed: platformStats['failed'] || 0,
    };
  }
}

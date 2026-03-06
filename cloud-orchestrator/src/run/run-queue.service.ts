import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, ConnectionOptions } from 'bullmq';
import IORedis from 'ioredis';

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

@Injectable()
export class RunQueueService implements OnModuleDestroy {
  private connectionOpts: ConnectionOptions;
  private queues = new Map<string, Queue>();
  private prefix: string;
  private pubClient: IORedis;

  constructor(private config: ConfigService) {
    this.connectionOpts = {
      host: config.get('REDIS_HOST', 'localhost'),
      port: config.get<number>('REDIS_PORT', 6379),
      password: config.get('REDIS_PASSWORD', undefined),
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    };
    this.prefix = config.get('RUNNER_QUEUE_PREFIX', 'katab');
    this.pubClient = new IORedis({
      host: this.connectionOpts.host as string,
      port: this.connectionOpts.port as number,
      password: this.connectionOpts.password as string | undefined,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: true,
    });
  }

  private getQueue(tenantId: string, platform: string): Queue {
    const queueName = `${this.prefix}-${tenantId}-${platform}`;
    if (!this.queues.has(queueName)) {
      this.queues.set(
        queueName,
        new Queue(queueName, { connection: this.connectionOpts }),
      );
    }
    return this.queues.get(queueName)!;
  }

  async enqueueScenarioJob(payload: ScenarioJobPayload) {
    const queue = this.getQueue(payload.tenantId, payload.platform);
    const job = await queue.add('scenario-run', payload, {
      jobId: payload.scenarioRunId,
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: 100,
      removeOnFail: 200,
    });
    return job.id;
  }

  async removeJob(tenantId: string, platform: string, jobId: string) {
    const queue = this.getQueue(tenantId, platform);
    const job = await queue.getJob(jobId);
    if (job) await job.remove();
  }

  async getQueueStats(tenantId: string, platform: string) {
    const queue = this.getQueue(tenantId, platform);
    const [waiting, active, completed, failed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
    ]);
    return { platform, waiting, active, completed, failed };
  }

  async getQueueJobs(tenantId: string, platform: string, status: 'waiting' | 'active' | 'completed' | 'failed' | 'delayed', start = 0, end = 19) {
    const queue = this.getQueue(tenantId, platform);
    const jobs = await queue.getJobs([status], start, end);
    return jobs.map((job) => ({
      id: job.id,
      name: job.name,
      data: job.data,
      attemptsMade: job.attemptsMade,
      timestamp: job.timestamp,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
      failedReason: job.failedReason,
      returnvalue: job.returnvalue,
    }));
  }

  async retryJob(tenantId: string, platform: string, jobId: string) {
    const queue = this.getQueue(tenantId, platform);
    const job = await queue.getJob(jobId);
    if (!job) return null;
    await job.retry();
    return { ok: true, jobId };
  }

  async publishPauseControl(message: { action: 'kill' | 'resume'; scenarioRunId: string; tenantId: string }) {
    await this.pubClient.connect().catch(() => {});
    await this.pubClient.publish('katab:pause-control', JSON.stringify(message));
  }

  async onModuleDestroy() {
    for (const queue of this.queues.values()) {
      await queue.close();
    }
    await this.pubClient.quit().catch(() => {});
  }
}

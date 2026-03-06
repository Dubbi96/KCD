import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Webhook } from './webhook.entity';
import { WebhookEvent } from './webhook-event.entity';
import { CreateWebhookDto } from './dto/create-webhook.dto';
import { buildSignatureHeaders } from './webhook-signer';
import { renderBody } from './renderers';

const RETRY_BACKOFF_MS = [0, 60_000, 300_000, 900_000, 3_600_000];
const PROCESS_INTERVAL_MS = 5_000;

@Injectable()
export class WebhookService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('WebhookService');
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private readonly dashboardUrl: string;

  constructor(
    @InjectRepository(Webhook) private webhookRepo: Repository<Webhook>,
    @InjectRepository(WebhookEvent) private eventRepo: Repository<WebhookEvent>,
    private configService: ConfigService,
  ) {
    this.dashboardUrl = this.configService.get<string>(
      'DASHBOARD_URL',
      'https://app.katab.io',
    );
  }

  onModuleInit() {
    this.intervalHandle = setInterval(
      () => this.processEvents().catch((e) => this.logger.error('processEvents error', e)),
      PROCESS_INTERVAL_MS,
    );
    this.logger.log('Webhook dispatcher started (5s interval)');
  }

  onModuleDestroy() {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  // --------------- CRUD ---------------

  async create(tenantId: string, dto: CreateWebhookDto) {
    const webhook = this.webhookRepo.create({ tenantId, ...dto });
    return this.webhookRepo.save(webhook);
  }

  async findAll(tenantId: string) {
    return this.webhookRepo.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
    });
  }

  async update(tenantId: string, id: string, dto: Partial<CreateWebhookDto>) {
    const webhook = await this.webhookRepo.findOne({ where: { id, tenantId } });
    if (!webhook) throw new NotFoundException('Webhook not found');
    Object.assign(webhook, dto);
    return this.webhookRepo.save(webhook);
  }

  async remove(tenantId: string, id: string) {
    const webhook = await this.webhookRepo.findOne({ where: { id, tenantId } });
    if (!webhook) throw new NotFoundException('Webhook not found');
    await this.webhookRepo.remove(webhook);
  }

  // --------------- Event Emission ---------------

  async emitEvent(tenantId: string, eventType: string, payload: any) {
    const webhooks = await this.webhookRepo.find({
      where: { tenantId, enabled: true },
    });

    const events: WebhookEvent[] = [];
    for (const wh of webhooks) {
      if (wh.eventsFilter.length > 0 && !wh.eventsFilter.includes(eventType)) {
        continue;
      }
      const event = this.eventRepo.create({
        tenantId,
        webhookId: wh.id,
        eventType,
        payload,
        status: 'pending',
        attempt: 0,
        maxAttempts: 5,
        nextRetryAt: new Date(),
      });
      events.push(event);
    }

    if (events.length > 0) {
      await this.eventRepo.save(events);
    }
  }

  // --------------- Test Event ---------------

  async sendTestEvent(tenantId: string, webhookId: string) {
    const webhook = await this.webhookRepo.findOne({
      where: { id: webhookId, tenantId },
    });
    if (!webhook) throw new NotFoundException('Webhook not found');

    const testPayload = {
      runId: '00000000-0000-0000-0000-000000000000',
      scenarioId: '00000000-0000-0000-0000-000000000000',
      scenarioName: 'Test Scenario',
      status: 'completed',
      duration: 1234,
      test: true,
    };

    const event = this.eventRepo.create({
      tenantId,
      webhookId: webhook.id,
      eventType: 'test.ping',
      payload: testPayload,
      status: 'pending',
      attempt: 0,
      maxAttempts: 1,
      nextRetryAt: new Date(),
    });
    await this.eventRepo.save(event);

    return { eventId: event.id, message: 'Test event queued' };
  }

  // --------------- Event Listing ---------------

  async findEvents(
    tenantId: string,
    webhookId: string,
    page: number,
    limit: number,
  ) {
    const webhook = await this.webhookRepo.findOne({
      where: { id: webhookId, tenantId },
    });
    if (!webhook) throw new NotFoundException('Webhook not found');

    const [events, total] = await this.eventRepo.findAndCount({
      where: { webhookId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    const stats = await this.eventRepo
      .createQueryBuilder('e')
      .select('e.status', 'status')
      .addSelect('COUNT(*)::int', 'count')
      .where('e.webhook_id = :webhookId', { webhookId })
      .groupBy('e.status')
      .getRawMany<{ status: string; count: number }>();

    return {
      events,
      total,
      page,
      limit,
      stats: stats.reduce(
        (acc, row) => ({ ...acc, [row.status]: row.count }),
        {} as Record<string, number>,
      ),
    };
  }

  // --------------- Dispatcher ---------------

  async processEvents() {
    const now = new Date();
    const pendingEvents = await this.eventRepo
      .createQueryBuilder('e')
      .where('e.status IN (:...statuses)', { statuses: ['pending', 'failed'] })
      .andWhere('e.next_retry_at <= :now', { now })
      .orderBy('e.next_retry_at', 'ASC')
      .take(50)
      .getMany();

    if (pendingEvents.length === 0) return;

    const webhookIds = [...new Set(pendingEvents.map((e) => e.webhookId))];
    const webhooks = await this.webhookRepo.find({
      where: { id: In(webhookIds) },
    });
    const webhookMap = new Map(webhooks.map((w) => [w.id, w]));

    await Promise.allSettled(
      pendingEvents.map((event) => this.deliverEvent(event, webhookMap)),
    );
  }

  private async deliverEvent(
    event: WebhookEvent,
    webhookMap: Map<string, Webhook>,
  ) {
    const webhook = webhookMap.get(event.webhookId);
    if (!webhook) {
      event.status = 'exhausted';
      event.lastError = 'Webhook deleted';
      await this.eventRepo.save(event);
      return;
    }

    const body = renderBody(
      webhook.type,
      event.eventType,
      event.payload,
      this.dashboardUrl,
    );

    const signatureHeaders = buildSignatureHeaders(webhook.secret, body);

    try {
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...signatureHeaders,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });

      event.attempt += 1;

      if (response.ok) {
        event.status = 'delivered';
        event.deliveredAt = new Date();
        event.lastError = null;
      } else if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        const delayMs = retryAfter
          ? parseInt(retryAfter, 10) * 1000
          : this.getBackoffMs(event.attempt);
        this.scheduleRetryOrExhaust(event, `HTTP 429`, delayMs);
      } else {
        const errorText = await response.text().catch(() => '');
        this.scheduleRetryOrExhaust(
          event,
          `HTTP ${response.status}: ${errorText.slice(0, 200)}`,
        );
      }
    } catch (err: any) {
      event.attempt += 1;
      this.scheduleRetryOrExhaust(event, err.message ?? 'Unknown error');
    }

    await this.eventRepo.save(event);
  }

  private scheduleRetryOrExhaust(
    event: WebhookEvent,
    error: string,
    delayOverrideMs?: number,
  ) {
    event.lastError = error;
    if (event.attempt >= event.maxAttempts) {
      event.status = 'exhausted';
    } else {
      event.status = 'failed';
      const delay = delayOverrideMs ?? this.getBackoffMs(event.attempt);
      event.nextRetryAt = new Date(Date.now() + delay);
    }
  }

  private getBackoffMs(attempt: number): number {
    return RETRY_BACKOFF_MS[Math.min(attempt, RETRY_BACKOFF_MS.length - 1)];
  }
}

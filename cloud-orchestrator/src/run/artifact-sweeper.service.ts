import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ScenarioRun } from './scenario-run.entity';
import { StorageSettings } from '../storage/storage-settings.entity';

/**
 * ArtifactSweeperService — S3-aware TTL 기반 resultJson 정리
 *
 * S3 설정된 테넌트: 로컬 데이터는 이미 업로드되었으므로 공격적으로 정리
 *   - PASS: 1시간 후 삭제
 *   - FAIL: 24시간 후 삭제
 *
 * S3 미설정 테넌트: 로컬 데이터가 유일한 소스
 *   - PASS: 24시간 후 삭제
 *   - FAIL: 7일 후 삭제
 */
@Injectable()
export class ArtifactSweeperService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('ArtifactSweeper');
  private intervalHandle: NodeJS.Timeout | null = null;

  /** How often the sweep runs (1 hour) */
  private readonly TICK_MS = 60 * 60 * 1000;

  /** S3 configured: aggressive cleanup (already uploaded) */
  private readonly S3_PASS_TTL_MS = 1 * 60 * 60 * 1000;       // 1 hour
  private readonly S3_FAIL_TTL_MS = 24 * 60 * 60 * 1000;      // 24 hours

  /** No S3: data is only local */
  private readonly LOCAL_PASS_TTL_MS = 24 * 60 * 60 * 1000;   // 24 hours
  private readonly LOCAL_FAIL_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

  constructor(
    @InjectRepository(ScenarioRun)
    private scenarioRunRepo: Repository<ScenarioRun>,
    @InjectRepository(StorageSettings)
    private storageSettingsRepo: Repository<StorageSettings>,
  ) {}

  onModuleInit() {
    this.logger.log(`Artifact sweeper starting (tick every ${this.TICK_MS / 1000}s)`);
    this.intervalHandle = setInterval(() => this.sweep(), this.TICK_MS);
  }

  onModuleDestroy() {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    this.logger.log('Artifact sweeper stopped');
  }

  async sweep() {
    this.logger.log('Starting artifact sweep...');

    const now = Date.now();
    let totalCleared = 0;

    // 1. Find tenants with S3 configured
    const s3Settings = await this.storageSettingsRepo
      .createQueryBuilder('s')
      .select('s.tenant_id', 'tenantId')
      .where('s.s3_bucket IS NOT NULL')
      .getRawMany();
    const s3TenantIds: string[] = s3Settings.map((s: any) => s.tenantId);

    // 2. S3-configured tenants: aggressive cleanup
    if (s3TenantIds.length > 0) {
      const s3PassThreshold = new Date(now - this.S3_PASS_TTL_MS);
      const s3FailThreshold = new Date(now - this.S3_FAIL_TTL_MS);

      const s3PassCleared = await this.scenarioRunRepo
        .createQueryBuilder()
        .update()
        .set({ resultJson: () => 'NULL' })
        .where('status = :status', { status: 'passed' })
        .andWhere('result_json IS NOT NULL')
        .andWhere('completed_at < :threshold', { threshold: s3PassThreshold })
        .andWhere('tenant_id IN (:...tenantIds)', { tenantIds: s3TenantIds })
        .execute();

      const s3FailCleared = await this.scenarioRunRepo
        .createQueryBuilder()
        .update()
        .set({ resultJson: () => 'NULL' })
        .where('status IN (:...statuses)', { statuses: ['failed', 'infra_failed'] })
        .andWhere('result_json IS NOT NULL')
        .andWhere('completed_at < :threshold', { threshold: s3FailThreshold })
        .andWhere('tenant_id IN (:...tenantIds)', { tenantIds: s3TenantIds })
        .execute();

      const s3Total = (s3PassCleared.affected || 0) + (s3FailCleared.affected || 0);
      if (s3Total > 0) {
        this.logger.log(`S3 tenants: swept ${s3Total} artifacts (pass: ${s3PassCleared.affected}, fail: ${s3FailCleared.affected})`);
      }
      totalCleared += s3Total;
    }

    // 3. Non-S3 tenants: standard TTL
    const localPassThreshold = new Date(now - this.LOCAL_PASS_TTL_MS);
    const localFailThreshold = new Date(now - this.LOCAL_FAIL_TTL_MS);

    const passQuery = this.scenarioRunRepo
      .createQueryBuilder()
      .update()
      .set({ resultJson: () => 'NULL' })
      .where('status = :status', { status: 'passed' })
      .andWhere('result_json IS NOT NULL')
      .andWhere('completed_at < :threshold', { threshold: localPassThreshold });

    if (s3TenantIds.length > 0) {
      passQuery.andWhere('tenant_id NOT IN (:...s3TenantIds)', { s3TenantIds });
    }

    const localPassCleared = await passQuery.execute();

    const failQuery = this.scenarioRunRepo
      .createQueryBuilder()
      .update()
      .set({ resultJson: () => 'NULL' })
      .where('status IN (:...statuses)', { statuses: ['failed', 'infra_failed'] })
      .andWhere('result_json IS NOT NULL')
      .andWhere('completed_at < :threshold', { threshold: localFailThreshold });

    if (s3TenantIds.length > 0) {
      failQuery.andWhere('tenant_id NOT IN (:...s3TenantIds)', { s3TenantIds });
    }

    const localFailCleared = await failQuery.execute();

    const localTotal = (localPassCleared.affected || 0) + (localFailCleared.affected || 0);
    if (localTotal > 0) {
      this.logger.log(`Local tenants: swept ${localTotal} artifacts (pass: ${localPassCleared.affected}, fail: ${localFailCleared.affected})`);
    }
    totalCleared += localTotal;

    if (totalCleared > 0) {
      this.logger.log(`Artifact sweep complete: ${totalCleared} total cleared`);
    }
  }
}

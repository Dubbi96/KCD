import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { StorageSettings } from './storage-settings.entity';
import { ArtifactManifest } from './artifact-manifest.entity';
import * as fs from 'fs';
import * as path from 'path';

export interface ReportUploadResult {
  scenarioId: string;
  reportUrl: string;
  uploaded: boolean;
}

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
};

/**
 * StorageService — 테넌트별 S3 리포트 업로드 관리
 *
 * 각 테넌트는 자체 S3 설정 (bucket, region, prefix, 인증 정보)을 가질 수 있다.
 * 테넌트별 설정이 없으면 글로벌 환경 변수 (KATAB_S3_BUCKET 등)를 사용한다.
 * 둘 다 없으면 대시보드 URL로 폴백한다.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger('StorageService');
  private readonly dashboardUrl: string;
  private readonly storageMode: 'local' | 's3';
  private readonly localStoragePath: string;
  /** 테넌트별 S3 클라이언트 캐시 */
  private s3Clients = new Map<string, any>();

  constructor(
    @InjectRepository(StorageSettings)
    private settingsRepo: Repository<StorageSettings>,
    @InjectRepository(ArtifactManifest)
    private manifestRepo: Repository<ArtifactManifest>,
    private configService: ConfigService,
  ) {
    this.dashboardUrl = this.configService.get<string>(
      'DASHBOARD_URL',
      'http://localhost:4000',
    );
    this.storageMode = (this.configService.get<string>('STORAGE_MODE', 'local') as any);
    this.localStoragePath = this.configService.get<string>(
      'REPORT_STORAGE_PATH',
      path.resolve(process.cwd(), 'data/reports'),
    );

    if (this.storageMode === 'local') {
      this.logger.log(`Storage mode: local (path: ${this.localStoragePath})`);
    }
  }

  // ─── Settings CRUD ────────────────────────────────

  async getSettings(tenantId: string): Promise<StorageSettings | null> {
    return this.settingsRepo.findOne({ where: { tenantId } });
  }

  async upsertSettings(
    tenantId: string,
    dto: Partial<StorageSettings>,
  ): Promise<StorageSettings> {
    let settings = await this.settingsRepo.findOne({ where: { tenantId } });
    if (settings) {
      Object.assign(settings, dto);
    } else {
      settings = this.settingsRepo.create({ tenantId, ...dto });
    }
    // Clear cached S3 client for this tenant
    this.s3Clients.delete(tenantId);
    return this.settingsRepo.save(settings);
  }

  async deleteSettings(tenantId: string): Promise<void> {
    const settings = await this.settingsRepo.findOne({ where: { tenantId } });
    if (!settings) throw new NotFoundException('Storage settings not found');
    await this.settingsRepo.remove(settings);
    this.s3Clients.delete(tenantId);
  }

  // ─── Report Upload ────────────────────────────────

  /**
   * HTML 리포트를 S3에 업로드하고 공개 URL을 반환한다.
   */
  async uploadHtmlReport(
    tenantId: string,
    runId: string,
    htmlContent: string,
  ): Promise<string | null> {
    // Try local storage first
    if (this.storageMode === 'local') {
      return this.writeLocalReport(tenantId, runId, 'report.html', htmlContent);
    }

    const config = await this.resolveS3Config(tenantId);
    if (!config) {
      // Fallback to local storage when S3 not configured
      return this.writeLocalReport(tenantId, runId, 'report.html', htmlContent);
    }

    const s3Key = `${config.prefix}/${tenantId}/runs/${runId}/report.html`;
    try {
      await this.putObject(config, s3Key, Buffer.from(htmlContent, 'utf-8'), 'text/html; charset=utf-8');
      const url = this.buildPublicUrl(config, s3Key);
      this.logger.log(`Report uploaded: ${url}`);
      return url;
    } catch (err: any) {
      this.logger.error(`Failed to upload report for run ${runId}: ${err.message}`);
      return null;
    }
  }

  /**
   * JSON 리포트를 S3에 업로드하고 공개 URL을 반환한다.
   */
  async uploadJsonReport(
    tenantId: string,
    runId: string,
    jsonContent: string,
  ): Promise<string | null> {
    if (this.storageMode === 'local') {
      return this.writeLocalReport(tenantId, runId, 'report.json', jsonContent);
    }

    const config = await this.resolveS3Config(tenantId);
    if (!config) {
      return this.writeLocalReport(tenantId, runId, 'report.json', jsonContent);
    }

    const s3Key = `${config.prefix}/${tenantId}/runs/${runId}/report.json`;
    try {
      await this.putObject(config, s3Key, Buffer.from(jsonContent, 'utf-8'), 'application/json; charset=utf-8');
      return this.buildPublicUrl(config, s3Key);
    } catch (err: any) {
      this.logger.error(`Failed to upload JSON report for run ${runId}: ${err.message}`);
      return null;
    }
  }

  /**
   * S3 설정 여부를 확인한다.
   */
  async isConfigured(tenantId: string): Promise<boolean> {
    const config = await this.resolveS3Config(tenantId);
    return config !== null;
  }

  /**
   * 리포트 공개 URL을 생성한다 (S3 미설정 시 대시보드 URL).
   */
  buildReportUrl(tenantId: string, runId: string): string {
    return `/api/v1/runs/${runId}/report/html`;
  }

  // ─── Local Storage ──────────────────────────────────

  private writeLocalReport(
    tenantId: string,
    runId: string,
    filename: string,
    content: string,
  ): string | null {
    const dir = path.join(this.localStoragePath, tenantId, 'runs', runId);
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, filename), content, 'utf-8');
      const url = `/api/v1/reports/${tenantId}/runs/${runId}/${filename}`;
      this.logger.log(`Report saved locally: ${dir}/${filename}`);
      return url;
    } catch (err: any) {
      this.logger.error(`Failed to save local report: ${err.message}`);
      return null;
    }
  }

  /**
   * Read a locally stored report file.
   */
  readLocalReport(tenantId: string, runId: string, filename: string): string | null {
    const filePath = path.join(this.localStoragePath, tenantId, 'runs', runId, filename);
    try {
      return fs.readFileSync(filePath, 'utf-8');
    } catch {
      return null;
    }
  }

  // ─── Private ──────────────────────────────────────

  private async resolveS3Config(tenantId: string): Promise<{
    bucket: string;
    region: string;
    prefix: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    reportBaseUrl?: string;
  } | null> {
    // 1. 테넌트별 설정 확인
    const settings = await this.settingsRepo.findOne({ where: { tenantId } });
    if (settings?.s3Bucket) {
      return {
        bucket: settings.s3Bucket,
        region: settings.s3Region || 'ap-northeast-2',
        prefix: settings.s3Prefix || 'reports',
        accessKeyId: settings.s3AccessKeyId,
        secretAccessKey: settings.s3SecretAccessKey,
        reportBaseUrl: settings.reportBaseUrl,
      };
    }

    // 2. 글로벌 환경 변수 확인
    const bucket = this.configService.get<string>('KATAB_S3_BUCKET');
    if (bucket) {
      return {
        bucket,
        region: this.configService.get<string>('KATAB_S3_REGION', 'ap-northeast-2'),
        prefix: this.configService.get<string>('KATAB_S3_PREFIX', 'reports'),
        accessKeyId: this.configService.get<string>('AWS_ACCESS_KEY_ID'),
        secretAccessKey: this.configService.get<string>('AWS_SECRET_ACCESS_KEY'),
        reportBaseUrl: this.configService.get<string>('REPORT_BASE_URL'),
      };
    }

    return null;
  }

  private async getS3Client(config: {
    region: string;
    accessKeyId?: string;
    secretAccessKey?: string;
  }): Promise<any> {
    const cacheKey = `${config.region}:${config.accessKeyId || 'default'}`;
    if (this.s3Clients.has(cacheKey)) return this.s3Clients.get(cacheKey);

    const { S3Client } = await import('@aws-sdk/client-s3');
    const clientConfig: any = { region: config.region };
    if (config.accessKeyId && config.secretAccessKey) {
      clientConfig.credentials = {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      };
    }
    const client = new S3Client(clientConfig);
    this.s3Clients.set(cacheKey, client);
    return client;
  }

  private async putObject(
    config: { bucket: string; region: string; accessKeyId?: string; secretAccessKey?: string },
    key: string,
    body: Buffer,
    contentType: string,
  ): Promise<void> {
    const client = await this.getS3Client(config);
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');

    await client.send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        StorageClass: 'STANDARD_IA',
      }),
    );
  }

  private buildPublicUrl(
    config: { reportBaseUrl?: string; bucket: string; region: string; prefix: string },
    s3Key: string,
  ): string {
    if (config.reportBaseUrl) {
      // CloudFront origin_path가 /{prefix}이면 prefix 제거
      const pathAfterPrefix = s3Key.startsWith(config.prefix + '/')
        ? s3Key.slice(config.prefix.length + 1)
        : s3Key;
      return `${config.reportBaseUrl.replace(/\/+$/, '')}/${pathAfterPrefix}`;
    }
    return `https://${config.bucket}.s3.${config.region}.amazonaws.com/${s3Key}`;
  }

  // ─── Artifact Manifest ─────────────────────────────

  async recordArtifact(params: {
    tenantId: string;
    runId: string;
    scenarioRunId?: string;
    stepId?: string;
    sessionId?: string;
    artifactType: ArtifactManifest['artifactType'];
    path: string;
    url?: string;
    storageBackend: 'local' | 's3';
    sizeBytes?: number;
    contentType?: string;
  }): Promise<ArtifactManifest> {
    const manifest = this.manifestRepo.create(params);
    return this.manifestRepo.save(manifest);
  }

  async getArtifactsByRun(runId: string): Promise<ArtifactManifest[]> {
    return this.manifestRepo.find({
      where: { runId },
      order: { createdAt: 'ASC' },
    });
  }

  async getArtifactsByScenarioRun(scenarioRunId: string): Promise<ArtifactManifest[]> {
    return this.manifestRepo.find({
      where: { scenarioRunId },
      order: { createdAt: 'ASC' },
    });
  }
}

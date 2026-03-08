import { Controller, Get, Put, Delete, Body, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { StorageService } from './storage.service';

@ApiTags('Storage')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('storage/settings')
export class StorageController {
  constructor(private storageService: StorageService) {}

  @Get()
  @ApiOperation({ summary: 'Get tenant storage settings' })
  async getSettings(@Req() req: any) {
    const settings = await this.storageService.getSettings(req.user.tenantId);
    if (!settings) return { configured: false };
    // Mask secret key
    return {
      configured: true,
      s3Bucket: settings.s3Bucket,
      s3Region: settings.s3Region,
      s3Prefix: settings.s3Prefix,
      s3AccessKeyId: settings.s3AccessKeyId
        ? `${settings.s3AccessKeyId.slice(0, 8)}****`
        : null,
      reportBaseUrl: settings.reportBaseUrl,
    };
  }

  @Put()
  @ApiOperation({ summary: 'Update tenant storage settings (S3 config)' })
  async updateSettings(
    @Req() req: any,
    @Body() body: {
      s3Bucket?: string;
      s3Region?: string;
      s3Prefix?: string;
      s3AccessKeyId?: string;
      s3SecretAccessKey?: string;
      reportBaseUrl?: string;
    },
  ) {
    const settings = await this.storageService.upsertSettings(
      req.user.tenantId,
      body,
    );
    return {
      configured: !!settings.s3Bucket,
      s3Bucket: settings.s3Bucket,
      s3Region: settings.s3Region,
      s3Prefix: settings.s3Prefix,
      reportBaseUrl: settings.reportBaseUrl,
    };
  }

  @Delete()
  @ApiOperation({ summary: 'Delete tenant storage settings' })
  async deleteSettings(@Req() req: any) {
    await this.storageService.deleteSettings(req.user.tenantId);
    return { ok: true };
  }
}

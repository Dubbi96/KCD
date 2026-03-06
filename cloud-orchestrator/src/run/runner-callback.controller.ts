import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { RunService } from './run.service';
import { AccountService } from '../account/account.service';
import { ScenarioService } from '../scenario/scenario.service';
import { AuthProfileService } from '../auth-profile/auth-profile.service';
import { DeviceService } from '../device/device.service';

/**
 * Callback endpoints for Local Runner to report status.
 * Uses Runner API token (not JWT) for authentication.
 */
@ApiTags('Runner Callbacks')
@Controller('runner')
export class RunnerCallbackController {
  constructor(
    private runService: RunService,
    private accountService: AccountService,
    private scenarioService: ScenarioService,
    private authProfileService: AuthProfileService,
    private deviceService: DeviceService,
  ) {}

  private async validateToken(token: string) {
    if (!token) throw new UnauthorizedException('Missing X-Runner-Token');
    const runner = await this.accountService.findRunnerByToken(token);
    if (!runner) throw new UnauthorizedException('Invalid runner token');
    return runner;
  }

  @Get('me')
  @ApiOperation({ summary: 'Get runner + tenant info by token' })
  async getRunnerInfo(@Headers('x-runner-token') token: string) {
    const runner = await this.validateToken(token);
    const tenant = await this.accountService.getTenant(runner.tenantId);
    return {
      runnerId: runner.id,
      runnerName: runner.name,
      tenantId: runner.tenantId,
      tenantName: tenant.name,
    };
  }

  @Get('runners')
  @ApiOperation({ summary: 'List all runners in this tenant' })
  async listRunners(@Headers('x-runner-token') token: string) {
    const runner = await this.validateToken(token);
    const runners = await this.accountService.listRunners(runner.tenantId);
    return runners.map((r) => ({
      id: r.id,
      name: r.name,
      status: r.status,
      lastHeartbeatAt: r.lastHeartbeatAt,
      createdAt: r.createdAt,
    }));
  }

  @Get('runs')
  @ApiOperation({ summary: 'List recent runs for this tenant' })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'offset', required: false })
  async listRuns(
    @Headers('x-runner-token') token: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    const runner = await this.validateToken(token);
    return this.runService.listRuns(runner.tenantId, limit || 20, offset || 0);
  }

  @Get('queue-stats')
  @ApiOperation({ summary: 'Queue stats for this tenant' })
  async queueStats(@Headers('x-runner-token') token: string) {
    const runner = await this.validateToken(token);
    return this.runService.getQueueStats(runner.tenantId);
  }

  @Post('scenario-runs/:id/started')
  @ApiOperation({ summary: 'Runner reports scenario run started' })
  async reportStarted(
    @Param('id') scenarioRunId: string,
    @Headers('x-runner-token') token: string,
  ) {
    const runner = await this.validateToken(token);
    return this.runService.updateScenarioRunStatus(scenarioRunId, 'running', undefined, runner.tenantId);
  }

  @Post('scenario-runs/:id/completed')
  @ApiOperation({ summary: 'Runner reports scenario run result' })
  async reportCompleted(
    @Param('id') scenarioRunId: string,
    @Headers('x-runner-token') token: string,
    @Body()
    body: {
      status: 'passed' | 'failed' | 'infra_failed';
      durationMs?: number;
      error?: string;
      resultJson?: any;
    },
  ) {
    const runner = await this.validateToken(token);
    return this.runService.updateScenarioRunStatus(scenarioRunId, body.status, {
      durationMs: body.durationMs,
      error: body.error,
      resultJson: body.resultJson,
    }, runner.tenantId);
  }

  @Post('heartbeat')
  @ApiOperation({ summary: 'Runner sends heartbeat — syncs device inventory' })
  async heartbeat(
    @Headers('x-runner-token') token: string,
    @Body() body: {
      status: 'online' | 'offline' | 'busy';
      devices?: any[];
      activeSessions?: number;
      localApiPort?: number;
      localApiHost?: string;
    },
  ) {
    const runner = await this.validateToken(token);
    await this.accountService.updateRunnerHeartbeat(runner.id, body.status, {
      devices: body.devices,
      activeSessions: body.activeSessions,
      localApiPort: body.localApiPort,
      localApiHost: body.localApiHost,
    });

    // Sync devices into the device resource pool
    await this.deviceService.syncDevicesFromHeartbeat(
      runner.id,
      runner.tenantId,
      runner.platform,
      body.devices || [],
    );

    // If runner went offline, mark its devices offline
    if (body.status === 'offline') {
      await this.deviceService.markRunnerDevicesOffline(runner.id);
    }

    return { ok: true, runnerId: runner.id };
  }

  @Get('scenarios/:id')
  @ApiOperation({ summary: 'Download scenario data for execution' })
  async downloadScenario(
    @Param('id') scenarioId: string,
    @Headers('x-runner-token') token: string,
  ) {
    const runner = await this.validateToken(token);
    return this.scenarioService.findOne(runner.tenantId, scenarioId);
  }

  @Get('auth-profiles/:id')
  @ApiOperation({ summary: 'Download auth profile for execution' })
  async downloadAuthProfile(
    @Param('id') authProfileId: string,
    @Headers('x-runner-token') token: string,
  ) {
    const runner = await this.validateToken(token);
    return this.authProfileService.findOne(runner.tenantId, authProfileId);
  }
}

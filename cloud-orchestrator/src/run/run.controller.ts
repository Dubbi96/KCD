import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { Response } from 'express';
import { RunService } from './run.service';
import { ReportService } from './report.service';
import { ControlPlaneService } from '../control-plane/control-plane.service';
import { CreateRunDto } from './dto/create-run.dto';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';

@ApiTags('Runs')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('runs')
export class RunController {
  constructor(
    private runService: RunService,
    private reportService: ReportService,
    private controlPlane: ControlPlaneService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new test run and enqueue to runner' })
  createRun(@CurrentUser() user: JwtPayload, @Body() dto: CreateRunDto) {
    return this.runService.createRun(user.tenantId, dto, user.sub);
  }

  @Get()
  @ApiOperation({ summary: 'List runs with pagination' })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'offset', required: false })
  listRuns(
    @CurrentUser() user: JwtPayload,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    return this.runService.listRuns(user.tenantId, limit || 20, offset || 0);
  }

  @Get('queue-stats')
  @ApiOperation({ summary: 'Get queue statistics per platform' })
  queueStats(@CurrentUser() user: JwtPayload) {
    return this.runService.getQueueStats(user.tenantId);
  }

  @Get('jobs/:runId')
  @ApiOperation({ summary: 'List KCP jobs for a run' })
  async getJobsByRun(
    @CurrentUser() _user: JwtPayload,
    @Param('runId') runId: string,
  ) {
    return this.controlPlane.getJobsByRun(runId);
  }

  @Delete('jobs/:jobId')
  @ApiOperation({ summary: 'Cancel a KCP job' })
  async cancelJob(
    @CurrentUser() _user: JwtPayload,
    @Param('jobId') jobId: string,
  ) {
    await this.controlPlane.cancelJob(jobId);
    return { ok: true };
  }

  @Get(':id/report/json')
  @ApiOperation({ summary: 'Generate JSON report for a run' })
  getJsonReport(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.reportService.generateJsonReport(user.tenantId, id);
  }

  @Get(':id/report/html')
  @ApiOperation({ summary: 'Generate HTML report for a run' })
  async getHtmlReport(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const html = await this.reportService.generateHtmlReport(user.tenantId, id);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get run detail with scenario runs' })
  getRunDetail(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.runService.getRunDetail(user.tenantId, id);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel a queued/running run' })
  cancelRun(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.runService.cancelRun(user.tenantId, id);
  }

  @Post(':id/pause')
  @ApiOperation({ summary: 'Pause a running/queued run and all its scenario runs' })
  pauseRun(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.runService.pauseRun(user.tenantId, id);
  }

  @Post(':id/resume')
  @ApiOperation({ summary: 'Resume a paused run and re-enqueue its scenario runs' })
  resumeRun(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.runService.resumeRun(user.tenantId, id);
  }

  @Post('scenario-runs/:id/pause')
  @ApiOperation({ summary: 'Pause a single scenario run' })
  pauseScenarioRun(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.runService.pauseScenarioRun(user.tenantId, id);
  }

  @Post('scenario-runs/:id/resume')
  @ApiOperation({ summary: 'Resume a single paused scenario run' })
  resumeScenarioRun(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.runService.resumeScenarioRun(user.tenantId, id);
  }
}

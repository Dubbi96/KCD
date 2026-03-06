import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { StreamService } from './stream.service';
import { RunService } from '../run/run.service';
import { GroupService } from '../group/group.service';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';

@ApiTags('Streams')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('streams')
export class StreamController {
  constructor(
    private service: StreamService,
    private runService: RunService,
    private groupService: GroupService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create stream' })
  create(@CurrentUser() user: JwtPayload, @Body() body: any) {
    return this.service.create(user.tenantId, body);
  }

  @Get()
  @ApiOperation({ summary: 'List streams' })
  findAll(@CurrentUser() user: JwtPayload) {
    return this.service.findAll(user.tenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get stream with items' })
  findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.service.findOne(user.tenantId, id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update stream' })
  update(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() body: any) {
    return this.service.update(user.tenantId, id, body);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete stream' })
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.service.remove(user.tenantId, id);
  }

  @Post(':id/run')
  @ApiOperation({ summary: 'Execute stream — resolve items to scenarios and create a run' })
  async runStream(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { platform?: 'web' | 'ios' | 'android'; runnerId?: string },
  ) {
    const stream = await this.service.findOne(user.tenantId, id);
    if (!stream.items?.length) {
      return { error: 'Stream has no items' };
    }

    // Resolve items to scenario IDs (expand groups to their scenario lists)
    const scenarioIds: string[] = [];
    for (const item of stream.items) {
      if (item.type === 'SCENARIO') {
        scenarioIds.push(item.refId);
      } else if (item.type === 'GROUP') {
        const group = await this.groupService.findOne(user.tenantId, item.refId);
        scenarioIds.push(...(group.scenarioIds || []));
      }
    }

    if (!scenarioIds.length) {
      return { error: 'Stream resolved to no scenarios' };
    }

    return this.runService.createRun(user.tenantId, {
      scenarioIds,
      mode: 'stream',
      platform: body.platform || 'web',
      options: {},
      runnerId: body.runnerId,
    });
  }
}

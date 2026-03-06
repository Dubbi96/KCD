import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { GroupService } from './group.service';
import { RunService } from '../run/run.service';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';

@ApiTags('Groups')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('groups')
export class GroupController {
  constructor(
    private service: GroupService,
    private runService: RunService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create group' })
  create(@CurrentUser() user: JwtPayload, @Body() body: any) {
    return this.service.create(user.tenantId, body);
  }

  @Get()
  @ApiOperation({ summary: 'List groups' })
  findAll(@CurrentUser() user: JwtPayload) {
    return this.service.findAll(user.tenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get group detail' })
  findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.service.findOne(user.tenantId, id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update group' })
  update(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() body: any) {
    return this.service.update(user.tenantId, id, body);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete group' })
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.service.remove(user.tenantId, id);
  }

  @Post(':id/run')
  @ApiOperation({ summary: 'Execute all scenarios in this group' })
  async runGroup(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { platform?: 'web' | 'ios' | 'android'; runnerId?: string },
  ) {
    const group = await this.service.findOne(user.tenantId, id);
    if (!group.scenarioIds?.length) {
      return { error: 'Group has no scenarios' };
    }
    return this.runService.createRun(user.tenantId, {
      scenarioIds: group.scenarioIds,
      mode: group.mode === 'single' ? 'single' : group.mode as any,
      platform: body.platform || 'web',
      options: group.options || {},
      runnerId: body.runnerId,
    });
  }
}

import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ScheduleService } from './schedule.service';
import { CreateScheduleDto, CronPreviewDto } from './dto/create-schedule.dto';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';

@ApiTags('Schedules')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('schedules')
export class ScheduleController {
  constructor(private scheduleService: ScheduleService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new schedule (CRON/AT/AFTER)' })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateScheduleDto) {
    return this.scheduleService.create(user.tenantId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all schedules' })
  findAll(@CurrentUser() user: JwtPayload) {
    return this.scheduleService.findAll(user.tenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get schedule detail' })
  findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.scheduleService.findOne(user.tenantId, id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a schedule' })
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: Partial<CreateScheduleDto>,
  ) {
    return this.scheduleService.update(user.tenantId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a schedule' })
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.scheduleService.remove(user.tenantId, id);
  }

  @Get(':id/planned-runs')
  @ApiOperation({ summary: 'List planned runs for a schedule' })
  getPlannedRuns(
    @CurrentUser() user: JwtPayload,
    @Param('id') scheduleId: string,
  ) {
    return this.scheduleService.getPlannedRuns(user.tenantId, scheduleId);
  }

  @Post('cron-preview')
  @ApiOperation({ summary: 'Preview next N cron execution times' })
  cronPreview(@Body() dto: CronPreviewDto) {
    return this.scheduleService.cronPreview(dto);
  }

  @Post(':id/run-now')
  @ApiOperation({ summary: 'Execute schedule immediately (one-shot)' })
  runNow(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.scheduleService.runNow(user.tenantId, id);
  }
}

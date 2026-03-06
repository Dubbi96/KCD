import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { DeviceService } from './device.service';
import { ScenarioService } from '../scenario/scenario.service';
import { CreateDeviceSessionDto } from './dto/create-session.dto';
import { CreateWebSessionDto } from './dto/create-web-session.dto';

@ApiTags('Devices')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('devices')
export class DeviceController {
  constructor(
    private deviceService: DeviceService,
    private scenarioService: ScenarioService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List all registered devices in the resource pool' })
  async listDevices(@Request() req: any) {
    return this.deviceService.listDevices(req.user.tenantId);
  }

  @Get('sessions')
  @ApiOperation({ summary: 'List device sessions' })
  async listSessions(@Request() req: any) {
    return this.deviceService.listSessions(req.user.tenantId);
  }

  @Post('web-session')
  @ApiOperation({ summary: 'Start a web recording session (no device needed)' })
  async createWebSession(@Request() req: any, @Body() dto: CreateWebSessionDto) {
    return this.deviceService.startWebSession(req.user.tenantId, req.user.id, dto);
  }

  @Post('sessions')
  @ApiOperation({ summary: 'Borrow a device and create a mirror/recording session' })
  async createSession(@Request() req: any, @Body() dto: CreateDeviceSessionDto) {
    return this.deviceService.borrowDevice(req.user.tenantId, req.user.id, dto);
  }

  @Get('sessions/:id')
  @ApiOperation({ summary: 'Get session details' })
  async getSession(@Request() req: any, @Param('id') id: string) {
    return this.deviceService.getSession(req.user.tenantId, id);
  }

  @Delete('sessions/:id')
  @ApiOperation({ summary: 'Return device — close session and release back to pool' })
  async closeSession(@Request() req: any, @Param('id') id: string) {
    return this.deviceService.returnDevice(req.user.tenantId, id);
  }

  @Post('sessions/:id/save-recording')
  @ApiOperation({ summary: 'Save a recording session as a scenario' })
  async saveRecording(
    @Request() req: any,
    @Param('id') sessionId: string,
    @Body() body: { events: any[]; name?: string; tags?: string[] },
  ) {
    const scenarioData = await this.deviceService.saveRecording(
      req.user.tenantId,
      sessionId,
      body.events,
      body.name,
    );

    const session = await this.deviceService.getSession(req.user.tenantId, sessionId);
    const scenario = await this.scenarioService.create(req.user.tenantId, {
      name: scenarioData.name,
      description: `Recorded via cloud mirror on ${session.platform} device ${session.deviceId.slice(0, 12)}`,
      platform: session.platform,
      scenarioData,
      tags: body.tags || ['recorded', session.platform],
    });

    return { scenario, eventCount: body.events.length };
  }
}

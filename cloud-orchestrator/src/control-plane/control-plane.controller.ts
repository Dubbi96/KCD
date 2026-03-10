import { Controller, Get, Post, Delete, Param, Query, Body, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { ControlPlaneService } from './control-plane.service';

/**
 * Proxy endpoints for customer-facing resource queries.
 * All resource state comes from KCP — KCD does not compute it.
 */
@ApiTags('Control Plane')
@Controller('control-plane')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth()
export class ControlPlaneController {
  constructor(private readonly cpService: ControlPlaneService) {}

  @Get('capacity')
  @ApiOperation({ summary: 'Available capacity by platform (customer view)' })
  async getCapacity(@Req() req: any) {
    const tenantId = req.user?.tenantId;
    const data = await this.cpService.getCapacity(tenantId);
    return data || { error: 'Control Plane unavailable', capacity: {} };
  }

  @Get('pool')
  @ApiOperation({ summary: 'Full cluster pool overview (admin view)' })
  async getPoolOverview() {
    const data = await this.cpService.getPoolOverview();
    return data || { error: 'Control Plane unavailable' };
  }

  @Get('nodes')
  @ApiOperation({ summary: 'List all registered nodes' })
  async getNodes() {
    const data = await this.cpService.getNodes();
    return data || [];
  }

  @Get('nodes/:id')
  @ApiOperation({ summary: 'Get node details' })
  async getNodeDetail(@Param('id') id: string) {
    const data = await this.cpService.getNodeDetail(id);
    return data || { error: 'Node not found or Control Plane unavailable' };
  }

  @Post('nodes/:id/drain')
  @ApiOperation({ summary: 'Initiate graceful drain on a node' })
  async drainNode(@Param('id') id: string) {
    const data = await this.cpService.drainNode(id);
    return data || { error: 'Drain request failed' };
  }

  @Get('devices')
  @ApiOperation({ summary: 'List devices with health info from KCP' })
  async getDevices(@Query('platform') platform?: string, @Query('status') status?: string) {
    return this.cpService.getDevices({ platform, status });
  }

  @Get('devices/:id')
  @ApiOperation({ summary: 'Device detail with health info' })
  async getDeviceHealth(@Param('id') id: string) {
    return this.cpService.getDeviceHealth(id);
  }

  @Post('devices/:id/quarantine')
  @ApiOperation({ summary: 'Quarantine a device' })
  async quarantineDevice(
    @Param('id') id: string,
    @Body() body: { durationMinutes?: number; reason?: string },
  ) {
    return this.cpService.quarantineDevice(id, body.durationMinutes, body.reason);
  }

  @Delete('devices/:id/quarantine')
  @ApiOperation({ summary: 'Remove device from quarantine' })
  async unquarantineDevice(@Param('id') id: string) {
    return this.cpService.unquarantineDevice(id);
  }

  @Get('capacity/forecast')
  @ApiOperation({ summary: 'Capacity forecast for a platform' })
  async getCapacityForecast(@Query('platform') platform: string) {
    return this.cpService.getCapacityForecast(platform);
  }

  @Get('job-stats')
  @ApiOperation({ summary: 'Job statistics by platform/status' })
  async getJobStats() {
    return this.cpService.getJobStats();
  }
}

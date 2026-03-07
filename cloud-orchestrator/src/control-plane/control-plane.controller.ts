import { Controller, Get, Post, Param, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { ControlPlaneService } from './control-plane.service';

/**
 * Proxy endpoints for customer-facing resource queries.
 * All resource state comes from KCP — KCD does not compute it.
 */
@ApiTags('Control Plane')
@Controller('v1/control-plane')
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
}

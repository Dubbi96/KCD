import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AccountService } from './account.service';
import { CreateRunnerDto } from './dto/create-runner.dto';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { TenantGuard } from '../common/guards/tenant.guard';

@ApiTags('Account')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), TenantGuard)
@Controller('account')
export class AccountController {
  constructor(private accountService: AccountService) {}

  @Get('tenant')
  @ApiOperation({ summary: 'Get current tenant info' })
  getTenant(@CurrentUser() user: JwtPayload) {
    return this.accountService.getTenant(user.tenantId);
  }

  @Get('members')
  @ApiOperation({ summary: 'List tenant members' })
  getMembers(@CurrentUser() user: JwtPayload) {
    return this.accountService.getTenantMembers(user.tenantId);
  }

  @Post('runners')
  @ApiOperation({ summary: 'Register a runner (deploy KRC on target machine)' })
  createRunner(@CurrentUser() user: JwtPayload, @Body() dto: CreateRunnerDto) {
    return this.accountService.createRunner(user.tenantId, dto);
  }

  @Get('runners')
  @ApiOperation({ summary: 'List all runners with heartbeat status' })
  listRunners(@CurrentUser() user: JwtPayload) {
    return this.accountService.listRunners(user.tenantId);
  }

  @Delete('runners/:runnerId')
  @ApiOperation({ summary: 'Delete a runner registration' })
  deleteRunner(
    @CurrentUser() user: JwtPayload,
    @Param('runnerId') runnerId: string,
  ) {
    return this.accountService.deleteRunner(user.tenantId, runnerId);
  }

  @Post('runners/:runnerId/start')
  @ApiOperation({ summary: 'Get instructions to start KRC node agent' })
  startRunner(
    @CurrentUser() user: JwtPayload,
    @Param('runnerId') runnerId: string,
  ) {
    return this.accountService.startRunner(user.tenantId, runnerId);
  }

  @Post('runners/:runnerId/stop')
  @ApiOperation({ summary: 'Mark runner as offline' })
  stopRunner(
    @CurrentUser() user: JwtPayload,
    @Param('runnerId') runnerId: string,
  ) {
    return this.accountService.stopRunner(user.tenantId, runnerId);
  }

  @Post('runners/:runnerId/restart')
  @ApiOperation({ summary: 'Get instructions to restart KRC node agent' })
  restartRunner(
    @CurrentUser() user: JwtPayload,
    @Param('runnerId') runnerId: string,
  ) {
    return this.accountService.restartRunner(user.tenantId, runnerId);
  }

  @Get('runners/processes')
  @ApiOperation({ summary: 'Get runner node status (KCP mode)' })
  getProcessStatus() {
    return this.accountService.getRunnerProcessStatus();
  }

  @Get('config')
  @ApiOperation({ summary: 'Get server configuration (runner mode, etc.)' })
  getConfig() {
    return {
      runnerManagementMode: process.env.RUNNER_MANAGEMENT_MODE || 'external',
    };
  }
}

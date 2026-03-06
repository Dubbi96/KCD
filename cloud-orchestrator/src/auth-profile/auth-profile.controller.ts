import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AuthProfileService } from './auth-profile.service';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { CreateAuthProfileDto, UpdateAuthProfileDto } from './dto/create-auth-profile.dto';

@ApiTags('Auth Profiles')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('auth-profiles')
export class AuthProfileController {
  constructor(private service: AuthProfileService) {}

  @Post()
  @ApiOperation({ summary: 'Create auth profile' })
  create(@CurrentUser() user: JwtPayload, @Body() body: CreateAuthProfileDto) {
    return this.service.create(user.tenantId, body);
  }

  @Get()
  @ApiOperation({ summary: 'List auth profiles' })
  findAll(@CurrentUser() user: JwtPayload) {
    return this.service.findAll(user.tenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get auth profile with full data' })
  findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.service.findOne(user.tenantId, id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update auth profile' })
  update(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() body: UpdateAuthProfileDto) {
    return this.service.update(user.tenantId, id, body);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete auth profile' })
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.service.remove(user.tenantId, id);
  }
}

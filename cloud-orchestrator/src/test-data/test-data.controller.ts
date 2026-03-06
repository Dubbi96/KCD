import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { TestDataService } from './test-data.service';
import { CreateTestDataProfileDto, UpdateTestDataProfileDto } from './dto/create-test-data-profile.dto';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';

@ApiTags('Test Data')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('test-data')
export class TestDataController {
  constructor(private service: TestDataService) {}

  @Post()
  @ApiOperation({ summary: 'Create test data profile' })
  create(@CurrentUser() user: JwtPayload, @Body() body: CreateTestDataProfileDto) {
    return this.service.create(user.tenantId, body);
  }

  @Get()
  @ApiOperation({ summary: 'List test data profiles' })
  findAll(@CurrentUser() user: JwtPayload) {
    return this.service.findAll(user.tenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get test data profile with full data' })
  findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.service.findOne(user.tenantId, id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update test data profile' })
  update(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() body: UpdateTestDataProfileDto) {
    return this.service.update(user.tenantId, id, body);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete test data profile' })
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.service.remove(user.tenantId, id);
  }
}

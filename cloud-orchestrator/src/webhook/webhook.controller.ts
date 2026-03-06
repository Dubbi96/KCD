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
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { WebhookService } from './webhook.service';
import { CreateWebhookDto } from './dto/create-webhook.dto';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';

@ApiTags('Webhooks')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('webhooks')
export class WebhookController {
  constructor(private webhookService: WebhookService) {}

  @Post()
  @ApiOperation({ summary: 'Create a webhook' })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateWebhookDto) {
    return this.webhookService.create(user.tenantId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List webhooks' })
  findAll(@CurrentUser() user: JwtPayload) {
    return this.webhookService.findAll(user.tenantId);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a webhook' })
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: Partial<CreateWebhookDto>,
  ) {
    return this.webhookService.update(user.tenantId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a webhook' })
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.webhookService.remove(user.tenantId, id);
  }

  @Post(':id/test')
  @ApiOperation({ summary: 'Send a test event to a webhook' })
  sendTestEvent(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.webhookService.sendTestEvent(user.tenantId, id);
  }

  @Get(':id/events')
  @ApiOperation({ summary: 'List webhook delivery events with stats' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findEvents(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.webhookService.findEvents(user.tenantId, id, page, limit);
  }
}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { Webhook } from './webhook.entity';
import { WebhookEvent } from './webhook-event.entity';
import { WebhookService } from './webhook.service';
import { WebhookController } from './webhook.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Webhook, WebhookEvent]),
    ConfigModule,
  ],
  providers: [WebhookService],
  controllers: [WebhookController],
  exports: [WebhookService],
})
export class WebhookModule {}

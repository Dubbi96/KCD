import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Run } from './run.entity';
import { ScenarioRun } from './scenario-run.entity';
import { RunService } from './run.service';
import { RunQueueService } from './run-queue.service';
import { ReportService } from './report.service';
import { RunController } from './run.controller';
import { RunnerCallbackController } from './runner-callback.controller';
import { ArtifactSweeperService } from './artifact-sweeper.service';
import { AccountModule } from '../account/account.module';
import { ScenarioModule } from '../scenario/scenario.module';
import { AuthProfileModule } from '../auth-profile/auth-profile.module';
import { DeviceModule } from '../device/device.module';
import { WebhookModule } from '../webhook/webhook.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Run, ScenarioRun]),
    ConfigModule,
    AccountModule,
    ScenarioModule,
    AuthProfileModule,
    DeviceModule,
    WebhookModule,
  ],
  providers: [
    RunService,
    ReportService,
    ArtifactSweeperService,
    {
      provide: RunQueueService,
      useFactory: (config: ConfigService) => new RunQueueService(config),
      inject: [ConfigService],
    },
  ],
  controllers: [RunController, RunnerCallbackController],
  exports: [RunService, RunQueueService],
})
export class RunModule {}

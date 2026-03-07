import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
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
import { ControlPlaneModule } from '../control-plane/control-plane.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Run, ScenarioRun]),
    AccountModule,
    ScenarioModule,
    AuthProfileModule,
    DeviceModule,
    WebhookModule,
    ControlPlaneModule,
  ],
  providers: [
    RunService,
    ReportService,
    ArtifactSweeperService,
    RunQueueService,
  ],
  controllers: [RunController, RunnerCallbackController],
  exports: [RunService, RunQueueService],
})
export class RunModule {}

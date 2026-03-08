import { Module, forwardRef } from '@nestjs/common';
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
import { StreamModule } from '../stream/stream.module';
import { GroupModule } from '../group/group.module';
import { ScheduleModule } from '../schedule/schedule.module';
import { StorageModule } from '../storage/storage.module';
import { Scenario } from '../scenario/scenario.entity';
import { StorageSettings } from '../storage/storage-settings.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Run, ScenarioRun, Scenario, StorageSettings]),
    AccountModule,
    ScenarioModule,
    AuthProfileModule,
    DeviceModule,
    WebhookModule,
    ControlPlaneModule,
    forwardRef(() => StreamModule),
    forwardRef(() => GroupModule),
    forwardRef(() => ScheduleModule),
    StorageModule,
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

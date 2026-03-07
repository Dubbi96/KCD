import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Device } from './device.entity';
import { DeviceSession } from './device-session.entity';
import { Runner } from '../account/runner.entity';
import { DeviceService } from './device.service';
import { DeviceController } from './device.controller';
import { DeviceGateway } from './device.gateway';
import { ScenarioModule } from '../scenario/scenario.module';
import { AuthModule } from '../auth/auth.module';
import { ControlPlaneModule } from '../control-plane/control-plane.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Device, DeviceSession, Runner]),
    ScenarioModule,
    AuthModule, // JwtModule needed for WebSocket auth in DeviceGateway
    ControlPlaneModule,
  ],
  controllers: [DeviceController],
  providers: [DeviceService, DeviceGateway],
  exports: [DeviceService],
})
export class DeviceModule {}

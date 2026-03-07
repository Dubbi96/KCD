import { Module } from '@nestjs/common';
import { ControlPlaneService } from './control-plane.service';
import { ControlPlaneController } from './control-plane.controller';

@Module({
  controllers: [ControlPlaneController],
  providers: [ControlPlaneService],
  exports: [ControlPlaneService],
})
export class ControlPlaneModule {}

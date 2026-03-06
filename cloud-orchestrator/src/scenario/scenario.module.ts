import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Scenario } from './scenario.entity';
import { ScenarioService } from './scenario.service';
import { ScenarioController } from './scenario.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Scenario])],
  providers: [ScenarioService],
  controllers: [ScenarioController],
  exports: [ScenarioService],
})
export class ScenarioModule {}

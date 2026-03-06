import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Group } from './group.entity';
import { GroupService } from './group.service';
import { GroupController } from './group.controller';
import { RunModule } from '../run/run.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Group]),
    forwardRef(() => RunModule),
  ],
  controllers: [GroupController],
  providers: [GroupService],
  exports: [GroupService],
})
export class GroupModule {}

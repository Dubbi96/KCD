import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Stream } from './stream.entity';
import { StreamItem } from './stream-item.entity';
import { StreamService } from './stream.service';
import { StreamController } from './stream.controller';
import { RunModule } from '../run/run.module';
import { GroupModule } from '../group/group.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Stream, StreamItem]),
    forwardRef(() => RunModule),
    forwardRef(() => GroupModule),
  ],
  controllers: [StreamController],
  providers: [StreamService],
  exports: [StreamService],
})
export class StreamModule {}

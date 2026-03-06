import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TestDataProfile } from './test-data-profile.entity';
import { TestDataService } from './test-data.service';
import { TestDataController } from './test-data.controller';

@Module({
  imports: [TypeOrmModule.forFeature([TestDataProfile])],
  controllers: [TestDataController],
  providers: [TestDataService],
  exports: [TestDataService],
})
export class TestDataModule {}

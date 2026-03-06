import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { Tenant } from './tenant.entity';
import { User } from './user.entity';
import { Runner } from './runner.entity';
import { DeviceSession } from '../device/device-session.entity';
import { AccountService } from './account.service';
import { AccountController } from './account.controller';
import { RunnerProcessService } from './runner-process.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Tenant, User, Runner, DeviceSession]),
    ConfigModule,
  ],
  providers: [AccountService, RunnerProcessService],
  controllers: [AccountController],
  exports: [AccountService, RunnerProcessService, TypeOrmModule],
})
export class AccountModule {}

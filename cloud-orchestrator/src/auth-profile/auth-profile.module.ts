import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthProfile } from './auth-profile.entity';
import { AuthProfileService } from './auth-profile.service';
import { AuthProfileController } from './auth-profile.controller';

@Module({
  imports: [TypeOrmModule.forFeature([AuthProfile])],
  controllers: [AuthProfileController],
  providers: [AuthProfileService],
  exports: [AuthProfileService],
})
export class AuthProfileModule {}

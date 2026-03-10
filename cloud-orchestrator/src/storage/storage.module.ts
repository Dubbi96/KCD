import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { StorageSettings } from './storage-settings.entity';
import { ArtifactManifest } from './artifact-manifest.entity';
import { StorageService } from './storage.service';
import { StorageController } from './storage.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([StorageSettings, ArtifactManifest]),
    ConfigModule,
  ],
  providers: [StorageService],
  controllers: [StorageController],
  exports: [StorageService],
})
export class StorageModule {}

import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { AccountModule } from './account/account.module';
import { ScenarioModule } from './scenario/scenario.module';
import { ScheduleModule } from './schedule/schedule.module';
import { RunModule } from './run/run.module';
import { WebhookModule } from './webhook/webhook.module';
import { DeviceModule } from './device/device.module';
import { DatabaseModule } from './database/database.module';
import { AuthProfileModule } from './auth-profile/auth-profile.module';
import { FolderModule } from './folder/folder.module';
import { GroupModule } from './group/group.module';
import { StreamModule } from './stream/stream.module';
import { TestDataModule } from './test-data/test-data.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.local'],
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get('DB_HOST', 'localhost'),
        port: config.get<number>('DB_PORT', 5432),
        username: config.get('DB_USERNAME', 'katab'),
        password: config.get('DB_PASSWORD', 'katab_secret'),
        database: config.get('DB_DATABASE', 'katab_orchestrator'),
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        synchronize: false,
        logging: config.get('NODE_ENV') === 'development',
      }),
    }),
    DatabaseModule,
    AuthModule,
    AccountModule,
    ScenarioModule,
    ScheduleModule,
    RunModule,
    WebhookModule,
    DeviceModule,
    AuthProfileModule,
    FolderModule,
    GroupModule,
    StreamModule,
    TestDataModule,
  ],
})
export class AppModule {}

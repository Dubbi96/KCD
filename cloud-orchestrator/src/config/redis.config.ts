import { ConfigService } from '@nestjs/config';
import IORedis from 'ioredis';

export function createRedisConnection(config: ConfigService): IORedis {
  return new IORedis({
    host: config.get('REDIS_HOST', 'localhost'),
    port: config.get<number>('REDIS_PORT', 6379),
    password: config.get('REDIS_PASSWORD', undefined),
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
}

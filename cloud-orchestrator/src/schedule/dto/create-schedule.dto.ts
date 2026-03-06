import { IsString, IsOptional, IsIn, IsBoolean, IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateScheduleDto {
  @ApiProperty({ example: 'Daily Regression Test' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'Stream ID to execute', required: false })
  @IsOptional()
  @IsString()
  streamId?: string;

  @ApiProperty({ enum: ['CRON', 'AT', 'AFTER'], default: 'CRON' })
  @IsIn(['CRON', 'AT', 'AFTER'])
  type: 'CRON' | 'AT' | 'AFTER';

  @ApiProperty({ example: '0 9 * * 1-5', required: false })
  @IsOptional()
  @IsString()
  cronExpr?: string;

  @ApiProperty({ default: 'Asia/Seoul', required: false })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiProperty({ description: 'Unix timestamp for AT type', required: false })
  @IsOptional()
  @IsNumber()
  runAt?: number;

  @ApiProperty({ description: 'Delay in ms for AFTER type', required: false })
  @IsOptional()
  @IsNumber()
  delayMs?: number;

  @ApiProperty({ description: 'Stream ID to trigger after (AFTER type)', required: false })
  @IsOptional()
  @IsString()
  afterStreamId?: string;

  @ApiProperty({ enum: ['DONE', 'FAIL', 'ANY'], default: 'DONE', required: false })
  @IsOptional()
  @IsIn(['DONE', 'FAIL', 'ANY'])
  triggerOn?: 'DONE' | 'FAIL' | 'ANY';

  @ApiProperty({ enum: ['SKIP', 'QUEUE'], default: 'SKIP', required: false })
  @IsOptional()
  @IsIn(['SKIP', 'QUEUE'])
  overlapPolicy?: 'SKIP' | 'QUEUE';

  @ApiProperty({ enum: ['RUN_ALL', 'RUN_LATEST_ONLY', 'SKIP_ALL'], default: 'RUN_LATEST_ONLY', required: false })
  @IsOptional()
  @IsIn(['RUN_ALL', 'RUN_LATEST_ONLY', 'SKIP_ALL'])
  misfirePolicy?: 'RUN_ALL' | 'RUN_LATEST_ONLY' | 'SKIP_ALL';

  @ApiProperty({ default: true, required: false })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class CronPreviewDto {
  @ApiProperty({ example: '0 9 * * 1-5' })
  @IsString()
  cronExpr: string;

  @ApiProperty({ default: 5, required: false })
  @IsOptional()
  @IsNumber()
  count?: number;

  @ApiProperty({ default: 'Asia/Seoul', required: false })
  @IsOptional()
  @IsString()
  timezone?: string;
}

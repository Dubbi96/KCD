import { IsArray, IsString, IsOptional, IsIn, IsNumber, IsObject } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateRunDto {
  @ApiProperty({ type: [String], description: 'Scenario IDs to run' })
  @IsArray()
  @IsString({ each: true })
  scenarioIds: string[];

  @ApiProperty({ enum: ['single', 'batch', 'chain', 'stream'], default: 'batch' })
  @IsOptional()
  @IsIn(['single', 'batch', 'chain', 'stream'])
  mode?: 'single' | 'batch' | 'chain' | 'stream';

  @ApiProperty({ enum: ['web', 'ios', 'android'], default: 'web' })
  @IsIn(['web', 'ios', 'android'])
  platform: 'web' | 'ios' | 'android';

  @ApiProperty({ required: false })
  @IsOptional()
  @IsObject()
  options?: Record<string, any>;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  authProfileId?: string;

  @ApiProperty({ default: 1, required: false })
  @IsOptional()
  @IsNumber()
  concurrency?: number;

  @ApiProperty({ description: 'Target runner ID (optional)', required: false })
  @IsOptional()
  @IsString()
  runnerId?: string;
}

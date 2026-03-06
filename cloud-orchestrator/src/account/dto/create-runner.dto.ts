import { IsString, IsOptional, IsIn, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateRunnerDto {
  @ApiProperty({ example: 'My MacBook Runner' })
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiProperty({ enum: ['web', 'ios', 'android'], example: 'web' })
  @IsIn(['web', 'ios', 'android'])
  platform: 'web' | 'ios' | 'android';

  @ApiPropertyOptional()
  @IsOptional()
  metadata?: Record<string, any>;
}

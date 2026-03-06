import { IsString, IsOptional, IsObject, IsArray, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateScenarioDto {
  @ApiProperty({ example: 'Login Flow Test' })
  @IsString()
  name: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: ['web', 'ios', 'android'], default: 'web' })
  @IsOptional()
  @IsIn(['web', 'ios', 'android'])
  platform?: 'web' | 'ios' | 'android';

  @ApiProperty({ description: 'Full scenario JSON data (steps, events, etc.)' })
  @IsObject()
  scenarioData: Record<string, any>;

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  tags?: string[];

  @ApiProperty({ required: false, description: 'Folder ID to place scenario in' })
  @IsOptional()
  @IsString()
  folderId?: string;
}

export class UpdateScenarioDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsObject()
  scenarioData?: Record<string, any>;

  @IsOptional()
  @IsArray()
  tags?: string[];
}

import { IsString, IsOptional, IsObject, IsArray, MaxLength, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateAuthProfileDto {
  @ApiProperty({ example: 'Production Auth' })
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({ example: 'example.com' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  domain?: string;

  @ApiProperty({ description: 'Auth profile data (cookies, localStorage, etc.)' })
  @IsObject()
  profileData: {
    cookies?: any[];
    localStorage?: Record<string, string>;
    sessionStorage?: Record<string, string>;
    headers?: Record<string, string>;
  };

  @ApiPropertyOptional({ example: ['*.example.com'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  domainPatterns?: string[];
}

export class UpdateAuthProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  domain?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  profileData?: {
    cookies?: any[];
    localStorage?: Record<string, string>;
    sessionStorage?: Record<string, string>;
    headers?: Record<string, string>;
  };

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  domainPatterns?: string[];
}

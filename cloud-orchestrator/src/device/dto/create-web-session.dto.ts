import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsNumber, IsObject } from 'class-validator';

export class CreateWebSessionDto {
  @ApiProperty({ description: 'URL to open in the browser' })
  @IsString()
  @IsNotEmpty()
  url: string;

  @ApiPropertyOptional({ description: 'Screenshot FPS (default 2)', default: 2 })
  @IsOptional()
  @IsNumber()
  fps?: number;

  @ApiPropertyOptional({ description: 'Web device preset (e.g. desktop, iphone-14, pixel-7)' })
  @IsOptional()
  @IsString()
  deviceType?: string;

  @ApiPropertyOptional({ description: 'Recording configuration' })
  @IsOptional()
  @IsObject()
  recordingConfig?: {
    browser?: 'chromium' | 'firefox' | 'webkit';
    viewport?: { width: number; height: number };
    deviceType?: string;
    sessionName?: string;
    authProfileId?: string;
    baseURL?: string;
    controlOptions?: Record<string, any>;
  };
}

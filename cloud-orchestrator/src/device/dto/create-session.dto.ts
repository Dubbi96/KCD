import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsNumber, IsObject } from 'class-validator';

export class CreateDeviceSessionDto {
  @ApiProperty({ description: 'Device ID from the resource pool (UUID from devices table)' })
  @IsString()
  @IsNotEmpty()
  deviceId: string;

  @ApiPropertyOptional({ description: 'Runner ID (auto-resolved from device if omitted)' })
  @IsOptional()
  @IsString()
  runnerId?: string;

  @ApiPropertyOptional({ description: 'iOS bundle ID' })
  @IsOptional()
  @IsString()
  bundleId?: string;

  @ApiPropertyOptional({ description: 'Android package name' })
  @IsOptional()
  @IsString()
  appPackage?: string;

  @ApiPropertyOptional({ description: 'Android activity name' })
  @IsOptional()
  @IsString()
  appActivity?: string;

  @ApiPropertyOptional({ description: 'Web URL to open (required for web devices)' })
  @IsOptional()
  @IsString()
  url?: string;

  @ApiPropertyOptional({ description: 'Screenshot FPS (default 2)', default: 2 })
  @IsOptional()
  @IsNumber()
  fps?: number;

  @ApiPropertyOptional({ description: 'Web device preset (e.g. desktop, iphone-14, pixel-7)' })
  @IsOptional()
  @IsString()
  deviceType?: string;

  @ApiPropertyOptional({ description: 'Recording configuration matching Katab RecordingConfig' })
  @IsOptional()
  @IsObject()
  recordingConfig?: {
    browser?: 'chromium' | 'firefox' | 'webkit';
    viewport?: { width: number; height: number };
    deviceType?: string;
    sessionName?: string;
    authProfileId?: string;
    baseURL?: string;
    mirror?: boolean;
    mirrorPort?: number;
    controlOptions?: {
      tapPauseDuration?: number;
      tapReleaseDelay?: number;
      tapPostDelay?: number;
      swipePauseDuration?: number;
      swipeMinDuration?: number;
      swipeReleaseDelay?: number;
      swipePostDelay?: number;
      coordinateOrigin?: 'viewport' | 'pointer';
      coordinateOffset?: { x: number; y: number };
    };
  };
}

import { IsString, IsOptional, IsArray, IsBoolean, IsUrl } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateWebhookDto {
  @ApiProperty({ example: 'Slack Notification' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ example: 'https://hooks.slack.com/...' })
  @IsString()
  url: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  secret?: string;

  @ApiProperty({ type: [String], example: ['run.completed', 'run.failed'], required: false })
  @IsOptional()
  @IsArray()
  eventsFilter?: string[];

  @ApiProperty({
    enum: ['generic', 'discord', 'slack', 'teams'],
    default: 'generic',
    required: false,
  })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiProperty({ default: true, required: false })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

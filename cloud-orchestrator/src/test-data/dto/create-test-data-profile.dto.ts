import { IsString, IsOptional, IsArray, ValidateNested, IsNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class DataSetItemDto {
  @ApiProperty({ example: 'user1' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: { email: 'test1@example.com', password: 'pass1' } })
  @IsNotEmpty()
  data: Record<string, string>;
}

export class CreateTestDataProfileDto {
  @ApiProperty({ example: 'Login credentials' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: 'Test accounts for login scenario' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    type: [DataSetItemDto],
    example: [
      { name: 'user1', data: { email: 'test1@example.com', password: 'pass1' } },
      { name: 'user2', data: { email: 'test2@example.com', password: 'pass2' } },
    ],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DataSetItemDto)
  @IsOptional()
  dataSets?: DataSetItemDto[];
}

export class UpdateTestDataProfileDto {
  @ApiPropertyOptional({ example: 'Login credentials v2' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ example: 'Updated test accounts' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ type: [DataSetItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DataSetItemDto)
  @IsOptional()
  dataSets?: DataSetItemDto[];
}

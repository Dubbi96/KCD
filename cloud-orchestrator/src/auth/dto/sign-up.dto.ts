import { IsEmail, IsString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SignUpDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'password123' })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({ example: 'John Doe' })
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiProperty({ example: 'My Team', description: 'Tenant/Organization name' })
  @IsString()
  @MaxLength(255)
  tenantName: string;
}

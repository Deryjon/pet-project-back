import { IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  phone_number!: string;

  @IsString()
  @MinLength(1)
  password!: string;
}

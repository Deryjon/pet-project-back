import { IsString, MinLength } from 'class-validator';

export class UpdatePasswordDto {
  @IsString()
  @MinLength(1)
  current_password!: string;

  @IsString()
  @MinLength(1)
  new_password!: string;
}

import { IsIn, IsOptional, IsString } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  first_name?: string;

  @IsOptional()
  @IsString()
  last_name?: string;

  @IsOptional()
  @IsIn(['ru', 'uz', 'en'])
  language?: string;

  @IsOptional()
  @IsIn(['auto', 'light', 'dark'])
  theme?: string;
}

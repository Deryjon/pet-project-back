import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export class UpdatePlatformSettingsDto {
  @IsOptional()
  @IsIn(['ru', 'uz', 'en'])
  language?: string;

  @IsOptional()
  @IsIn(['Asia/Tashkent', 'UTC', 'Europe/Moscow'])
  timezone?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(8)
  @Max(128)
  minPasswordLength?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(43_200)
  sessionTimeout?: number;

  @IsOptional()
  @IsBoolean()
  notificationsEnabled?: boolean;
}

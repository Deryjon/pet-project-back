import { IsBoolean } from 'class-validator';

export class UpdateEntityStatusDto {
  @IsBoolean()
  is_active!: boolean;
}

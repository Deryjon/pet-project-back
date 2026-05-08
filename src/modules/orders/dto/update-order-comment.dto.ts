import { IsOptional, IsString } from 'class-validator';

export class UpdateOrderCommentDto {
  @IsOptional()
  @IsString()
  comment?: string;
}

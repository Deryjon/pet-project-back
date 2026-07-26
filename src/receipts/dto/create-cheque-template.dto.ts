import { IsOptional, IsString } from 'class-validator';

export class CreateChequeTemplateDto {
  @IsOptional()
  @IsString()
  name?: string;
}

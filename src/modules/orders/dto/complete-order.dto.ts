import {
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
} from 'class-validator';

export class CompleteOrderDto {
  @IsOptional()
  @IsBoolean()
  allowDebt?: boolean;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  receiptUrl?: string;
}

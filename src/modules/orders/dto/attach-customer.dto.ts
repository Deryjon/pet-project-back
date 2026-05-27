import { IsOptional, IsString, MinLength } from 'class-validator';

export class AttachCustomerDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  customerId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  clientId?: string;
}

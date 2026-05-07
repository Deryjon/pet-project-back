import { IsString, MinLength } from 'class-validator';

export class AttachCustomerDto {
  @IsString()
  @MinLength(1)
  customerId!: string;
}

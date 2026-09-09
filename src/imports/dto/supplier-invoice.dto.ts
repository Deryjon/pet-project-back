import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CreateSupplierInvoiceDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  supplierId!: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  invoiceNumber?: string;

  @IsOptional()
  @IsDateString()
  invoiceDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  idempotencyKey?: string;
}

export class SupplierInvoiceListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsIn([
    'DRAFT',
    'PROCESSING',
    'REVIEW',
    'READY',
    'COMMITTED',
    'CANCELLED',
    'ROLLED_BACK',
  ])
  status?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  supplierId?: number;
}

export class RecognizedInvoiceItemDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  rawName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  sku?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  barcode?: string | null;

  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0.001)
  quantity!: number;

  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  supplyPrice!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  totalPrice?: number;
}

export class AddRecognizedItemsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RecognizedInvoiceItemDto)
  items!: RecognizedInvoiceItemDto[];
}

export class UpdateSupplierInvoiceItemDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  correctedName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  rawName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  sku?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  barcode?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0.001)
  quantity?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  supplyPrice?: number;
}

export class MatchSupplierInvoiceItemDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  productId!: number;
}

export class MergeSupplierInvoiceItemsDto {
  @IsArray()
  @ArrayMinSize(2)
  @IsString({ each: true })
  itemIds!: string[];
}

export class InvoiceAllocationDto {
  @IsString()
  @MinLength(1)
  invoiceItemId!: string;

  @IsString()
  @MinLength(1)
  shopId!: string;

  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0.001)
  quantity!: number;
}

export class AllocateSupplierInvoiceDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => InvoiceAllocationDto)
  allocations!: InvoiceAllocationDto[];
}

export class CommitSupplierInvoiceDto {
  @IsOptional()
  @IsIn(['LAST_PURCHASE', 'WEIGHTED_AVERAGE', 'MANUAL'])
  supplyPriceStrategy?: string;
}

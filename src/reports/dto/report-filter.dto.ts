export class ReportFilterDto {
  from?: string;
  to?: string;
  shopIds?: string[];
  sellerIds?: number[];
  productIds?: number[];
  categoryIds?: number[];
  supplierIds?: number[];
  brandIds?: number[];
  page?: number;
  perPage?: number;
}

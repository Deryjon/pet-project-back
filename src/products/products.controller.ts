import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ProductsService } from './products.service';

@Controller()
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get('products')
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    return this.productsService.findAll({
      page: Number(page) || 1,
      limit: Number(limit) || 20,
      search: search?.trim(),
    });
  }

  @Post('products')
  create(@Body() body: Record<string, unknown>) {
    return this.productsService.create(body);
  }

  @Get('v2/product-characteristic')
  getProductCharacteristics(@Query('limit') limit?: string) {
    return this.productsService.getProductCharacteristics(limit);
  }

  @Get('v2/product')
  findAllV2(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('field_search_key') fieldSearchKey?: string,
    @Query('statistics') statistics?: string,
    @Query('brand_ids') brandIds?: string | string[],
    @Query('supplier_ids') supplierIds?: string | string[],
    @Query('order') order?: string | string[],
    @Query('status') status?: string,
    @Query('archived_list') archivedList?: string,
    @Query('shop_ids') shopIds?: string | string[],
    @Query('category_ids') categoryIds?: string | string[],
    @Query('sku') sku?: string,
    @Query('measurement_type') measurementType?: string,
    @Query('supply_price_from') supplyPriceFrom?: string,
    @Query('supply_price_to') supplyPriceTo?: string,
    @Query('retail_price_from') retailPriceFrom?: string,
    @Query('retail_price_to') retailPriceTo?: string,
    @Query('wholesale_price') wholesalePrice?: string,
    @Query('free_price') freePrice?: string,
  ) {
    return this.productsService.findAllV2Extended({
      page: Number(page) || 1,
      limit: Number(limit) || 20,
      search: search?.trim() || fieldSearchKey?.trim(),
      statistics: this.toBoolean(statistics),
      status: status?.trim(),
      archivedList: this.toBoolean(archivedList),
      brandIds: this.toStringArray(brandIds),
      supplierIds: this.toStringArray(supplierIds),
      order: this.toStringArray(order),
      shopIds: this.toStringArray(shopIds),
      categoryIds: this.toStringArray(categoryIds),
      sku: sku?.trim(),
      measurementType: measurementType?.trim(),
      supplyPriceFrom: this.toNumber(supplyPriceFrom),
      supplyPriceTo: this.toNumber(supplyPriceTo),
      retailPriceFrom: this.toNumber(retailPriceFrom),
      retailPriceTo: this.toNumber(retailPriceTo),
      wholesalePrice: this.toNumber(wholesalePrice),
      freePrice: this.toOptionalBoolean(freePrice),
    });
  }

  @Get('v2/product-stats')
  getProductStats(
    @Query('search') search?: string,
    @Query('field_search_key') fieldSearchKey?: string,
    @Query('status') status?: string,
    @Query('archived_list') archivedList?: string,
    @Query('brand_ids') brandIds?: string | string[],
    @Query('supplier_ids') supplierIds?: string | string[],
    @Query('shop_ids') shopIds?: string | string[],
    @Query('category_ids') categoryIds?: string | string[],
    @Query('sku') sku?: string,
    @Query('measurement_type') measurementType?: string,
    @Query('supply_price_from') supplyPriceFrom?: string,
    @Query('supply_price_to') supplyPriceTo?: string,
    @Query('retail_price_from') retailPriceFrom?: string,
    @Query('retail_price_to') retailPriceTo?: string,
    @Query('wholesale_price') wholesalePrice?: string,
    @Query('free_price') freePrice?: string,
  ) {
    return this.productsService.getCatalogStatistics({
      search: search?.trim() || fieldSearchKey?.trim(),
      status: status?.trim(),
      archivedList: this.toBoolean(archivedList),
      brandIds: this.toStringArray(brandIds),
      supplierIds: this.toStringArray(supplierIds),
      shopIds: this.toStringArray(shopIds),
      categoryIds: this.toStringArray(categoryIds),
      sku: sku?.trim(),
      measurementType: measurementType?.trim(),
      supplyPriceFrom: this.toNumber(supplyPriceFrom),
      supplyPriceTo: this.toNumber(supplyPriceTo),
      retailPriceFrom: this.toNumber(retailPriceFrom),
      retailPriceTo: this.toNumber(retailPriceTo),
      wholesalePrice: this.toNumber(wholesalePrice),
      freePrice: this.toOptionalBoolean(freePrice),
    });
  }

  @Post('v2/product')
  findAllV2Post(@Body() body: Record<string, unknown>) {
    if (this.isCatalogCreateRequest(body)) {
      throw new BadRequestException(
        'POST /api/v2/product is deprecated for catalog create. Use POST /api/v2/product/create.',
      );
    }

    return this.productsService.findAllV2Extended({
      page: this.toNumber(body.page) || 1,
      limit: this.toNumber(body.limit) || 20,
      search:
        this.toOptionalString(body.search) ??
        this.toOptionalString(body.field_search_key),
      statistics: this.toBoolean(body.statistics),
      status: this.toOptionalString(body.status),
      archivedList: this.toBoolean(body.archived_list),
      brandIds: this.toStringArray(body.brand_ids),
      supplierIds: this.toStringArray(body.supplier_ids),
      order: this.toStringArray(body.order),
      shopIds: this.toStringArray(body.shop_ids),
      categoryIds: this.toStringArray(body.category_ids),
      sku: this.toOptionalString(body.sku),
      measurementType: this.toOptionalString(body.measurement_type),
      supplyPriceFrom: this.toNumber(body.supply_price_from),
      supplyPriceTo: this.toNumber(body.supply_price_to),
      retailPriceFrom: this.toNumber(body.retail_price_from),
      retailPriceTo: this.toNumber(body.retail_price_to),
      wholesalePrice: this.toNumber(body.wholesale_price),
      freePrice: this.toOptionalBoolean(body.free_price),
    });
  }

  @Post('v2/product/create')
  createCatalogProduct(@Body() body: Record<string, unknown>) {
    return this.productsService.createCatalogProduct(body);
  }

  @Put('v2/product/:id')
  updateCatalogProduct(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.productsService.updateCatalogProduct(id, body);
  }

  @Post('v2/product/generate-sku')
  generateSku(@Body() body: Record<string, unknown>) {
    return this.productsService.generateSku(body);
  }

  @Post('v2/product/generate-barcode')
  generateBarcode() {
    return this.productsService.generateBarcode();
  }

  @Post('v2/product-search-with-filters')
  findAllV2Catalog(@Body() body: Record<string, unknown>) {
    return this.productsService.findAllV2Extended({
      page: this.toNumber(body.page) || 1,
      limit: this.toNumber(body.limit) || 20,
      search:
        this.toOptionalString(body.search) ??
        this.toOptionalString(body.field_search_key),
      statistics: this.toBoolean(body.statistics),
      status: this.toOptionalString(body.status),
      archivedList: this.toBoolean(body.archived_list),
      brandIds: this.toStringArray(body.brand_ids),
      supplierIds: this.toStringArray(body.supplier_ids),
      order: this.toStringArray(body.order),
      shopIds: this.toStringArray(body.shop_ids),
      categoryIds: this.toStringArray(body.category_ids),
      sku: this.toOptionalString(body.sku),
      measurementType: this.toOptionalString(body.measurement_type),
      supplyPriceFrom: this.toNumber(body.supply_price_from),
      supplyPriceTo: this.toNumber(body.supply_price_to),
      retailPriceFrom: this.toNumber(body.retail_price_from),
      retailPriceTo: this.toNumber(body.retail_price_to),
      wholesalePrice: this.toNumber(body.wholesale_price),
      freePrice: this.toOptionalBoolean(body.free_price),
    });
  }

  @Post('v2/product-search-stats-with-filters')
  getProductStatsWithFilters(@Body() body: Record<string, unknown>) {
    return this.productsService.getCatalogStatistics({
      search:
        this.toOptionalString(body.search) ??
        this.toOptionalString(body.field_search_key),
      status: this.toOptionalString(body.status),
      archivedList: this.toBoolean(body.archived_list),
      brandIds: this.toStringArray(body.brand_ids),
      supplierIds: this.toStringArray(body.supplier_ids),
      shopIds: this.toStringArray(body.shop_ids),
      categoryIds: this.toStringArray(body.category_ids),
      sku: this.toOptionalString(body.sku),
      measurementType: this.toOptionalString(body.measurement_type),
      supplyPriceFrom: this.toNumber(body.supply_price_from),
      supplyPriceTo: this.toNumber(body.supply_price_to),
      retailPriceFrom: this.toNumber(body.retail_price_from),
      retailPriceTo: this.toNumber(body.retail_price_to),
      wholesalePrice: this.toNumber(body.wholesale_price),
      freePrice: this.toOptionalBoolean(body.free_price),
    });
  }

  private toStringArray(value: unknown) {
    if (Array.isArray(value)) {
      return value.filter((item): item is string => typeof item === 'string');
    }

    if (typeof value === 'string') {
      return [value];
    }

    return undefined;
  }

  private toOptionalString(value: unknown) {
    return typeof value === 'string' && value.trim().length > 0
      ? value.trim()
      : undefined;
  }

  private toNumber(value: unknown) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  private toBoolean(value: unknown) {
    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'string') {
      return value === 'true';
    }

    return false;
  }

  private toOptionalBoolean(value: unknown) {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }

    return this.toBoolean(value);
  }

  private isCatalogCreateRequest(body: Record<string, unknown>) {
    return (
      typeof body.name === 'string' &&
      (body.retail_price !== undefined ||
        body.supply_price !== undefined ||
        body.shop_prices !== undefined ||
        body.shop_measurement_values !== undefined ||
        body.shipments !== undefined)
    );
  }
}

import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentCompanyContext } from '../auth/company-context.decorator';
import { CompanyAccessGuard } from '../auth/guards/company-access.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../auth/permissions.decorator';
import { CompanyRequestContext } from '../auth/request-context';
import { ProductsService } from './products.service';

@UseGuards(JwtAuthGuard, CompanyAccessGuard)
@Controller()
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get('products/search')
  @UseGuards(PermissionsGuard)
  @Permissions('catalog-operations')
  searchForPos(
    @Query('q') q: string | undefined,
    @Query('shopId') shopId: string | undefined,
    @Query('limit') limit: string | undefined,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.productsService.searchForPos(
      {
        q: q?.trim(),
        shopId: shopId?.trim(),
        limit: Number(limit) || 20,
      },
      requestContext,
    );
  }

  @Get('products')
  @UseGuards(PermissionsGuard)
  @Permissions('catalog-operations')
  findAll(
    @Query('page') page: string | undefined,
    @Query('limit') limit: string | undefined,
    @Query('search') search: string | undefined,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.productsService.findAll(
      {
        page: Number(page) || 1,
        limit: Number(limit) || 20,
        search: search?.trim(),
      },
      requestContext,
    );
  }

  @Post('products')
  @UseGuards(PermissionsGuard)
  @Permissions('catalog-operations')
  create(
    @Body() body: Record<string, unknown>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.productsService.create(body, requestContext);
  }

  @Get('v2/product-characteristic')
  getProductCharacteristics(@Query('limit') limit?: string) {
    return this.productsService.getProductCharacteristics(limit);
  }

  @Get('v2/excel/import-properties')
  getExcelImportProperties(@Query('limit') limit?: string) {
    return this.productsService.getExcelImportProperties(limit);
  }

  @Post('v2/imports')
  createImportDraft(
    @Body() body: Record<string, unknown>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.productsService.createImportDraft(body, requestContext);
  }

  @Get('v2/imports')
  @Header(
    'Cache-Control',
    'no-store, no-cache, must-revalidate, proxy-revalidate',
  )
  @Header('Pragma', 'no-cache')
  @Header('Expires', '0')
  @Header('Surrogate-Control', 'no-store')
  listImports(
    @Query('page') page: string | undefined,
    @Query('limit') limit: string | undefined,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.productsService.listImports(
      {
        page: Number(page) || 1,
        limit: Number(limit) || 10,
      },
      requestContext,
    );
  }

  @Get('v2/imports/:id')
  @Header(
    'Cache-Control',
    'no-store, no-cache, must-revalidate, proxy-revalidate',
  )
  @Header('Pragma', 'no-cache')
  @Header('Expires', '0')
  @Header('Surrogate-Control', 'no-store')
  getImportById(
    @Param('id') id: string,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.productsService.getImportById(id, requestContext);
  }

  @Post('v2/imports/:id/validate')
  validateImportDraft(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.productsService.validateExcelImport(
      {
        ...body,
        import_id: id,
      },
      requestContext,
    );
  }

  @Post('v2/excel/validate-import')
  validateExcelImport(
    @Body() body: Record<string, unknown>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.productsService.validateExcelImport(body, requestContext);
  }

  @Get('v2/import-progress/:id')
  getImportProgress(
    @Param('id') id: string,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.productsService.getImportProgress(id, requestContext);
  }

  @Get('v2/import-search/:id')
  async getImportSearch(
    @Param('id') id: string,
    @Query('limit') limit: string | undefined,
    @Query('page') page: string | undefined,
    @Query('difference') difference: string | undefined,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.productsService.getImportSearch(
      id,
      {
        limit: Number(limit) || 20,
        page: Number(page) || 1,
        difference: this.toBoolean(difference),
      },
      requestContext,
    );
  }

  @Get('v2/import-items-dp/:id')
  async getImportItemsDp(
    @Param('id') id: string,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.productsService.getImportItemsDp(id, requestContext);
  }

  @Post('v2/import-commit/:id')
  importCommit(
    @Param('id') id: string,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.productsService.commitImport(id, requestContext);
  }

  @Post('v2/imports/:id/commit')
  commitImportDraft(
    @Param('id') id: string,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.productsService.commitImport(id, requestContext, {
      forceWithCheckAccept: true,
    });
  }

  @Post('v2/imports/:id/cancel')
  cancelImportDraft(
    @Param('id') id: string,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.productsService.cancelImport(id, requestContext);
  }

  @Post('v2/imports/:id/rollback')
  rollbackImport(
    @Param('id') id: string,
    @Query('dry_run') dryRun: string | undefined,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.productsService.rollbackImport(id, requestContext, {
      dryRun: dryRun === 'true',
    });
  }

  @Post('v2/excel/import-without-check')
  importWithoutCheck(
    @Body() body: Record<string, unknown>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.productsService.importWithoutCheck(body, requestContext);
  }

  @Post('v2/import/inventory')
  createImportInventory(
    @Body() body: Record<string, unknown>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.productsService.createImportInventory(body, requestContext);
  }

  @Get('v2/stocktaking/:id')
  getStocktakingById(
    @Param('id') id: string,
    @Query('page') page: string | undefined,
    @Query('limit') limit: string | undefined,
    @Query('type') type: string | undefined,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.productsService.getStocktakingById(
      id,
      {
        page: Number(page) || 1,
        limit: Number(limit) || 10,
        type: type?.trim(),
      },
      requestContext,
    );
  }

  @Get('v2/stocktaking-logs/:id')
  getStocktakingLogs(
    @Param('id') id: string,
    @Query('page') page: string | undefined,
    @Query('limit') limit: string | undefined,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.productsService.getStocktakingLogs(
      id,
      {
        page: Number(page) || 1,
        limit: Number(limit) || 10,
      },
      requestContext,
    );
  }

  @Patch('v2/stocktaking/:id/set-product-by-barcode')
  setStocktakingProductByBarcode(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.productsService.setStocktakingProductByBarcode(
      id,
      body,
      requestContext,
    );
  }

  @Post('v2/stocktaking/:id/accept')
  acceptStocktakingImport(
    @Param('id') id: string,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.productsService.acceptStocktakingImport(id, requestContext);
  }

  @Get('v2/product')
  @UseGuards(PermissionsGuard)
  @Permissions('catalog-operations')
  findAllV2(
    @Query('page') page: string | undefined,
    @Query('limit') limit: string | undefined,
    @Query('search') search: string | undefined,
    @Query('field_search_key') fieldSearchKey: string | undefined,
    @Query('statistics') statistics: string | undefined,
    @Query('brand_ids') brandIds: string | string[] | undefined,
    @Query('supplier_ids') supplierIds: string | string[] | undefined,
    @Query('order') order: string | string[] | undefined,
    @Query('status') status: string | undefined,
    @Query('archived_list') archivedList: string | undefined,
    @Query('shop_ids') shopIds: string | string[] | undefined,
    @Query('category_ids') categoryIds: string | string[] | undefined,
    @Query('sku') sku: string | undefined,
    @Query('measurement_type') measurementType: string | undefined,
    @Query('supply_price_from') supplyPriceFrom: string | undefined,
    @Query('supply_price_to') supplyPriceTo: string | undefined,
    @Query('retail_price_from') retailPriceFrom: string | undefined,
    @Query('retail_price_to') retailPriceTo: string | undefined,
    @Query('wholesale_price_from') wholesalePriceFrom: string | undefined,
    @Query('wholesale_price_to') wholesalePriceTo: string | undefined,
    @Query('wholesale_price') wholesalePrice: string | undefined,
    @Query('free_price') freePrice: string | undefined,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.productsService.findAllV2Extended(
      {
        page: Number(page) || 1,
        limit: Number(limit) || 20,
        search: search?.trim() || fieldSearchKey?.trim(),
        statistics: this.toBoolean(statistics),
        status: status?.trim(),
        archivedList: this.toOptionalBoolean(archivedList),
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
        wholesalePriceFrom: this.toNumber(wholesalePriceFrom),
        wholesalePriceTo: this.toNumber(wholesalePriceTo),
        wholesalePrice: this.toNumber(wholesalePrice),
        freePrice: this.toOptionalBoolean(freePrice),
      },
      requestContext,
    );
  }

  @Get('v2/product-stats')
  @UseGuards(PermissionsGuard)
  @Permissions('catalog-operations')
  getProductStats(
    @Query('search') search: string | undefined,
    @Query('field_search_key') fieldSearchKey: string | undefined,
    @Query('status') status: string | undefined,
    @Query('archived_list') archivedList: string | undefined,
    @Query('brand_ids') brandIds: string | string[] | undefined,
    @Query('supplier_ids') supplierIds: string | string[] | undefined,
    @Query('shop_ids') shopIds: string | string[] | undefined,
    @Query('category_ids') categoryIds: string | string[] | undefined,
    @Query('sku') sku: string | undefined,
    @Query('measurement_type') measurementType: string | undefined,
    @Query('supply_price_from') supplyPriceFrom: string | undefined,
    @Query('supply_price_to') supplyPriceTo: string | undefined,
    @Query('retail_price_from') retailPriceFrom: string | undefined,
    @Query('retail_price_to') retailPriceTo: string | undefined,
    @Query('wholesale_price_from') wholesalePriceFrom: string | undefined,
    @Query('wholesale_price_to') wholesalePriceTo: string | undefined,
    @Query('wholesale_price') wholesalePrice: string | undefined,
    @Query('free_price') freePrice: string | undefined,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.productsService.getCatalogStatistics(
      {
        search: search?.trim() || fieldSearchKey?.trim(),
        status: status?.trim(),
        archivedList: this.toOptionalBoolean(archivedList),
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
        wholesalePriceFrom: this.toNumber(wholesalePriceFrom),
        wholesalePriceTo: this.toNumber(wholesalePriceTo),
        wholesalePrice: this.toNumber(wholesalePrice),
        freePrice: this.toOptionalBoolean(freePrice),
      },
      requestContext,
    );
  }

  @Get('v2/product/:id')
  @UseGuards(PermissionsGuard)
  @Permissions('catalog-operations')
  getProductById(
    @Param('id') id: string,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.productsService.getProductById(id, requestContext);
  }

  @Post('v2/product')
  @HttpCode(200)
  @UseGuards(PermissionsGuard)
  @Permissions('catalog-operations')
  findAllV2Post(
    @Body() body: Record<string, unknown>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    if (this.isCatalogCreateRequest(body)) {
      throw new BadRequestException(
        'POST /api/v2/product is deprecated for catalog create. Use POST /api/v2/product/create.',
      );
    }

    if (this.isCatalogCreateRequest(body) && this.hasSearchPayload(body)) {
      throw new BadRequestException(
        'Ambiguous payload. Use POST /api/v2/product/create to create a catalog product.',
      );
    }

    return this.productsService.findAllV2Extended(
      {
        page: this.toNumber(body.page) || 1,
        limit: this.toNumber(body.limit) || 20,
        search:
          this.toOptionalString(body.search) ??
          this.toOptionalString(body.field_search_key),
        statistics: this.toBoolean(body.statistics),
        status: this.toOptionalString(body.status),
        archivedList: this.toOptionalBoolean(body.archived_list),
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
        wholesalePriceFrom: this.toNumber(body.wholesale_price_from),
        wholesalePriceTo: this.toNumber(body.wholesale_price_to),
        wholesalePrice: this.toNumber(body.wholesale_price),
        freePrice: this.toOptionalBoolean(body.free_price),
      },
      requestContext,
    );
  }

  @Post('v2/product/create')
  @UseGuards(PermissionsGuard)
  @Permissions('catalog-operations')
  createCatalogProduct(
    @Body() body: Record<string, unknown>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.productsService.createCatalogProduct(body, requestContext);
  }

  @Post('v2/product/photo')
  @UseInterceptors(FileInterceptor('photo'))
  uploadProductPhoto(
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
    @UploadedFile()
    file?: {
      originalname: string;
      mimetype: string;
      size: number;
      buffer: Buffer;
    },
  ) {
    return this.productsService.uploadProductPhoto(requestContext, file);
  }

  @Put('v2/product/:id')
  updateCatalogProduct(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.productsService.updateCatalogProduct(id, body, requestContext);
  }

  @Patch('v2/product/:id/identifiers')
  patchProductIdentifiers(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.productsService.patchProductIdentifiers(
      id,
      body,
      requestContext,
    );
  }

  @Put('v2/products/bulk/archive')
  bulkArchiveProducts(
    @Body() body: Record<string, unknown>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.productsService.bulkArchiveProducts(body, requestContext);
  }

  @Delete('v2/products/archived')
  clearAllArchivedProducts(
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.productsService.clearAllArchivedProducts(requestContext);
  }

  @Delete('v2/products/bulk/delete')
  bulkDeleteProducts(
    @Body() body: Record<string, unknown>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.productsService.bulkDeleteProducts(body, requestContext);
  }

  @Post('v2/product/generate-sku')
  generateSku(
    @Body() body: Record<string, unknown>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.productsService.generateSku(body, requestContext);
  }

  @Post('v2/product/generate-barcode')
  generateBarcode(
    @Body() body: Record<string, unknown>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.productsService.generateBarcode(body, requestContext);
  }

  @Get('v2/product-movement/:id')
  getProductMovement(
    @Param('id') id: string,
    @Query('limit') limit: string | undefined,
    @Query('page') page: string | undefined,
    @Query('from_created_at') fromCreatedAt: string | undefined,
    @Query('to_created_at') toCreatedAt: string | undefined,
    @Query('movement_type') movementType: string | undefined,
    @Query('shop_id') shopId: string | undefined,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.productsService.getProductMovement(
      id,
      {
        limit: Number(limit) || 10,
        page: Number(page) || 1,
        fromCreatedAt: fromCreatedAt?.trim(),
        toCreatedAt: toCreatedAt?.trim(),
        movementType: movementType?.trim(),
        shopId: shopId?.trim(),
      },
      requestContext,
    );
  }

  @Get('v2/stock-movements')
  listStockMovements(
    @Query('limit') limit: string | undefined,
    @Query('page') page: string | undefined,
    @Query('from_created_at') fromCreatedAt: string | undefined,
    @Query('to_created_at') toCreatedAt: string | undefined,
    @Query('movement_type') movementType: string | undefined,
    @Query('shop_id') shopId: string | undefined,
    @Query('product_id') productId: string | undefined,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.productsService.listStockMovements(
      {
        limit: Number(limit) || 20,
        page: Number(page) || 1,
        fromCreatedAt: fromCreatedAt?.trim(),
        toCreatedAt: toCreatedAt?.trim(),
        movementType: movementType?.trim(),
        shopId: shopId?.trim(),
        productId: productId?.trim(),
      },
      requestContext,
    );
  }

  @Post('v2/product-search-with-filters')
  @HttpCode(200)
  @UseGuards(PermissionsGuard)
  @Permissions('catalog-operations')
  findAllV2Catalog(
    @Body() body: Record<string, unknown>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.productsService.findAllV2Extended(
      {
        page: this.toNumber(body.page) || 1,
        limit: this.toNumber(body.limit) || 20,
        search:
          this.toOptionalString(body.search) ??
          this.toOptionalString(body.field_search_key),
        statistics: this.toBoolean(body.statistics),
        status: this.toOptionalString(body.status),
        archivedList: this.toOptionalBoolean(body.archived_list),
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
        wholesalePriceFrom: this.toNumber(body.wholesale_price_from),
        wholesalePriceTo: this.toNumber(body.wholesale_price_to),
        wholesalePrice: this.toNumber(body.wholesale_price),
        freePrice: this.toOptionalBoolean(body.free_price),
      },
      requestContext,
    );
  }

  @Post('v2/product-search-stats-with-filters')
  @HttpCode(200)
  @UseGuards(PermissionsGuard)
  @Permissions('catalog-operations')
  getProductStatsWithFilters(
    @Body() body: Record<string, unknown>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.productsService.getCatalogStatistics(
      {
        search:
          this.toOptionalString(body.search) ??
          this.toOptionalString(body.field_search_key),
        status: this.toOptionalString(body.status),
        archivedList: this.toOptionalBoolean(body.archived_list),
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
        wholesalePriceFrom: this.toNumber(body.wholesale_price_from),
        wholesalePriceTo: this.toNumber(body.wholesale_price_to),
        wholesalePrice: this.toNumber(body.wholesale_price),
        freePrice: this.toOptionalBoolean(body.free_price),
      },
      requestContext,
    );
  }

  @Get('v2/transfer')
  listTransfers(
    @Query('page') page: string | undefined,
    @Query('limit') limit: string | undefined,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.productsService.listTransfers(
      {
        page: Number(page) || 1,
        limit: Number(limit) || 10,
      },
      requestContext,
    );
  }

  @Get('v2/transfer/:id')
  getTransferById(
    @Param('id') id: string,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.productsService.getTransferById(id, requestContext);
  }

  @Post('v2/transfer')
  createTransfer(
    @Body() body: Record<string, unknown>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.productsService.createTransfer(body, requestContext);
  }

  @Get('v2/transfer-products/:id')
  getTransferProducts(
    @Param('id') id: string,
    @Query('search') search: string | undefined,
    @Query('limit') limit: string | undefined,
    @Query('page') page: string | undefined,
    @Query('status') status: string | undefined,
    @Query('statistics') statistics: string | undefined,
    @Query('product_type_id') productTypeId: string | undefined,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.productsService.getTransferProducts(
      id,
      {
        search: search?.trim(),
        limit: Number(limit) || 20,
        page: Number(page) || 1,
        status: status?.trim(),
        statistics: this.toBoolean(statistics),
        productTypeId: productTypeId?.trim(),
      },
      requestContext,
    );
  }

  @Get('v2/transfer-items/:id')
  getTransferItems(
    @Param('id') id: string,
    @Query('search') search: string | undefined,
    @Query('limit') limit: string | undefined,
    @Query('page') page: string | undefined,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.productsService.getTransferItems(
      id,
      {
        search: search?.trim(),
        limit: Number(limit) || 20,
        page: Number(page) || 1,
      },
      requestContext,
    );
  }

  @Post('v2/transfer/:id/items')
  upsertTransferItem(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.productsService.upsertTransferItem(id, body, requestContext);
  }

  @Post('v2/transfer/:id/send')
  @HttpCode(200)
  sendTransfer(
    @Param('id') id: string,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.productsService.sendTransfer(id, requestContext);
  }

  @Post('v2/transfer/:id/accept')
  @HttpCode(200)
  acceptTransfer(
    @Param('id') id: string,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.productsService.acceptTransfer(id, requestContext);
  }

  @Post('v2/transfer/:id/accept-verified')
  @HttpCode(200)
  acceptTransferVerified(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.productsService.acceptTransferVerified(
      id,
      body,
      requestContext,
    );
  }

  @Post('v2/transfer/:id/cancel')
  @HttpCode(200)
  cancelTransfer(
    @Param('id') id: string,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.productsService.cancelTransfer(id, requestContext);
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

  private hasSearchPayload(body: Record<string, unknown>) {
    return (
      body.page !== undefined ||
      body.limit !== undefined ||
      body.search !== undefined ||
      body.field_search_key !== undefined ||
      body.statistics !== undefined ||
      body.status !== undefined ||
      body.archived_list !== undefined ||
      body.brand_ids !== undefined ||
      body.supplier_ids !== undefined ||
      body.order !== undefined
    );
  }
}

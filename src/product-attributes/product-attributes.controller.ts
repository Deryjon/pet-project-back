import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentCompanyContext } from '../auth/company-context.decorator';
import { CompanyAccessGuard } from '../auth/guards/company-access.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../auth/permissions.decorator';
import { CompanyRequestContext } from '../auth/request-context';
import { ProductAttributesService } from './product-attributes.service';

@UseGuards(JwtAuthGuard, CompanyAccessGuard, PermissionsGuard)
@Permissions('catalog-operations')
@Controller()
export class ProductAttributesController {
  constructor(private readonly attributes: ProductAttributesService) {}

  @Get('product-categories')
  listCategories(
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.attributes.listCategories(requestContext);
  }

  @Get('product-attributes')
  list(
    @Query('include_inactive') includeInactive: string | undefined,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.attributes.list(
      requestContext,
      includeInactive === 'true' || includeInactive === '1',
    );
  }

  @Post('product-attributes')
  create(
    @Body() body: Record<string, unknown>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.attributes.create(body, requestContext);
  }

  @Patch('product-attributes/:id')
  update(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.attributes.update(id, body, requestContext);
  }

  @Delete('product-attributes/:id')
  remove(
    @Param('id') id: string,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.attributes.remove(id, requestContext);
  }

  @Post('product-attributes/:id/options')
  createOption(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.attributes.createOption(id, body, requestContext);
  }

  @Patch('product-attributes/:id/options/:optionId')
  updateOption(
    @Param('id') id: string,
    @Param('optionId') optionId: string,
    @Body() body: Record<string, unknown>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.attributes.updateOption(id, optionId, body, requestContext);
  }

  @Delete('product-attributes/:id/options/:optionId')
  removeOption(
    @Param('id') id: string,
    @Param('optionId') optionId: string,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.attributes.removeOption(id, optionId, requestContext);
  }

  @Put('product-variants/:id/attributes')
  setVariantValues(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.attributes.setVariantValues(id, body, requestContext);
  }

  @Get('products/:id/attributes')
  getProductValues(
    @Param('id') id: string,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.attributes.getProductValues(id, requestContext);
  }

  @Put('products/:id/attributes')
  setProductValues(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.attributes.setProductValues(id, body, requestContext);
  }
}

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentCompanyContext } from '../../auth/company-context.decorator';
import { CompanyAccessGuard } from '../../auth/guards/company-access.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { Permissions } from '../../auth/permissions.decorator';
import { CompanyRequestContext } from '../../auth/request-context';
import { SupplierDirectoryService } from '../services/supplier-directory.service';

@Controller('suppliers')
@UseGuards(JwtAuthGuard, CompanyAccessGuard, PermissionsGuard)
@Permissions('supplier-list')
export class SuppliersController {
  constructor(private readonly suppliers: SupplierDirectoryService) {}
  @Get()
  list(@CurrentCompanyContext() requestContext: CompanyRequestContext) {
    return this.suppliers.list(requestContext);
  }
  @Post()
  @Permissions('supplier-create')
  create(
    @Body() body: any,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.suppliers.create(body, requestContext);
  }
  @Get(':id')
  get(
    @Param('id') id: string,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.suppliers.get(Number(id), requestContext);
  }
  @Patch(':id')
  @Permissions('supplier-edit')
  update(
    @Param('id') id: string,
    @Body() body: any,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.suppliers.update(Number(id), body, requestContext);
  }
  @Get(':id/product-aliases')
  aliases(
    @Param('id') id: string,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.suppliers.aliases(Number(id), requestContext);
  }
  @Post(':id/product-aliases')
  @Permissions('supplier-edit')
  createAlias(
    @Param('id') id: string,
    @Body() body: any,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.suppliers.createAlias(Number(id), body, requestContext);
  }
  @Patch(':id/product-aliases/:aliasId')
  @Permissions('supplier-edit')
  updateAlias(
    @Param('id') id: string,
    @Param('aliasId') aliasId: string,
    @Body() body: any,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.suppliers.updateAlias(
      Number(id),
      aliasId,
      body,
      requestContext,
    );
  }
  @Delete(':id/product-aliases/:aliasId')
  @Permissions('supplier-edit')
  deleteAlias(
    @Param('id') id: string,
    @Param('aliasId') aliasId: string,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.suppliers.deleteAlias(Number(id), aliasId, requestContext);
  }
}

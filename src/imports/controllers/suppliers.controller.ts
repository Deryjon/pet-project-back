import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { Permissions } from '../../auth/permissions.decorator';
import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CompanyAccessGuard } from '../../auth/guards/company-access.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { SupplierDirectoryService } from '../services/supplier-directory.service';

@Controller('suppliers')
@UseGuards(JwtAuthGuard, CompanyAccessGuard, PermissionsGuard)
@Permissions('supplier-list')
export class SuppliersController {
  constructor(private readonly suppliers: SupplierDirectoryService) {}
  @Get()
  list(@Headers('authorization') auth?: string) {
    return this.suppliers.list(auth);
  }
  @Post()
  @Permissions('supplier-create')
  create(@Body() body: any, @Headers('authorization') auth?: string) {
    return this.suppliers.create(body, auth);
  }
  @Get(':id')
  get(@Param('id') id: string, @Headers('authorization') auth?: string) {
    return this.suppliers.get(Number(id), auth);
  }
  @Patch(':id')
  @Permissions('supplier-edit')
  update(
    @Param('id') id: string,
    @Body() body: any,
    @Headers('authorization') auth?: string,
  ) {
    return this.suppliers.update(Number(id), body, auth);
  }
  @Get(':id/product-aliases')
  aliases(@Param('id') id: string, @Headers('authorization') auth?: string) {
    return this.suppliers.aliases(Number(id), auth);
  }
  @Post(':id/product-aliases')
  @Permissions('supplier-edit')
  createAlias(
    @Param('id') id: string,
    @Body() body: any,
    @Headers('authorization') auth?: string,
  ) {
    return this.suppliers.createAlias(Number(id), body, auth);
  }
  @Patch(':id/product-aliases/:aliasId')
  @Permissions('supplier-edit')
  updateAlias(
    @Param('id') id: string,
    @Param('aliasId') aliasId: string,
    @Body() body: any,
    @Headers('authorization') auth?: string,
  ) {
    return this.suppliers.updateAlias(Number(id), aliasId, body, auth);
  }
  @Delete(':id/product-aliases/:aliasId')
  @Permissions('supplier-edit')
  deleteAlias(
    @Param('id') id: string,
    @Param('aliasId') aliasId: string,
    @Headers('authorization') auth?: string,
  ) {
    return this.suppliers.deleteAlias(Number(id), aliasId, auth);
  }
}

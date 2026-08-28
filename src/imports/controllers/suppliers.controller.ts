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
@UseGuards(JwtAuthGuard, CompanyAccessGuard)
export class SuppliersController {
  constructor(private readonly suppliers: SupplierDirectoryService) {}
  @Get() list(@Headers('authorization') auth?: string) {
    return this.suppliers.list(auth);
  }
  @Post() create(@Body() body: any, @Headers('authorization') auth?: string) {
    return this.suppliers.create(body, auth);
  }
  @Get(':id') get(
    @Param('id') id: string,
    @Headers('authorization') auth?: string,
  ) {
    return this.suppliers.get(Number(id), auth);
  }
  @Patch(':id') update(
    @Param('id') id: string,
    @Body() body: any,
    @Headers('authorization') auth?: string,
  ) {
    return this.suppliers.update(Number(id), body, auth);
  }
  @Get(':id/product-aliases') aliases(
    @Param('id') id: string,
    @Headers('authorization') auth?: string,
  ) {
    return this.suppliers.aliases(Number(id), auth);
  }
  @Post(':id/product-aliases') createAlias(
    @Param('id') id: string,
    @Body() body: any,
    @Headers('authorization') auth?: string,
  ) {
    return this.suppliers.createAlias(Number(id), body, auth);
  }
  @Patch(':id/product-aliases/:aliasId') updateAlias(
    @Param('id') id: string,
    @Param('aliasId') aliasId: string,
    @Body() body: any,
    @Headers('authorization') auth?: string,
  ) {
    return this.suppliers.updateAlias(Number(id), aliasId, body, auth);
  }
  @Delete(':id/product-aliases/:aliasId') deleteAlias(
    @Param('id') id: string,
    @Param('aliasId') aliasId: string,
    @Headers('authorization') auth?: string,
  ) {
    return this.suppliers.deleteAlias(Number(id), aliasId, auth);
  }
}

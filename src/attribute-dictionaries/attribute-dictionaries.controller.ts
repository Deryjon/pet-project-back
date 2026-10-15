import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentCompanyContext } from '../auth/company-context.decorator';
import { CompanyAccessGuard } from '../auth/guards/company-access.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { PlatformAdminGuard } from '../auth/guards/platform-admin.guard';
import { Permissions } from '../auth/permissions.decorator';
import { CompanyRequestContext } from '../auth/request-context';
import { AttributeDictionariesService } from './attribute-dictionaries.service';

/** Store side: system + own values; writes need the owner/admin role (checked in the service). */
@UseGuards(JwtAuthGuard, CompanyAccessGuard, PermissionsGuard)
@Permissions('catalog-operations')
@Controller('attributes')
export class AttributeDictionariesController {
  constructor(private readonly dictionaries: AttributeDictionariesService) {}

  @Get(':type')
  list(
    @Param('type') type: string,
    @Query('all') all: string | undefined,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.dictionaries.list(
      this.dictionaries.parseType(type),
      requestContext,
      all === 'true' || all === '1',
    );
  }

  @Post(':type')
  create(
    @Param('type') type: string,
    @Body() body: Record<string, unknown>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.dictionaries.create(
      this.dictionaries.parseType(type),
      body ?? {},
      requestContext,
    );
  }

  /** Product form: the legacy row to save for a picked dictionary value. */
  @Post(':id/link')
  link(
    @Param('id') id: string,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.dictionaries.linkLegacy(id, requestContext);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.dictionaries.update(id, body ?? {}, requestContext);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.dictionaries.remove(id, requestContext);
  }
}

/** Platform super admin: system values only. */
@UseGuards(PlatformAdminGuard)
@Controller('admin/attributes')
export class AdminAttributeDictionariesController {
  constructor(private readonly dictionaries: AttributeDictionariesService) {}

  @Get()
  list(@Query('type') type: string | undefined) {
    return this.dictionaries.adminList(type);
  }

  @Post()
  create(@Body() body: Record<string, unknown>) {
    return this.dictionaries.adminCreate(body ?? {});
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.dictionaries.adminUpdate(id, body ?? {});
  }
}

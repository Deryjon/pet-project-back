import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  StreamableFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { randomUUID } from 'crypto';
import { mkdirSync } from 'fs';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { CurrentCompanyContext } from '../../auth/company-context.decorator';
import { CompanyAccessGuard } from '../../auth/guards/company-access.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { Permissions } from '../../auth/permissions.decorator';
import { CompanyRequestContext } from '../../auth/request-context';
import {
  AddRecognizedItemsDto,
  AllocateSupplierInvoiceDto,
  CommitSupplierInvoiceDto,
  CreateSupplierInvoiceDto,
  MatchSupplierInvoiceItemDto,
  MergeSupplierInvoiceItemsDto,
  SupplierInvoiceListQueryDto,
  UpdateSupplierInvoiceItemDto,
} from '../dto/supplier-invoice.dto';
import { SupplierInvoiceService } from '../services/supplier-invoice.service';

@Controller('supplier-invoices')
@UseGuards(JwtAuthGuard, CompanyAccessGuard, PermissionsGuard)
@Permissions('import-details')
export class SupplierInvoicesController {
  constructor(private readonly invoices: SupplierInvoiceService) {}
  @Post()
  @Permissions('import-create')
  create(
    @Body() body: CreateSupplierInvoiceDto,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.invoices.create(body, requestContext);
  }
  @Get()
  list(
    @Query() query: SupplierInvoiceListQueryDto,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.invoices.list(query, requestContext);
  }
  @Get(':id')
  get(
    @Param('id') id: string,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.invoices.get(id, requestContext);
  }
  @Post(':id/files')
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      storage: diskStorage({
        destination: (_req, _file, callback) => {
          const directory = join(process.cwd(), 'private', 'invoices');
          mkdirSync(directory, { recursive: true });
          callback(null, directory);
        },
        filename: (_req, file, callback) =>
          callback(
            null,
            `${randomUUID()}${extname(file.originalname).toLowerCase()}`,
          ),
      }),
      limits: { fileSize: 20 * 1024 * 1024 },
      fileFilter: (_req, file, callback) => {
        const allowed = [
          'image/jpeg',
          'image/png',
          'image/webp',
          'application/pdf',
        ].includes(file.mimetype);
        callback(
          allowed
            ? null
            : new BadRequestException(
                'OCR accepts JPG, PNG, WEBP and PDF files only',
              ),
          allowed,
        );
      },
    }),
  )
  @Permissions('import-create')
  uploadFiles(
    @Param('id') id: string,
    @UploadedFiles()
    files: Array<{
      originalname: string;
      mimetype: string;
      size: number;
      path: string;
      filename: string;
    }>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.invoices.saveFiles(id, files || [], requestContext);
  }
  @Get(':id/files/:fileIndex')
  async downloadFile(
    @Param('id') id: string,
    @Param('fileIndex', ParseIntPipe) fileIndex: number,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    const file = await this.invoices.readFile(id, fileIndex, requestContext);
    return new StreamableFile(file.data, {
      type: file.mimeType,
      disposition: `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
    });
  }
  @Post(':id/recognize')
  @Permissions('import-check')
  recognize(
    @Param('id') id: string,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.invoices.recognize(id, requestContext);
  }
  @Post(':id/recognized-items')
  @Permissions('import-check')
  addItems(
    @Param('id') id: string,
    @Body() body: AddRecognizedItemsDto,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.invoices.addItems(id, body, requestContext);
  }
  @Patch(':id/items/:itemId')
  @Permissions('import-check')
  updateItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() body: UpdateSupplierInvoiceItemDto,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.invoices.updateItem(id, itemId, body, requestContext);
  }
  @Delete(':id/items/:itemId')
  @Permissions('import-check')
  deleteItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.invoices.deleteItem(id, itemId, requestContext);
  }
  @Post(':id/auto-match')
  @Permissions('import-check')
  autoMatch(
    @Param('id') id: string,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.invoices.autoMatch(id, requestContext);
  }
  @Post(':id/items/:itemId/match')
  @Permissions('import-check')
  match(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() body: MatchSupplierInvoiceItemDto,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.invoices.matchItem(id, itemId, body, requestContext);
  }
  @Post(':id/allocations')
  @Permissions('import-check')
  allocate(
    @Param('id') id: string,
    @Body() body: AllocateSupplierInvoiceDto,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.invoices.allocate(id, body, requestContext);
  }
  @Post(':id/items/merge')
  @Permissions('import-check')
  mergeItems(
    @Param('id') id: string,
    @Body() body: MergeSupplierInvoiceItemsDto,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.invoices.mergeItems(id, body, requestContext);
  }
  @Post(':id/ready')
  @Permissions('import-check')
  ready(
    @Param('id') id: string,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.invoices.markReady(id, requestContext);
  }
  @Post(':id/commit')
  @Permissions('import-check')
  commit(
    @Param('id') id: string,
    @Body() body: CommitSupplierInvoiceDto,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.invoices.commit(id, body, requestContext);
  }
  @Post(':id/cancel')
  @Permissions('import-delete')
  cancel(
    @Param('id') id: string,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.invoices.cancel(id, requestContext);
  }
  @Post(':id/rollback')
  @Permissions('import-delete')
  rollback(
    @Param('id') id: string,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.invoices.rollback(id, requestContext);
  }
}

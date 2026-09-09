import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { Permissions } from '../../auth/permissions.decorator';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  ParseIntPipe,
  StreamableFile,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { mkdirSync } from 'fs';
import { randomUUID } from 'crypto';
import { CompanyAccessGuard } from '../../auth/guards/company-access.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { SupplierInvoiceService } from '../services/supplier-invoice.service';
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

@Controller('supplier-invoices')
@UseGuards(JwtAuthGuard, CompanyAccessGuard, PermissionsGuard)
@Permissions('import-details')
export class SupplierInvoicesController {
  constructor(private readonly invoices: SupplierInvoiceService) {}
  @Post()
  @Permissions('import-create')
  create(
    @Body() body: CreateSupplierInvoiceDto,
    @Headers('authorization') auth?: string,
  ) {
    return this.invoices.create(body, auth);
  }
  @Get()
  list(
    @Query() query: SupplierInvoiceListQueryDto,
    @Headers('authorization') auth?: string,
  ) {
    return this.invoices.list(query, auth);
  }
  @Get(':id')
  get(@Param('id') id: string, @Headers('authorization') auth?: string) {
    return this.invoices.get(id, auth);
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
    @Headers('authorization') auth?: string,
  ) {
    return this.invoices.saveFiles(id, files || [], auth);
  }
  @Get(':id/files/:fileIndex')
  async downloadFile(
    @Param('id') id: string,
    @Param('fileIndex', ParseIntPipe) fileIndex: number,
    @Headers('authorization') auth?: string,
  ) {
    const file = await this.invoices.readFile(id, fileIndex, auth);
    return new StreamableFile(file.data, {
      type: file.mimeType,
      disposition: `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
    });
  }
  @Post(':id/recognize')
  @Permissions('import-check')
  recognize(@Param('id') id: string, @Headers('authorization') auth?: string) {
    return this.invoices.recognize(id, auth);
  }
  @Post(':id/recognized-items')
  @Permissions('import-check')
  addItems(
    @Param('id') id: string,
    @Body() body: AddRecognizedItemsDto,
    @Headers('authorization') auth?: string,
  ) {
    return this.invoices.addItems(id, body, auth);
  }
  @Patch(':id/items/:itemId')
  @Permissions('import-check')
  updateItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() body: UpdateSupplierInvoiceItemDto,
    @Headers('authorization') auth?: string,
  ) {
    return this.invoices.updateItem(id, itemId, body, auth);
  }
  @Delete(':id/items/:itemId')
  @Permissions('import-check')
  deleteItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Headers('authorization') auth?: string,
  ) {
    return this.invoices.deleteItem(id, itemId, auth);
  }
  @Post(':id/auto-match')
  @Permissions('import-check')
  autoMatch(@Param('id') id: string, @Headers('authorization') auth?: string) {
    return this.invoices.autoMatch(id, auth);
  }
  @Post(':id/items/:itemId/match')
  @Permissions('import-check')
  match(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() body: MatchSupplierInvoiceItemDto,
    @Headers('authorization') auth?: string,
  ) {
    return this.invoices.matchItem(id, itemId, body, auth);
  }
  @Post(':id/allocations')
  @Permissions('import-check')
  allocate(
    @Param('id') id: string,
    @Body() body: AllocateSupplierInvoiceDto,
    @Headers('authorization') auth?: string,
  ) {
    return this.invoices.allocate(id, body, auth);
  }
  @Post(':id/items/merge')
  @Permissions('import-check')
  mergeItems(
    @Param('id') id: string,
    @Body() body: MergeSupplierInvoiceItemsDto,
    @Headers('authorization') auth?: string,
  ) {
    return this.invoices.mergeItems(id, body, auth);
  }
  @Post(':id/ready')
  @Permissions('import-check')
  ready(@Param('id') id: string, @Headers('authorization') auth?: string) {
    return this.invoices.markReady(id, auth);
  }
  @Post(':id/commit')
  @Permissions('import-check')
  commit(
    @Param('id') id: string,
    @Body() body: CommitSupplierInvoiceDto,
    @Headers('authorization') auth?: string,
  ) {
    return this.invoices.commit(id, body, auth);
  }
  @Post(':id/cancel')
  @Permissions('import-delete')
  cancel(@Param('id') id: string, @Headers('authorization') auth?: string) {
    return this.invoices.cancel(id, auth);
  }
  @Post(':id/rollback')
  @Permissions('import-delete')
  rollback(@Param('id') id: string, @Headers('authorization') auth?: string) {
    return this.invoices.rollback(id, auth);
  }
}

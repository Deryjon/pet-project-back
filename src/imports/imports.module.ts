import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { SupplierInvoicesController } from './controllers/supplier-invoices.controller';
import { SuppliersController } from './controllers/suppliers.controller';
import { ImportMatcherService } from './services/import-matcher.service';
import { ImportNormalizerService } from './services/import-normalizer.service';
import { InvoiceRecognitionService } from './services/invoice-recognition.service';
import { SupplierInvoiceService } from './services/supplier-invoice.service';
import { SupplierDirectoryService } from './services/supplier-directory.service';

@Module({
  imports: [UsersModule],
  controllers: [SupplierInvoicesController, SuppliersController],
  providers: [
    ImportNormalizerService,
    ImportMatcherService,
    InvoiceRecognitionService,
    SupplierInvoiceService,
    SupplierDirectoryService,
  ],
  exports: [ImportNormalizerService, InvoiceRecognitionService],
})
export class ImportsModule {}

import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import {
  InvoiceFile,
  InvoiceRecognitionProvider,
  RecognizedInvoice,
} from '../types/recognition.types';

export const INVOICE_RECOGNITION_PROVIDER = Symbol(
  'INVOICE_RECOGNITION_PROVIDER',
);

@Injectable()
export class InvoiceRecognitionService {
  constructor(
    @Optional() private readonly provider?: InvoiceRecognitionProvider,
  ) {}
  recognize(files: InvoiceFile[]): Promise<RecognizedInvoice> {
    if (!this.provider)
      throw new BadRequestException(
        'Invoice recognition provider is not configured',
      );
    return this.provider.recognize(files);
  }
}

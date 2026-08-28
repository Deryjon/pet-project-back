export type InvoiceFile = {
  name: string;
  mimeType: string;
  url?: string;
  path?: string;
};
export type RecognizedInvoice = {
  invoiceNumber?: string;
  invoiceDate?: string;
  items: Array<{
    rawName: string;
    sku?: string;
    barcode?: string;
    quantity: number;
    supplyPrice: number;
    totalPrice?: number;
  }>;
};
export interface InvoiceRecognitionProvider {
  recognize(files: InvoiceFile[]): Promise<RecognizedInvoice>;
}

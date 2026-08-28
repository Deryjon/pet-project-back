import {
  BadGatewayException,
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { promises as fs } from 'fs';
import { InvoiceFile, RecognizedInvoice } from '../types/recognition.types';

export const INVOICE_RECOGNITION_PROVIDER = Symbol(
  'INVOICE_RECOGNITION_PROVIDER',
);

@Injectable()
export class InvoiceRecognitionService {
  async recognize(files: InvoiceFile[]): Promise<RecognizedInvoice> {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey)
      throw new BadRequestException('OPENAI_API_KEY is not configured');
    if (!files.length)
      throw new BadRequestException('Upload at least one invoice file');

    const content: any[] = [
      {
        type: 'input_text',
        text: 'Распознай накладную поставщика. Верни каждую товарную строку отдельно. Числа без разделителей тысяч. Не выдумывай отсутствующие значения.',
      },
    ];
    for (const file of files) {
      if (!file.path) continue;
      const data = await fs.readFile(file.path);
      const dataUrl = `data:${file.mimeType};base64,${data.toString('base64')}`;
      if (file.mimeType.startsWith('image/'))
        content.push({
          type: 'input_image',
          image_url: dataUrl,
          detail: 'high',
        });
      else
        content.push({
          type: 'input_file',
          filename: file.name,
          file_data: dataUrl,
        });
    }

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.OPENAI_INVOICE_MODEL || 'gpt-5.4-nano',
        store: false,
        input: [{ role: 'user', content }],
        text: {
          format: {
            type: 'json_schema',
            name: 'supplier_invoice',
            strict: true,
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                invoiceNumber: { type: ['string', 'null'] },
                invoiceDate: { type: ['string', 'null'] },
                items: {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                      rawName: { type: 'string' },
                      sku: { type: ['string', 'null'] },
                      barcode: { type: ['string', 'null'] },
                      quantity: { type: 'number' },
                      supplyPrice: { type: 'number' },
                      totalPrice: { type: ['number', 'null'] },
                    },
                    required: [
                      'rawName',
                      'sku',
                      'barcode',
                      'quantity',
                      'supplyPrice',
                      'totalPrice',
                    ],
                  },
                },
              },
              required: ['invoiceNumber', 'invoiceDate', 'items'],
            },
          },
        },
      }),
    });
    const payload: any = await response.json();
    if (!response.ok)
      throw new BadGatewayException(
        payload?.error?.message || 'Invoice recognition failed',
      );
    const outputText =
      payload.output_text ||
      payload.output
        ?.flatMap((item: any) => item.content || [])
        .find((item: any) => item.type === 'output_text')?.text;
    if (!outputText)
      throw new BadGatewayException('Recognition returned no data');
    try {
      return JSON.parse(outputText) as RecognizedInvoice;
    } catch {
      throw new BadGatewayException('Recognition returned invalid JSON');
    }
  }
}

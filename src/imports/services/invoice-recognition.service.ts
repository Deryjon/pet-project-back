import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { promises as fs } from 'fs';
import { execFile } from 'child_process';
import { join } from 'path';
import { InvoiceFile, RecognizedInvoice } from '../types/recognition.types';

export const INVOICE_RECOGNITION_PROVIDER = Symbol(
  'INVOICE_RECOGNITION_PROVIDER',
);

@Injectable()
export class InvoiceRecognitionService {
  private readonly logger = new Logger(InvoiceRecognitionService.name);

  async recognize(files: InvoiceFile[]): Promise<RecognizedInvoice> {
    if (
      (process.env.INVOICE_RECOGNITION_PROVIDER || 'paddle').toLowerCase() ===
      'openai'
    ) {
      return this.recognizeWithOpenAi(files);
    }
    return this.recognizeWithPaddle(files);
  }

  private async recognizeWithPaddle(
    files: InvoiceFile[],
  ): Promise<RecognizedInvoice> {
    const paths = files
      .map((file) => file.path)
      .filter((path): path is string => Boolean(path));
    if (!paths.length)
      throw new BadRequestException('Upload at least one invoice file');
    if (files.some((file) => /spreadsheet|excel/i.test(file.mimeType)))
      throw new BadRequestException(
        'Local OCR accepts images and PDF. Use the existing Excel import for XLS/XLSX files.',
      );
    const python =
      process.env.PADDLE_OCR_PYTHON ||
      join(process.cwd(), '.venv-ocr', 'bin', 'python');
    const script = join(process.cwd(), 'ocr', 'recognize_invoice.py');
    const timeout = Math.max(
      60000,
      Number(process.env.PADDLE_OCR_TIMEOUT_MS) || 600000,
    );
    const startedAt = Date.now();
    this.logger.log(
      `Starting local OCR for ${paths.length} file(s), timeout=${timeout}ms`,
    );
    const stdout = await new Promise<string>((resolve, reject) => {
      execFile(
        python,
        [script, ...paths],
        {
          timeout,
          maxBuffer: 20 * 1024 * 1024,
          env: {
            ...process.env,
            PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK: 'True',
          },
        },
        (error, output, stderr) => {
          if (error) {
            this.logger.error(
              `Local OCR failed after ${Date.now() - startedAt}ms: ${error.message}`,
              stderr?.slice(-4000),
            );
            return reject(
              new BadGatewayException(
                stderr?.trim() || `Local PaddleOCR failed: ${error.message}`,
              ),
            );
          }
          this.logger.log(`Local OCR completed in ${Date.now() - startedAt}ms`);
          resolve(output);
        },
      );
    });
    const jsonLine = stdout
      .trim()
      .split('\n')
      .reverse()
      .find((line) => line.trim().startsWith('{'));
    if (!jsonLine) throw new BadGatewayException('Local OCR returned no JSON');
    try {
      const result = JSON.parse(jsonLine) as RecognizedInvoice;
      if (!result.items?.length)
        throw new BadGatewayException(
          'Не удалось найти товарные строки. Сделайте более чёткое фото или добавьте позиции вручную.',
        );
      return result;
    } catch (error) {
      if (error instanceof BadGatewayException) throw error;
      throw new BadGatewayException('Local OCR returned invalid JSON');
    }
  }

  private async recognizeWithOpenAi(
    files: InvoiceFile[],
  ): Promise<RecognizedInvoice> {
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

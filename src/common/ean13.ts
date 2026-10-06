import { Prisma } from '@prisma/client';

// In-store EAN-13 barcodes: the GS1 "2xx" restricted-circulation range
// (200000000000–299999999999 + check digit), never issued to real products.
export const INTERNAL_EAN13_MIN = 200000000000;
export const INTERNAL_EAN13_MAX = 299999999999;

/** GS1 check digit of a 12-digit EAN-13 payload. */
export function ean13CheckDigit(payload: string) {
  const sum = payload.split('').reduce((total, digit, index) => {
    return total + Number(digit) * (index % 2 === 0 ? 1 : 3);
  }, 0);
  return (10 - (sum % 10)) % 10;
}

export function isValidEan13(barcode: string) {
  return (
    /^\d{13}$/.test(barcode) &&
    ean13CheckDigit(barcode.slice(0, 12)) === Number(barcode[12])
  );
}

export function formatInternalEan13(payload: number) {
  const digits = String(payload).padStart(12, '0');
  return `${digits}${ean13CheckDigit(digits)}`;
}

/** The 12-digit payload of a valid in-store barcode, or null. */
export function internalEan13Payload(barcode: string | null | undefined) {
  if (!barcode || !barcode.startsWith('2') || !isValidEan13(barcode)) {
    return null;
  }
  const payload = Number(barcode.slice(0, 12));
  return Number.isInteger(payload) ? payload : null;
}

type BarcodeClient = Pick<
  Prisma.TransactionClient,
  'product' | 'productVariant'
>;

/**
 * Next free in-store barcodes, unique across the company's products and
 * variants so a scan never matches two items.
 */
export async function allocateInternalBarcodes(
  db: BarcodeClient,
  companyId: string,
  count: number,
  exclude: string[] = [],
) {
  const [productCodes, variantCodes] = await Promise.all([
    db.product.findMany({
      where: { companyId, barcode: { startsWith: '2' } },
      select: { barcode: true },
    }),
    db.productVariant.findMany({
      where: { companyId, barcode: { startsWith: '2' } },
      select: { barcode: true },
    }),
  ]);
  const taken = new Set<string>([
    ...exclude,
    ...productCodes.map((row) => row.barcode ?? ''),
    ...variantCodes.map((row) => row.barcode ?? ''),
  ]);
  let payload = [...taken].reduce<number>(
    (max, code) => Math.max(max, internalEan13Payload(code) ?? 0),
    INTERNAL_EAN13_MIN - 1,
  );
  const result: string[] = [];
  while (result.length < count) {
    payload += 1;
    if (payload > INTERNAL_EAN13_MAX) {
      throw new RangeError('Barcode range exceeded');
    }
    const barcode = formatInternalEan13(payload);
    if (!taken.has(barcode)) {
      taken.add(barcode);
      result.push(barcode);
    }
  }
  return result;
}

import { ProductSizeKind } from '@prisma/client';

/**
 * Normalizes a size code: trim, uppercase, XXL→2XL, XXXL→3XL, comma→period
 */
export function normalizeSizeCode(raw: string): string {
  if (!raw) return '';
  let code = raw.trim().toUpperCase();
  code = code.replace(/,/g, '.');
  code = code.replace(/^XXL$/, '2XL');
  code = code.replace(/^XXXL$/, '3XL');
  return code;
}

/**
 * Resolves size kind (CLOTHING vs SHOES) and optionally auto-creates.
 *
 * Rules:
 * 1. Try exact match in tenant's ProductSize by code → return kind
 * 2. If not found:
 *    - Pure number 30–50 (with optional .5) → SHOES
 *    - Letter code or R+number → CLOTHING
 *    - Otherwise → error
 * 3. If kind determined but size not in DB → auto-create with correct kind
 */
export async function resolveSize(
  rawCode: string,
  companyId: string,
  prisma: any,
  options?: { autoCreate?: boolean },
): Promise<{ kind: ProductSizeKind; sizeId?: string }> {
  const code = normalizeSizeCode(rawCode);

  if (!code) {
    throw new Error('Size code cannot be empty');
  }

  // Step 1: try exact match in tenant's sizes
  const existingSize = await prisma.productSize.findFirst({
    where: { companyId, code },
  });

  if (existingSize) {
    if (!existingSize.kind) {
      throw new Error(`Size ${code} has no kind defined`);
    }
    return {
      kind: existingSize.kind as ProductSizeKind,
      sizeId: existingSize.id,
    };
  }

  // Step 2: determine kind by pattern
  let determinedKind: ProductSizeKind | null = null;

  // Check if it's a shoe size (30–50 with optional .5)
  const numMatch = code.match(/^(\d{2})(\.\d)?$/);
  if (numMatch) {
    const num = parseFloat(code);
    if (num >= 30 && num <= 50) {
      determinedKind = 'SHOES';
    }
  }

  // Check if it's a letter code or Russian size (R40, R42, etc.)
  if (!determinedKind) {
    if (code.match(/^[A-Z]+$/)) {
      // All letters → clothing
      determinedKind = 'CLOTHING';
    } else if (code.match(/^R\d+$/)) {
      // R + number → clothing
      determinedKind = 'CLOTHING';
    }
  }

  if (!determinedKind) {
    throw new Error(`Cannot determine size kind for code ${code}`);
  }

  // Step 3: auto-create if enabled
  if (options?.autoCreate) {
    const created = await prisma.productSize.create({
      data: {
        companyId,
        code,
        name: code,
        kind: determinedKind,
        type: 'OTHER',
        isActive: true,
      },
    });
    return { kind: determinedKind, sizeId: created.id };
  }

  return { kind: determinedKind };
}

/**
 * Generate EAN-13 barcode with internal prefix (2) and check digit.
 * Prefix 2 is reserved for in-store use (internal barcodes).
 */
export function generateEAN13(): string {
  // Prefix: 2 (in-store use)
  // Then 11 random digits
  let code = '2';
  for (let i = 0; i < 11; i++) {
    code += Math.floor(Math.random() * 10);
  }

  // Calculate check digit (EAN-13 checksum)
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(code[i]);
    sum += digit * (i % 2 === 0 ? 1 : 3);
  }
  const checkDigit = (10 - (sum % 10)) % 10;

  return code + checkDigit;
}

/**
 * Generate unique EAN-13 for a tenant.
 * Ensures no collision in ProductVariant.barcode
 */
export async function generateUniqueEAN13(
  companyId: string,
  prisma: any,
  maxRetries: number = 100,
): Promise<string> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const barcode = generateEAN13();

    const existing = await prisma.productVariant.findFirst({
      where: { companyId, barcode },
    });

    if (!existing) {
      return barcode;
    }
  }

  throw new Error('Failed to generate unique EAN-13 after maximum retries');
}

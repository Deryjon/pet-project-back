import {
  allocateInternalBarcodes,
  ean13CheckDigit,
  formatInternalEan13,
  internalEan13Payload,
  isValidEan13,
} from './ean13';

describe('EAN-13', () => {
  it('computes GS1 check digits of known barcodes', () => {
    // Published EAN-13 examples.
    expect(ean13CheckDigit('400638133393')).toBe(1);
    expect(ean13CheckDigit('590123412345')).toBe(7);
    expect(ean13CheckDigit('460123456789')).toBe(3);
    expect(isValidEan13('4006381333931')).toBe(true);
    expect(isValidEan13('4006381333932')).toBe(false);
    expect(isValidEan13('400638133393')).toBe(false);
  });

  it('formats in-store codes in the 2xx range and reads them back', () => {
    const code = formatInternalEan13(200000000001);
    expect(code).toBe('2000000000015');
    expect(isValidEan13(code)).toBe(true);
    expect(internalEan13Payload(code)).toBe(200000000001);
    // Real (non 2xx) and broken codes are not in-store codes.
    expect(internalEan13Payload('4006381333931')).toBeNull();
    expect(internalEan13Payload('2000000000011')).toBeNull();
  });

  it('allocates unique valid codes after the highest one in use', async () => {
    const db = {
      product: {
        findMany: jest.fn().mockResolvedValue([
          { barcode: formatInternalEan13(200000000005) },
          { barcode: '4006381333931' },
        ]),
      },
      productVariant: {
        findMany: jest.fn().mockResolvedValue([{ barcode: formatInternalEan13(200000000001) }]),
      },
    };

    const codes = await allocateInternalBarcodes(db as any, 'company', 50, [
      formatInternalEan13(200000000006),
    ]);

    expect(codes).toHaveLength(50);
    expect(new Set(codes).size).toBe(50);
    expect(codes[0]).toBe(formatInternalEan13(200000000007));
    for (const code of codes) {
      expect(code).toMatch(/^2\d{12}$/);
      expect(isValidEan13(code)).toBe(true);
    }
  });
});

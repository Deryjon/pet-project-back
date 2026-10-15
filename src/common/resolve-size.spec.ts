import { isNoSizeMarker, normalizeSizeCode, generateEAN13, resolveSize } from './resolve-size';

describe('resolveSize', () => {
  const prisma = (sizes: Array<Record<string, unknown>>) => ({
    productSize: {
      findFirst: jest.fn(({ where }) =>
        Promise.resolve(sizes.find((size) => size.code === where.code) ?? null),
      ),
      // The company's active sizes; resolveSize compares them itself.
      findMany: jest.fn(() =>
        Promise.resolve(sizes.filter((size) => size.isActive !== false)),
      ),
      create: jest.fn(({ data }) => Promise.resolve({ id: 'new', ...data })),
    },
  });

  it('takes the kind of a preset size from its type', async () => {
    const db = prisma([
      { id: 's-legacy', code: 'LEGACYAB12', name: 'M', type: 'CLOTHING' },
    ]);

    await expect(resolveSize('LEGACYAB12', 'c1', db)).resolves.toEqual({
      kind: 'CLOTHING',
      sizeId: 's-legacy',
    });
  });

  it('finds a migrated size by its name instead of creating a duplicate', async () => {
    const db = prisma([
      { id: 's-legacy', code: 'LEGACYAB12', name: 'M', type: 'CLOTHING' },
    ]);

    await expect(
      resolveSize('m', 'c1', db, { autoCreate: true }),
    ).resolves.toEqual({ kind: 'CLOTHING', sizeId: 's-legacy' });
    expect(db.productSize.create).not.toHaveBeenCalled();
  });

  it('narrows a shared name by the kind the code implies', async () => {
    const db = prisma([
      { id: 's-clothing', code: 'L1', name: '42', type: 'CLOTHING' },
      { id: 's-shoes', code: 'L2', name: '42', type: 'SHOES' },
    ]);

    await expect(resolveSize('42', 'c1', db)).resolves.toEqual({
      kind: 'SHOES',
      sizeId: 's-shoes',
    });
  });

  it('refuses a name that stays ambiguous', async () => {
    const db = prisma([
      { id: 's-1', code: 'L1', name: 'Free', type: 'OTHER' },
      { id: 's-2', code: 'L2', name: 'free', type: 'OTHER' },
    ]);

    await expect(resolveSize('Free', 'c1', db)).rejects.toThrow('неоднозначен');
  });

  it('creates an unknown size with the kind of its code', async () => {
    const db = prisma([]);

    await expect(
      resolveSize('xxl', 'c1', db, { autoCreate: true }),
    ).resolves.toEqual({ kind: 'CLOTHING', sizeId: 'new', created: true });
    expect(db.productSize.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ code: '2XL', type: 'CLOTHING' }),
    });
  });

  it.each(['XXL', 'xxl', 'ХХЛ', '2 XL', '2-xl'])(
    'finds the existing 2XL for %p instead of creating a duplicate',
    async (value) => {
      const db = prisma([
        { id: 's-2xl', code: '2XL', name: '2XL', kind: 'CLOTHING', type: 'CLOTHING' },
      ]);
      await expect(
        resolveSize(value, 'c1', db, { autoCreate: true }),
      ).resolves.toEqual({ kind: 'CLOTHING', sizeId: 's-2xl' });
      expect(db.productSize.create).not.toHaveBeenCalled();
    },
  );

  it('finds a size saved earlier as "XXL" by its name', async () => {
    const db = prisma([
      { id: 's-old', code: 'XXL', name: 'XXL', type: 'CLOTHING' },
    ]);
    await expect(
      resolveSize('2xl', 'c1', db, { autoCreate: true }),
    ).resolves.toEqual({ kind: 'CLOTHING', sizeId: 's-old' });
  });

  it('finds shoe size 42 for "42.0"', async () => {
    const db = prisma([
      { id: 's-42', code: 'S42', name: '42', kind: 'SHOES', type: 'SHOES' },
    ]);
    await expect(
      resolveSize('42.0', 'c1', db, { autoCreate: true }),
    ).resolves.toEqual({ kind: 'SHOES', sizeId: 's-42' });
  });

  it('explains an unreadable size in Russian', async () => {
    await expect(resolveSize('???', 'c1', prisma([]))).rejects.toThrow(
      'не распознан',
    );
  });
});

describe('resolve-size', () => {
  describe('normalizeSizeCode', () => {
    it('should trim and uppercase', () => {
      expect(normalizeSizeCode('  m  ')).toBe('M');
      expect(normalizeSizeCode('s')).toBe('S');
    });

    it('should convert XXL to 2XL', () => {
      expect(normalizeSizeCode('XXL')).toBe('2XL');
    });

    it('should convert XXXL to 3XL', () => {
      expect(normalizeSizeCode('XXXL')).toBe('3XL');
    });

    it('should replace comma with period', () => {
      expect(normalizeSizeCode('42,5')).toBe('42.5');
    });

    it('should handle multiple transformations', () => {
      expect(normalizeSizeCode('  42,5  ')).toBe('42.5');
    });

    it('should return empty string for empty input', () => {
      expect(normalizeSizeCode('')).toBe('');
      expect(normalizeSizeCode('  ')).toBe('');
    });

    it('should preserve valid codes', () => {
      expect(normalizeSizeCode('40 (RU)')).toBe('40 (RU)');
      expect(normalizeSizeCode('R40')).toBe('R40');
      expect(normalizeSizeCode('35.5')).toBe('35.5');
    });
  });

  describe('generateEAN13', () => {
    it('should generate 13-digit code', () => {
      const ean = generateEAN13();
      expect(ean).toHaveLength(13);
      expect(/^\d{13}$/.test(ean)).toBe(true);
    });

    it('should start with 2 (in-store prefix)', () => {
      const ean = generateEAN13();
      expect(ean[0]).toBe('2');
    });

    it('should have valid checksum', () => {
      const ean = generateEAN13();
      let sum = 0;
      for (let i = 0; i < 12; i++) {
        const digit = parseInt(ean[i]);
        sum += digit * (i % 2 === 0 ? 1 : 3);
      }
      const checkDigit = (10 - (sum % 10)) % 10;
      expect(parseInt(ean[12])).toBe(checkDigit);
    });

    it('should generate different codes', () => {
      const ean1 = generateEAN13();
      const ean2 = generateEAN13();
      expect(ean1).not.toBe(ean2);
    });
  });
});

describe('no-size cells of the import', () => {
  it.each(['', '  ', '-', '—', 'Без размера', 'one size', 'ONE SIZE', 'OS', 'б/р', 'Единый'])(
    '%p means no size',
    (value) => {
      expect(isNoSizeMarker(value)).toBe(true);
    },
  );

  it.each(['M', '42', 'XL', '2XL', 'S/M'])('%p is a size', (value) => {
    expect(isNoSizeMarker(value)).toBe(false);
  });
});

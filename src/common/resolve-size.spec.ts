import { normalizeSizeCode, generateEAN13 } from './resolve-size';

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

import {
  normalizeProductPhotoForStorage,
  resolveProductPhotoUrl,
} from './product-photo.util';

describe('product-photo.util', () => {
  const originalAppUrl = process.env.APP_URL;
  const originalPort = process.env.PORT;

  afterEach(() => {
    process.env.APP_URL = originalAppUrl;
    process.env.PORT = originalPort;
  });

  describe('resolveProductPhotoUrl', () => {
    it('rebuilds a stale absolute host onto the current APP_URL', () => {
      process.env.APP_URL = 'https://api.konkurent-group.uz';

      expect(
        resolveProductPhotoUrl('http://localhost:3001/uploads/products/a.jpg'),
      ).toBe('https://api.konkurent-group.uz/uploads/products/a.jpg');
    });

    it('builds an absolute URL from a relative path', () => {
      process.env.APP_URL = 'https://api.konkurent-group.uz';

      expect(resolveProductPhotoUrl('/uploads/products/a.jpg')).toBe(
        'https://api.konkurent-group.uz/uploads/products/a.jpg',
      );
    });

    it('builds an absolute URL from a bare filename', () => {
      process.env.APP_URL = 'https://api.konkurent-group.uz';

      expect(resolveProductPhotoUrl('a.jpg')).toBe(
        'https://api.konkurent-group.uz/uploads/products/a.jpg',
      );
    });

    it('leaves external URLs untouched', () => {
      expect(resolveProductPhotoUrl('https://cdn.example.com/a.jpg')).toBe(
        'https://cdn.example.com/a.jpg',
      );
    });

    it('leaves data URIs untouched', () => {
      const dataUri = 'data:image/png;base64,abc123';
      expect(resolveProductPhotoUrl(dataUri)).toBe(dataUri);
    });

    it('returns undefined for empty values', () => {
      expect(resolveProductPhotoUrl(null)).toBeUndefined();
      expect(resolveProductPhotoUrl('')).toBeUndefined();
    });
  });

  describe('normalizeProductPhotoForStorage', () => {
    it('strips a stale absolute host down to a relative path', () => {
      expect(
        normalizeProductPhotoForStorage(
          'http://localhost:3001/uploads/products/a.jpg',
        ),
      ).toBe('/uploads/products/a.jpg');
    });

    it('keeps an already-relative path as-is', () => {
      expect(normalizeProductPhotoForStorage('/uploads/products/a.jpg')).toBe(
        '/uploads/products/a.jpg',
      );
    });

    it('turns a bare filename into a relative path', () => {
      expect(normalizeProductPhotoForStorage('a.jpg')).toBe(
        '/uploads/products/a.jpg',
      );
    });

    it('keeps external URLs as absolute', () => {
      expect(
        normalizeProductPhotoForStorage('https://cdn.example.com/a.jpg'),
      ).toBe('https://cdn.example.com/a.jpg');
    });
  });
});

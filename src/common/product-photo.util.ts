const UPLOADS_MARKER = '/uploads/';

function getProductPhotoOrigin() {
  return (
    process.env.APP_URL?.trim() ||
    `http://localhost:${process.env.PORT?.trim() || '3001'}`
  );
}

/**
 * Builds the absolute URL to serve for a stored photo/image value.
 * Any value that references our own uploads directory is always rebuilt
 * against the current APP_URL, even if it was previously saved as an
 * absolute URL with a stale host (e.g. a leftover http://localhost:3001/...).
 * External URLs (not pointing at our uploads dir) and data URIs pass through untouched.
 */
export function resolveProductPhotoUrl(
  value: string | null | undefined,
): string | undefined {
  const src = String(value ?? '').trim();
  if (!src) {
    return undefined;
  }

  if (src.startsWith('data:')) {
    return src;
  }

  const markerIndex = src.indexOf(UPLOADS_MARKER);
  if (markerIndex !== -1) {
    return `${getProductPhotoOrigin()}${src.slice(markerIndex)}`;
  }

  if (/^(https?:)?\/\//i.test(src)) {
    return src;
  }

  if (!src.includes('/')) {
    return `${getProductPhotoOrigin()}/uploads/products/${src}`;
  }

  return src;
}

/**
 * Normalizes a photo/image value for persistence in the DB.
 * Values that point at our own uploads directory are stored as a relative
 * path (/uploads/products/xxx.ext) so a future APP_URL/domain change never
 * requires a data migration. Genuine external URLs are kept as-is.
 */
export function normalizeProductPhotoForStorage(
  value: string | null | undefined,
): string | undefined {
  const src = String(value ?? '').trim();
  if (!src) {
    return undefined;
  }

  if (src.startsWith('data:')) {
    return src;
  }

  const markerIndex = src.indexOf(UPLOADS_MARKER);
  if (markerIndex !== -1) {
    return src.slice(markerIndex);
  }

  if (/^(https?:)?\/\//i.test(src)) {
    return src;
  }

  if (!src.includes('/')) {
    return `/uploads/products/${src}`;
  }

  return src.startsWith('/') ? src : `/${src}`;
}

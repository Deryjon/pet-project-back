// Uploaded images are trusted by their bytes, never by the client's file
// name or Content-Type: a renamed HTML/SVG file must not end up served from
// /uploads as a page.
export type ImageKind = 'jpg' | 'png' | 'webp';

export const PUBLIC_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];

export function detectImageKind(buffer: Buffer | undefined): ImageKind | null {
  if (!buffer || buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'jpg';
  }
  if (
    buffer[0] === 0x89 &&
    buffer.toString('ascii', 1, 4) === 'PNG' &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a
  ) {
    return 'png';
  }
  if (
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'webp';
  }
  return null;
}

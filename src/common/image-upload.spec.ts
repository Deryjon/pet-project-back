import { detectImageKind } from './image-upload';

const bytes = (...values: number[]) =>
  Buffer.concat([Buffer.from(values), Buffer.alloc(16)]);

describe('detectImageKind', () => {
  it('recognises jpg, png and webp by their bytes', () => {
    expect(detectImageKind(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('jpg');
    expect(
      detectImageKind(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)),
    ).toBe('png');
    expect(
      detectImageKind(
        Buffer.concat([
          Buffer.from('RIFF'),
          Buffer.alloc(4),
          Buffer.from('WEBPVP8 '),
        ]),
      ),
    ).toBe('webp');
  });

  it('rejects html, svg and empty files whatever their name says', () => {
    expect(
      detectImageKind(Buffer.from('<html><script>x</script></html>')),
    ).toBeNull();
    expect(
      detectImageKind(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')),
    ).toBeNull();
    expect(detectImageKind(Buffer.alloc(0))).toBeNull();
    expect(detectImageKind(undefined)).toBeNull();
  });
});

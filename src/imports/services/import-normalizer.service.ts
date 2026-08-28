import { Injectable } from '@nestjs/common';

const TOKENS: Record<string, string> = {
  pm: 'pro max',
  blk: 'black',
  bk: 'black',
  qora: 'black',
  чер: 'black',
  черный: 'black',
  wh: 'white',
  wht: 'white',
  oq: 'white',
  бел: 'white',
};

@Injectable()
export class ImportNormalizerService {
  normalize(value: string) {
    let text = String(value ?? '')
      .normalize('NFKC')
      .toLowerCase()
      .replace(/(\d+)(pm)\b/g, 'iphone $1 pro max')
      .replace(/(\d+)(p)\b/g, 'iphone $1 pro')
      .replace(/([a-zа-я])([0-9])/gi, '$1 $2')
      .replace(/([0-9])([a-zа-я])/gi, '$1 $2')
      .replace(/[^a-zа-я0-9]+/gi, ' ')
      .trim();

    text = text
      .split(/\s+/)
      .map((token) => TOKENS[token] ?? token)
      .join(' ');
    return text.replace(/\s+/g, ' ').trim();
  }

  importantFeatures(value: string) {
    const normalized = this.normalize(value);
    return {
      model: normalized.match(/iphone\s+\d+\s+(?:pro max|pro)?/)?.[0] ?? null,
      color:
        normalized.match(
          /\b(?:black|white|blue|green|red|pink|gold|silver)\b/,
        )?.[0] ?? null,
      capacity:
        normalized.match(/\b\d+\s*(?:gb|tb)\b/)?.[0]?.replace(/\s/g, '') ??
        null,
      power: normalized.match(/\b\d+\s*w\b/)?.[0]?.replace(/\s/g, '') ?? null,
      connector: normalized.match(/\b(?:usb c|lightning)\b/)?.[0] ?? null,
      size:
        normalized.match(/\b\d+(?:\.\d+)?\s*mm\b/)?.[0]?.replace(/\s/g, '') ??
        null,
    };
  }
}

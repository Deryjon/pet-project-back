import { Injectable } from '@nestjs/common';

// Colour words of the region mapped to one spelling, for every business type.
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

/**
 * How invoice lines of one company are read. deviceShorthand turns on the
 * electronics reading used by phone accessory stores ("15pm" = iPhone 15 Pro
 * Max, GB/W/connector features); vocabularies are the company's own attribute
 * values (colours, sizes, custom lists) that must not differ between an
 * invoice line and the product it is matched to.
 */
export type NormalizerProfile = {
  deviceShorthand: boolean;
  vocabularies: Array<{ code: string; values: string[] }>;
};

// The reading every company had before profiles existed.
export const LEGACY_NORMALIZER_PROFILE: NormalizerProfile = {
  deviceShorthand: true,
  vocabularies: [],
};

@Injectable()
export class ImportNormalizerService {
  normalize(
    value: string,
    profile: Pick<NormalizerProfile, 'deviceShorthand'> = LEGACY_NORMALIZER_PROFILE,
  ) {
    let text = String(value ?? '')
      .normalize('NFKC')
      .toLowerCase();
    if (profile.deviceShorthand) {
      text = text
        .replace(/(\d+)(pm)\b/g, 'iphone $1 pro max')
        .replace(/(\d+)(p)\b/g, 'iphone $1 pro');
    }
    text = text
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

  importantFeatures(
    value: string,
    profile: NormalizerProfile = LEGACY_NORMALIZER_PROFILE,
  ): Record<string, string | null> {
    const normalized = this.normalize(value, profile);
    const features: Record<string, string | null> = profile.deviceShorthand
      ? this.deviceFeatures(normalized)
      : {};
    const padded = ` ${normalized} `;
    for (const vocabulary of profile.vocabularies) {
      // Longest value first: "темно синий" wins over "синий".
      const match = vocabulary.values
        .map((option) => this.normalize(option, profile))
        .filter(Boolean)
        .sort((a, b) => b.length - a.length)
        .find((option) => padded.includes(` ${option} `));
      features[`attribute:${vocabulary.code}`] = match ?? null;
    }
    return features;
  }

  private deviceFeatures(normalized: string) {
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

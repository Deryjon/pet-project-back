import {
  isCollectionCode,
  normalizeColorCode,
  normalizeSeasonCode,
  normalizeSizeCode,
} from './normalize-attribute-code';

// Proposes the dictionary value for a legacy colour/size/season of a store.
// Used read-only by attributes:audit, by attributes:apply on the reviewed CSV
// and by the product form when it links a picked value to a legacy row.

export type MatchStatus =
  /** The legacy value is the dictionary code as is. */
  | 'exact'
  /** Another spelling of a dictionary code (XXL → 2XL, "Белый" → #FFFFFF). */
  | 'alias'
  /** A clear code missing from the dictionary: a store value would be created. */
  | 'new'
  /** Nothing safe to propose: the owner picks the value. */
  | 'manual';

export type DictionaryEntry = {
  id: string;
  code: string;
  name: string | null;
  group: string | null;
  companyId: string | null;
};

export type Match = {
  status: MatchStatus;
  code: string | null;
  group: string | null;
  value: DictionaryEntry | null;
  note: string;
};

const manual = (note: string): Match => ({
  status: 'manual',
  code: null,
  group: null,
  value: null,
  note,
});

function plainName(value: string | null | undefined) {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ');
}

const LEGACY_CODE = /^LEGACY[0-9A-F]+$/;

export function matchLegacyColor(
  legacy: {
    name: string;
    nameRu?: string | null;
    code?: string | null;
    hex?: string | null;
  },
  dictionary: DictionaryEntry[],
): Match {
  let hex: string | null = null;
  for (const raw of [
    legacy.hex,
    legacy.code?.startsWith('#') ? legacy.code : null,
  ]) {
    if (!raw) continue;
    try {
      hex = normalizeColorCode(raw);
      break;
    } catch {
      // not a HEX value
    }
  }
  if (hex) {
    const byHex = dictionary.find((entry) => entry.code === hex);
    if (byHex) {
      const same = (legacy.hex ?? '').trim() === hex;
      return {
        status: same ? 'exact' : 'alias',
        code: hex,
        group: null,
        value: byHex,
        note: `HEX ${hex}`,
      };
    }
  }
  const names = new Set(
    [plainName(legacy.name), plainName(legacy.nameRu)].filter(Boolean),
  );
  const byName = dictionary.filter(
    (entry) => entry.name && names.has(plainName(entry.name)),
  );
  if (byName.length === 1) {
    return {
      status: 'alias',
      code: byName[0].code,
      group: null,
      value: byName[0],
      note: hex ? `по названию; HEX ${hex} отличается` : 'по названию',
    };
  }
  if (hex) {
    return {
      status: 'new',
      code: hex,
      group: null,
      value: null,
      note: 'свой цвет по HEX',
    };
  }
  return manual('нет HEX и названия из справочника');
}

/** Sizes the legacy kind may map to. */
function groupsForKind(kind: string | null | undefined) {
  if (kind === 'SHOES') return ['NUM_SHOES'];
  if (kind === 'CLOTHING') return ['LETTER', 'NUM_BOTTOM', 'NUM_TOP'];
  return null;
}

function russianSize(raw: string) {
  return raw.match(/^R(\d{2})$/i) ?? raw.match(/^(\d{2})\s*\(RU\)$/i);
}

export function matchLegacySize(
  legacy: {
    code?: string | null;
    name: string;
    nameRu?: string | null;
    kind?: string | null;
    type?: string | null;
  },
  dictionary: DictionaryEntry[],
  storeGroups: string[],
): Match {
  const kind =
    legacy.kind ??
    (legacy.type === 'SHOES' || legacy.type === 'CLOTHING'
      ? legacy.type
      : null);
  const allowed = (groupsForKind(kind) ?? storeGroups).filter((group) =>
    storeGroups.includes(group),
  );
  const raws = [legacy.code, legacy.name, legacy.nameRu]
    .map((raw) => (raw ?? '').trim())
    .filter((raw) => raw && !LEGACY_CODE.test(raw));

  for (const raw of raws) {
    // "48 (RU)" / R48 of the old presets: Russian 48–58 are the NUM_TOP sizes;
    // 40–46 have no system value and are left to the owner.
    const ru = russianSize(raw);
    if (ru) {
      const entry = dictionary.find(
        (item) => item.group === 'NUM_TOP' && item.code === ru[1],
      );
      if (entry && allowed.includes('NUM_TOP')) {
        return {
          status: 'alias',
          code: entry.code,
          group: 'NUM_TOP',
          value: entry,
          note: `российский ${ru[1]}`,
        };
      }
      continue;
    }
    let code: string;
    try {
      code = normalizeSizeCode(raw);
    } catch {
      continue;
    }
    const entries = dictionary.filter(
      (item) =>
        item.code === code &&
        (item.group === null || allowed.includes(item.group)),
    );
    if (entries.length > 1) {
      return manual(
        `код ${code} есть в нескольких группах: ${entries.map((e) => e.group).join(', ')}`,
      );
    }
    if (entries.length === 1) {
      return {
        status: raw === code ? 'exact' : 'alias',
        code,
        group: entries[0].group,
        value: entries[0],
        note: raw === code ? '' : `${raw} → ${code}`,
      };
    }
  }

  for (const raw of raws) {
    if (russianSize(raw)) continue;
    let code: string;
    try {
      code = normalizeSizeCode(raw);
    } catch {
      continue;
    }
    const numeric = /^\d+(\.\d+)?$/.test(code);
    const group =
      allowed.length === 1
        ? allowed[0]
        : !numeric && allowed.includes('LETTER')
          ? 'LETTER'
          : null;
    if (group)
      return {
        status: 'new',
        code,
        group,
        value: null,
        note: `свой размер ${code}`,
      };
  }
  return manual('размер не распознан или неоднозначен');
}

const SEASON_NAMES: Record<string, string> = {
  весна: 'SPRING',
  лето: 'SUMMER',
  осень: 'AUTUMN',
  зима: 'WINTER',
  демисезон: 'DEMI',
  демисезонный: 'DEMI',
  всесезон: 'ALL',
  всесезонный: 'ALL',
  'круглый год': 'ALL',
};

export function matchLegacySeason(
  legacy: { code: string; nameRu?: string | null },
  dictionary: DictionaryEntry[],
): Match {
  const timeOfYear = dictionary.filter(
    (entry) => entry.group === 'TIME_OF_YEAR',
  );
  try {
    const code = normalizeSeasonCode(legacy.code);
    const entry = timeOfYear.find((item) => item.code === code);
    if (entry) {
      return {
        status: legacy.code === code ? 'exact' : 'alias',
        code,
        group: 'TIME_OF_YEAR',
        value: entry,
        note: '',
      };
    }
  } catch {
    // fall through to the name
  }
  const byName = SEASON_NAMES[plainName(legacy.nameRu)];
  const entry = byName
    ? timeOfYear.find((item) => item.code === byName)
    : undefined;
  if (entry) {
    return {
      status: 'alias',
      code: entry.code,
      group: 'TIME_OF_YEAR',
      value: entry,
      note: 'по названию',
    };
  }
  return manual('сезон не распознан');
}

export function matchCollection(
  text: string,
  dictionary: DictionaryEntry[],
): Match {
  let code: string;
  try {
    code = normalizeSeasonCode(text);
  } catch {
    return manual('не код коллекции SS/FW + год');
  }
  if (!isCollectionCode(code)) return manual('не код коллекции SS/FW + год');
  const entry = dictionary.find(
    (item) => item.group === 'COLLECTION' && item.code === code,
  );
  const status = entry ? (text === code ? 'exact' : 'alias') : 'new';
  return {
    status,
    code,
    group: 'COLLECTION',
    value: entry ?? null,
    note: entry ? '' : `своя коллекция ${code}`,
  };
}

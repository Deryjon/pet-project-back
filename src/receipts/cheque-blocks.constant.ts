// Mirrors how Billz models a cheque: a company-wide, ordered list of toggleable
// blocks (cheque_items), each carrying a block_type grouping. Unlike Billz, the
// actual displayed value for most blocks (shop name, address, phone, socials,
// legal name, INN) is resolved live from Shop / CompanyProfileSetting at render
// time rather than duplicated onto the settings row — only blocks with no other
// natural home (logo, footer text, QR) keep a value field on ChequeSettings.
export type ChequeBlockType =
  | 'information_block'
  | 'lower_block'
  | 'customer_balance'
  | 'customer_debt';

export interface ChequeBlockDefinition {
  key: string;
  blockType: ChequeBlockType;
  name: string;
  sequenceNumber: number;
  isActive: boolean;
}

export const DEFAULT_CHEQUE_BLOCKS: ChequeBlockDefinition[] = [
  // information_block
  { key: 'shop_name', blockType: 'information_block', name: 'Название магазина', sequenceNumber: 10, isActive: true },
  { key: 'date', blockType: 'information_block', name: 'Дата и время', sequenceNumber: 20, isActive: true },
  { key: 'working_hours', blockType: 'information_block', name: 'Часы работы', sequenceNumber: 30, isActive: false },
  { key: 'cashier', blockType: 'information_block', name: 'Кассир', sequenceNumber: 40, isActive: true },
  { key: 'cashier_phone', blockType: 'information_block', name: 'Телефон кассира', sequenceNumber: 50, isActive: false },
  { key: 'client', blockType: 'information_block', name: 'Клиент', sequenceNumber: 60, isActive: true },
  { key: 'client_phone', blockType: 'information_block', name: 'Телефон клиента', sequenceNumber: 70, isActive: true },
  { key: 'contacts', blockType: 'information_block', name: 'Контакты магазина', sequenceNumber: 80, isActive: false },
  { key: 'address', blockType: 'information_block', name: 'Адрес', sequenceNumber: 90, isActive: false },
  { key: 'legal_name', blockType: 'information_block', name: 'Юридическое лицо', sequenceNumber: 100, isActive: false },
  { key: 'tax_id', blockType: 'information_block', name: 'ИНН', sequenceNumber: 110, isActive: false },
  { key: 'show_products', blockType: 'information_block', name: 'Показывать товары', sequenceNumber: 120, isActive: true },
  { key: 'item_index', blockType: 'information_block', name: 'Нумерация товаров', sequenceNumber: 130, isActive: true },
  { key: 'item_discounts', blockType: 'information_block', name: 'Скидки на товары', sequenceNumber: 140, isActive: false },
  { key: 'item_sums', blockType: 'information_block', name: 'Суммы по товарам', sequenceNumber: 150, isActive: true },
  { key: 'item_count', blockType: 'information_block', name: 'Количество товаров в чеке', sequenceNumber: 160, isActive: false },
  { key: 'receipt_discount', blockType: 'information_block', name: 'Скидка на чек', sequenceNumber: 170, isActive: true },
  { key: 'receipt_sum', blockType: 'information_block', name: 'Итоговая сумма чека', sequenceNumber: 180, isActive: true },
  { key: 'cashback', blockType: 'information_block', name: 'Кешбек', sequenceNumber: 190, isActive: true },
  { key: 'qr_code', blockType: 'information_block', name: 'QR-код', sequenceNumber: 200, isActive: false },

  // customer_balance
  { key: 'balance_before', blockType: 'customer_balance', name: 'Баланс до покупки', sequenceNumber: 210, isActive: false },
  { key: 'balance_added', blockType: 'customer_balance', name: 'Начислено на баланс', sequenceNumber: 220, isActive: false },
  { key: 'balance_deducted', blockType: 'customer_balance', name: 'Списано с баланса', sequenceNumber: 230, isActive: false },
  { key: 'balance_after', blockType: 'customer_balance', name: 'Баланс после покупки', sequenceNumber: 240, isActive: false },

  // customer_debt
  { key: 'debt_before', blockType: 'customer_debt', name: 'Долг до покупки', sequenceNumber: 250, isActive: false },
  { key: 'debt_added', blockType: 'customer_debt', name: 'Добавлено к долгу', sequenceNumber: 260, isActive: false },
  { key: 'debt_paid', blockType: 'customer_debt', name: 'Погашено долга', sequenceNumber: 270, isActive: false },
  { key: 'debt_after', blockType: 'customer_debt', name: 'Долг после покупки', sequenceNumber: 280, isActive: false },

  // lower_block
  { key: 'barcode', blockType: 'lower_block', name: 'Штрих-код', sequenceNumber: 290, isActive: false },
  { key: 'facebook', blockType: 'lower_block', name: 'Facebook', sequenceNumber: 300, isActive: false },
  { key: 'instagram', blockType: 'lower_block', name: 'Instagram', sequenceNumber: 310, isActive: false },
  { key: 'telegram', blockType: 'lower_block', name: 'Telegram', sequenceNumber: 320, isActive: false },
  { key: 'website', blockType: 'lower_block', name: 'Сайт', sequenceNumber: 330, isActive: false },
  { key: 'footer_message', blockType: 'lower_block', name: 'Текст благодарности', sequenceNumber: 340, isActive: true },
  { key: 'footer_note', blockType: 'lower_block', name: 'Примечание', sequenceNumber: 350, isActive: false },
];

export const CHEQUE_BLOCK_KEYS = new Set(DEFAULT_CHEQUE_BLOCKS.map((b) => b.key));

/**
 * Merges a company's stored block list with the current catalog: keeps the
 * company's is_active/sequence_number choices, appends any catalog blocks the
 * company doesn't have yet (schema evolution), and drops stored blocks whose
 * key no longer exists in the catalog.
 */
export function reconcileChequeBlocks(stored: unknown): ChequeBlockDefinition[] {
  const storedArr = Array.isArray(stored) ? (stored as Partial<ChequeBlockDefinition>[]) : [];
  const storedByKey = new Map(storedArr.filter((b) => b && typeof b.key === 'string').map((b) => [b.key as string, b]));

  return DEFAULT_CHEQUE_BLOCKS.map((def) => {
    const existing = storedByKey.get(def.key);
    return {
      key: def.key,
      blockType: def.blockType,
      name: def.name,
      sequenceNumber: typeof existing?.sequenceNumber === 'number' ? existing.sequenceNumber : def.sequenceNumber,
      isActive: typeof existing?.isActive === 'boolean' ? existing.isActive : def.isActive,
    };
  });
}

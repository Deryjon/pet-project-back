# Чеки

**Последнее обновление:** 2026-10-16

Документ описывает, как формируется чек (`Receipt`), как устроены шаблоны печати (`ChequeSettings`), как чек отображается во фронтенде и как ошибки доходят до пользователя.

Термины:

- **Чек** — `Receipt`, один на продажу (`saleId` уникален). Хранит снимок данных продажи.
- **Шаблон чека** — `ChequeSettings`, настройки оформления и состав блоков. У компании их несколько, но `isDefault` стоит ровно у одного.
- **Приход** — это поставка товара от поставщика (`SupplierInvoice`), **не чек**. Страница `pages/products/receipts/[id].vue` показывает именно приход. См. [import.md](./import.md).

Связанные документы: [api.md](./api.md#чеки-и-шаблоны-receiptscontroller), [data-model.md](./data-model.md), [architecture.md](./architecture.md#64-чек).

---

## 1. Формирование чека

Файлы: `src/receipts/receipts.service.ts` (`getOrCreateForSale`, `buildSnapshot`, `markPrinted`), `src/receipts/receipts.controller.ts`.

### 1.1 Когда создаётся

Запись `Receipt` создаётся **лениво**, при первом запросе чека по продаже:

- `GET /api/receipts/:saleId` (и алиас `v1`);
- `GET /api/receipts/by-number/:number` (ищет продажу по номеру и вызывает то же);
- `POST /api/receipts` с телом `{ "sale_id": 123 }`;
- `POST /api/receipts/:saleId/mark-printed` (сначала гарантирует наличие чека).

То есть `GET` может создать запись. Это ожидаемое поведение, а не побочный эффект ошибки.

### 1.2 Алгоритм `getOrCreateForSale(saleId, companyId, allowedBranchCodes)`

1. Загрузить продажу `Sale` с `items` (включая `seller`), `user`, `client`, `clientDebts`. Условия: `id`, `companyId`, и если передан список филиалов, то `branchCode in allowedBranchCodes`. Не найдено: 404 `Sale not found` (и предупреждение в логе с `saleId` и `companyId`).
2. Найти `Receipt` по `saleId`. Если есть и поле `items` заполнено, вернуть его.
3. Если `Receipt` нет:
   - определить филиал по `branchCode`;
   - построить **снимок** (`buildSnapshot`): строки, суммы, скидка, оплаты, баланс и долг клиента;
   - создать `Receipt` с номером продажи, данными менеджера и клиента, `qrPayload = <FRONTEND_URL>/order/all?receipt=<number>`;
   - **гонка:** если параллельный запрос создал чек раньше, Prisma вернёт `P2002`. Тогда чек перечитывается, и ответ успешный (не 409). Логируется `debug`.
4. Если `Receipt` есть, но `items` = `null` (запись создана до появления полей снимка), снимок пересчитывается **один раз** и сохраняется (backfill).

### 1.3 Снимок (что фиксируется)

Снимок «замораживается» при первом формировании и не пересчитывается при повторной печати. Поля `Receipt`:

- строки: `items` (Json: `name`, `sku`, `quantity`, `price`, `total`, `discount`, `discountPercent`);
- суммы: `subtotal`, `discount`, `discountPercent`, `totalDue`, `cashbackEarned`;
- оплата: `paidCash`, `paidCard`, `paidCashback`, `debt`;
- клиент: `balanceBefore`, `balanceAdded`, `balanceDeducted`, `balanceAfter`, `debtBefore`, `debtAdded`, `debtPaid`, `debtAfter`;
- сотрудник: `managerName`, `managerPhone`, `sellerName`;
- клиент (текст): `clientName`, `clientPhone`, `saleComment`.

Поэтому чек, напечатанный сегодня и перепечатанный через полгода, одинаков, даже если цены и типы оплаты изменились.

### 1.4 Статусы и печать

`Receipt.status`: `CREATED` (по умолчанию), `PRINTED` (после `mark-printed`), `SENT` (зарезервирован: отправка в Telegram отложена, см. комментарий в `receipts.controller.ts`).

`POST /api/receipts/:saleId/mark-printed` ставит `status = PRINTED` и `printedAt = now()`. Ответ: `{ "id", "status", "printed_at" }`.

### 1.5 Ответ чека

Поля ответа (`assembleResponse`): `id`, `sale_id`, `number`, `status`, `created_at` (время продажи), `shop_id`, `branch_code`, `manager_name`, `manager_phone`, `seller_name`, `client_name`, `client_phone`, `sale_comment`, `items`, `item_count` (сумма количеств), `currency` (всегда `UZS`), `subtotal`, `discount`, `discount_percent`, `cashback_earned`, `total_due`, `paid_cash`, `paid_card`, `paid_cashback`, `loyalty_type` (`cashback` или `bonus`), `debt`, `balance_*`, `debt_*`, `qr_payload`, `printed_at`, `sent_at`, `shop` (название, адрес, телефон, часы работы, Facebook, Instagram, Telegram, сайт), `company` (юридические данные из `CompanyProfileSetting`).

Блоки `shop` и `company` берутся **живыми** (из `Shop` и `CompanyProfileSetting`) на момент запроса, а не из снимка. Это значит, что смена адреса филиала повлияет на перепечатку. Снимок касается только денег и строк.

---

## 2. Шаблоны чека

Файлы: `src/receipts/cheque-blocks.constant.ts`, `receipts.service.ts` (`getChequeSettings`, `updateChequeTemplate`, `reconcileTemplate`), DTO в `src/receipts/dto/`.

### 2.1 Модель

- У компании может быть много шаблонов (`ChequeSettings`). Один из них `isDefault = true` и используется по умолчанию.
- Шаблон для конкретного устройства выбирается параметром `template_id` у `GET /api/cheque-settings`. Если шаблона нет или он чужой, используется шаблон по умолчанию (чек не падает).
- Если основного шаблона нет, при первом обращении создаётся `Стандартный` (`getOrCreateDefaultChequeTemplate`). Если есть шаблоны, но ни один не основной, первый по дате создания становится основным.
- Нельзя снять «по умолчанию» с основного шаблона и нельзя удалить основной. Нужно сначала назначить другой.

### 2.2 Блоки

`blocks` — упорядоченный список блоков. У каждого: `key`, `block_type`, `name`, `sequence_number`, `is_active`.

| `block_type` | Что показывает | Примеры `key` |
|---|---|---|
| `information_block` | шапка и строки товаров | `shop_name`, `date`, `cashier`, `client`, `contacts`, `item_index`, `item_sums`, `receipt_sum`, `cashback` |
| `customer_balance` | баланс клиента | `balance_before`, `balance_added`, `balance_deducted`, `balance_after` |
| `customer_debt` | долг клиента | `debt_before`, `debt_added`, `debt_paid`, `debt_after` |
| `lower_block` | подвал | `barcode`, `facebook`, `instagram`, `telegram`, `website`, `footer_message`, `footer_note`, `qr_code`, `branding` |

Полный список и значения по умолчанию: `DEFAULT_CHEQUE_BLOCKS` в `cheque-blocks.constant.ts`. По умолчанию включены, например, `shop_name`, `date`, `cashier`, `client`, `receipt_sum`, `footer_message`, `branding`.

Значения вроде названия филиала, адреса и телефонов **не хранятся в блоке**: они берутся из `Shop` и `CompanyProfileSetting` при рендере. В `ChequeSettings` хранятся только то, что нигде больше не живёт: логотип, текст подвала, QR-ссылка, фирменный заголовок.

### 2.3 Миграция состава блоков (`reconcileChequeBlocks`)

Сохранённый список сверяется с текущим каталогом при каждом чтении:

- пользовательские `is_active` и `sequence_number` сохраняются;
- новые блоки из каталога добавляются с значениями по умолчанию;
- блоки, которых больше нет в каталоге, удаляются;
- если список изменился, он записывается в БД (`reconcileTemplate`).

### 2.4 Редактирование

`PUT /api/cheque/:id` (право `cheque-edit`). Поля, ограничения и пример — в [api.md](./api.md#put-apichequeid). Блоки меняются по ключу: `key`, `is_active`, `sequence_number`. Ключ, которого нет в каталоге, игнорируется.

Поля печатного устройства (`paper_width`, `printable_width`, `offset_mm`, `feed_mm`, `print_mode`) относятся к шаблону. Одна бумага или принтер — один шаблон. Поэтому на кассе выбирают шаблон по устройству (`template_id`).

Миграция `20261016120000_cheque_printer_profile` добавила `printableWidth`, `offsetMm`, `feedMm`, `printMode` (все с значениями по умолчанию, существующие шаблоны печатаются как раньше).

---

## 3. Фронтенд

### 3.1 Компоненты

| Файл | Роль |
|---|---|
| `composables/useReceipts.ts` | API-клиент чеков и шаблонов, нормализация настроек, `DEFAULT_BLOCKS` |
| `components/receipt/ReceiptView.vue` | сам чек: собирает блоки из `ReceiptHeader`, `ReceiptSaleInfo`, `ReceiptInfoLines`, `ReceiptItemsTable`, `ReceiptTotals`, `ReceiptPayment`, `ReceiptBalanceDebt`, `ReceiptFooter` |
| `components/receipt/ReceiptActions.vue` | кнопки «Печать» и «Скачать» (PDF) |
| `components/pos/SummaryBlock.vue` | экран оплаты POS: после продажи загружает чек и решает, открыть и/или напечатать |
| `pages/order/all/index.vue` | список продаж, открытие чека по продаже |
| `pages/settings/checks.vue`, `pages/settings/cheque/[id].vue` | список и редактор шаблонов |
| `composables/useReceiptPdf.ts`, `useReceiptShare.ts`, `usePrintWindow.ts` | PDF, общий доступ, печать в отдельном окне |
| `store/printSettings.ts` | локальные настройки: `autoOpenReceiptAfterSale`, `autoPrintReceiptAfterSale`, `receiptPreviewOpen` |

Фронтенд вызывает (через `useApi`): `GET /receipts/:saleId`, `GET /receipts/by-number/:number`, `POST /receipts/:saleId/mark-printed`, `GET /cheque-settings`, `GET /cheque`, `GET /cheque/:id`, `POST /cheque`, `PUT /cheque/:id`, `DELETE /cheque/:id`.

### 3.2 `useReceipts`

- `normalizeSettings` приводит ответ сервера к типу `ReceiptSettingsData`. Если `blocks` пустой или отсутствует, подставляется `DEFAULT_BLOCKS`, поэтому чек никогда не печатается пустым. Значения `DEFAULT_BLOCKS` повторяют серверные по умолчанию (`cheque-blocks.constant.ts`), их нужно держать в синхроне.
- `defaultReceiptSettings()` — настройки на случай, когда сервер недоступен.

### 3.3 Поток в POS (`SummaryBlock.vue`)

1. После успешной оплаты вызывается `loadReceiptForSale(saleId)`.
2. Параллельно: `fetchReceipt(saleId)` и `fetchReceiptSettings()`.
3. Ошибка загрузки шаблона не блокирует чек: в лог пишется `console.error`, показывается предупреждение «Не удалось загрузить шаблон чека», используется шаблон по умолчанию.
4. Если включено автооткрытие или автопечать, открывается предпросмотр (`receiptPreviewOpen = true`). Иначе показывается тост «Чек сформирован» с действием «Показать чек».
5. При автопечати ждётся отрисовка чека (до 3 с). Для `printMode = pdf` печатается PDF. Для `browser` вызывается диалог печати. Если браузер его не открыл, предпросмотр остаётся открытым, а пользователю показывается подсказка нажать «Печать».
6. Ошибка получения чека: тост «Продажа сохранена, но чек не загрузился» с текстом ошибки. Сообщение `message` из массива склеивается через `; `. Продажа при этом сохранена, чек можно открыть позже из списка.

### 3.4 Отображение

`ReceiptView` — единственный источник разметки для печати (в `@media print` скрыто всё остальное). Поэтому он монтируется только при открытом предпросмотре. Перед печатью ждётся загрузка логотипа и QR-картинки.

---

## 4. Ошибки

### 4.1 Формат

Ошибки в формате Nest: `{ statusCode, message, error }` (см. [api.md](./api.md#формат-ошибок)). `message` может быть массивом (ошибки валидации DTO шаблона, например `paper_width must not be greater than 220`).

### 4.2 Коды для чеков

| HTTP | `message` | Когда |
|---|---|---|
| 404 | `Sale not found` | продажи нет в компании или она вне доступных филиалов |
| 404 | `Cheque template not found` | шаблон не найден или чужой |
| 400 | `Нельзя удалить шаблон по умолчанию — сначала назначьте другой шаблон по умолчанию` | `DELETE` основного шаблона |
| 400 | `Нельзя снять этот шаблон с "по умолчанию" — ...` | `is_default: false` у основного шаблона |
| 403 | `Insufficient permissions` | нет права из `RECEIPT_PERMISSIONS` или `cheque-edit` |
| 400 | DTO-ошибки | неверные поля шаблона (`message` — массив) |

Гонка при создании чека не даёт ошибки: второй запрос получает уже созданный чек.

### 4.3 Как ошибки показываются

- Во фронтенде `utils/apiError.ts` (`getApiErrorMessage`) приводит `message` к строке, склеивая массивы.
- Экран POS не теряет продажу: при сбое чека продажа уже сохранена, пользователь видит тост и может открыть чек из списка.
- Все места, где вызывается чек, пишут `console.error` с `saleId`, чтобы ошибку можно было найти по логам браузера.

### 4.4 Логи сервера

- `Logger` в `ReceiptsService` с контекстом: `saleId`, `companyId`.
- Не найдена продажа: `warn`.
- Ошибка создания чека (не P2002): `error` со стеком, исключение пробрасывается.

---

## 5. Проверка

Автотесты:

- `src/receipts/receipts.create-race.spec.ts` — гонка P2002 при создании чека;
- `src/receipts/receipts.permissions.spec.ts` — права доступа;
- `src/common/filters/prisma-exception.filter.spec.ts` — формат ответа фильтра Prisma.

Ручная проверка:

1. Оплатить продажу с включённой автопечатью, проверить, что чек напечатан и в списке продаж его статус `PRINTED`.
2. Отключить оба автоматических действия, проверить тост «Показать чек».
3. Выбрать шаблон с другими блоками для устройства (`template_id`), проверить состав чека.
4. Изменить адрес филиала и перепечатать старый чек: деньги не меняются, адрес меняется (см. раздел 1.5).

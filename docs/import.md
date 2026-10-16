# Импорт и приходы

**Последнее обновление:** 2026-10-16

В системе два способа поступления товара, и их не стоит путать:

| Способ | Что загружает пользователь | Модель в БД | Маршруты | Итог |
|---|---|---|---|---|
| 1. Импорт файла товаров | таблица (строки с названием, количеством, ценами) | `ProductImportSession` (сессия, JSON) | `/api/v2/imports*`, `/api/v2/excel/*` | создание/обновление товаров и остатков |
| 2. Приход по накладной | фото или PDF накладной | `SupplierInvoice` + `SupplierInvoiceItem` + `InvoiceAllocation` | `/api/supplier-invoices*` | приход на склад филиалов, цены |

В UI оба пути называются «приход» (раздел «Товары → Приход»). В коде приход по накладной — `SupplierInvoice`, импорт файла — `ProductImportSession`.

Связанные документы: [api.md](./api.md), [data-model.md](./data-model.md), [architecture.md](./architecture.md#62-приход-от-поставщика-накладная).

---

## 1. Импорт товаров из файла (`/v2/imports`)

Контроллер: `ProductsController` (`src/products/products.controller.ts`). Сервис: `ProductsService` (методы `createImportDraft`, `validateExcelImport`, `commitImport`, `cancelImport`, `rollbackImport`, `listImports`, `getImportById`).

### 1.1 Шаги

```
POST /api/v2/imports                  создать сессию (status: draft)
POST /api/v2/imports/:id/validate     проверить строки (status: preview_ready)
GET  /api/v2/import-progress/:jobId   прогресс фоновой проверки (если запущена)
GET  /api/v2/import-search/:id        поиск и фильтр строк предпросмотра
GET  /api/v2/import-items-dp/:id      строки для отображения
POST /api/v2/imports/:id/commit       провести (status: importing → completed)
POST /api/v2/imports/:id/cancel       отменить (status: cancelled)
POST /api/v2/imports/:id/rollback     откатить проведённый импорт
```

Для импорта без проверки есть `POST /api/v2/excel/import-without-check` (право `import-create` и `import-check`), он сразу создаёт товары, но при ошибках валидации отвечает 400 с полным списком.

### 1.2 Тело создания

Обязательные поля: `name`, `shop_id`, `rows` (массив). Остальное необязательно:

| Поле | Значения | Примечание |
|---|---|---|
| `mode` | `with_check` (по умолчанию) или `without_check` | `with_check` требует явного подтверждения при `commit` |
| `generate_barcode` | boolean | генерировать штрихкод для строк без него |
| `generate_sku` | boolean | генерировать артикул |
| `properties` | массив | сопоставление колонок файла со свойствами товара |
| `on_match` | объект | что делать, если товар уже есть (см. 1.4) |
| `company_id` | строка | только для платформы |

Поля строки `rows[]` (из `extractImportRows`): `name`, `article`, `sku`, `barcode`, `color_name` (или `color`), `color_code`, `size_name` (или `size`), `size_type`, `season`, `season_year`, `collection`, `gender`, `quantity`, `supply_price`, `retail_price`, `category_name`, `brand_name`, `measurement_unit`. Значения-маркеры «без цвета» (`-`, `без цвета`) и «без размера» (`-`, `без размера`, `one size`) трактуются как пустые.

Ошибки: 400 `rows must be an array`, `shop_id must be a non-empty string`, 404 `Import session not found` (для чтения и действий).

### 1.3 Статусы сессии

Поле `status_code` возвращается как машинное значение, `status` как подпись. Значения `ImportSession.status`:

| `status_code` | `status` (подпись) | Смысл |
|---|---|---|
| `draft` | Новый | создана, не проверена |
| `validating` | Проверяется | идёт проверка |
| `preview_ready` | В Ожидании | проверка выполнена, можно провести |
| `importing` | Загружается | идёт проведение |
| `completed` | Завершен | проведён, `result` заполнен |
| `cancelled` | Отменен | отменён пользователем |
| `failed` | Проверка | ошибка (сессия помечается при сбое фоновой обработки) |
| `rolled_back` | — | откатан (см. ниже про подпись) |

> Откаченный импорт получает подпись «Возвращён», `status_code` равен `rolled_back`.

Для сводного списка `GET /api/v2/imports` приходы по накладной показываются тем же списком. Их статусы переводятся так: `DRAFT`→`draft`, `PROCESSING` и `REVIEW`→`validating`, `READY`→`preview_ready`, `COMMITTED`→`completed`, `CANCELLED`→`cancelled`, `ROLLED_BACK`→`rolled_back`.

Признаки в ответе: `requires_approval` и `can_commit` = true при `preview_ready` (сессия готова к проведению), `is_finished` = true для терминальных статусов.

### 1.4 Политика «совпадение товара» (`on_match`)

Если строка файла совпала с существующим товаром, для каждого поля выбирается источник:

- `keep_store` (по умолчанию) — оставить значение из системы;
- `from_file` — взять значение из файла.

Ключи: `name`, `brand`, `category`, `description`, `measurement_unit`, `supplier`, `supply_price`, `retail_price`, `color`. Значение, отличное от `keep_store`/`from_file`, в строгом режиме даёт 400 `on_match.<поле> must be either "keep_store" or "from_file"`. Неизвестный ключ: 400 `on_match.<ключ> is not supported`.

На этапе `commit` можно передать `on_match` в теле: сохранённая политика объединяется с переданной.

### 1.5 Проведение (`commit`)

- `POST /api/v2/imports/:id/commit` принимает подтверждение `with_check`. Без него `POST /api/v2/import-commit/:id` для сессии `with_check` вернёт 400 `Import with check must be accepted explicitly before products are created`.
- Если сессия уже `completed` и есть `result`, повторный вызов возвращает тот же результат с `idempotent: true`. Повторного создания товаров не будет.
- Параллельное проведение одной сессии: 400 `Import commit is already in progress`.
- Если в предпросмотре есть строки с ошибками, сессия переходит в `preview_ready`, ответ 400 с перечнем строк.
- Результат (`result`): `created_count`, `updated_count`, `error_count`, `errors[]` (строка и сообщение), `imported_variants[]`, `committed_at`, `committed_by`. Каждая проведённая строка пишет движение `PURCHASE` с `externalId` = id сессии.

### 1.6 Откат (`rollback`)

- Откатить можно только `completed`. Иначе 400 `Only completed imports can be rolled back`. Повторно: 400 `Import is already rolled back`.
- Откат ищет движения `PURCHASE` с `externalId` = id сессии. Если их нет (импорт проведён до появления функции отката), 400 `Для этого импорта нет данных для отката`.
- Откат не должен уводить остатки в минус. Если часть товаров уже продана или списана, откат блокируется.
- В этом случае реальный откат отвечает **HTTP 409** с телом `{ "statusCode": 409, "message": "Часть остатка по этим товарам уже израсходована ...", "error": "Conflict", "can_rollback": false, "blocked_items": [...] }`. Остатки не меняются.
- `POST /api/v2/imports/:id/rollback?dry_run=true` ничего не меняет, возвращает `{ "can_rollback": true, "items": [...] }` или блокировку (для dry-run она тоже приходит с HTTP 200: `{ "can_rollback": false, "blocked_items": [...], "reason": "..." }`). Фронтенд сначала вызывает dry-run и показывает список (`pages/products/import/list/[id].vue`).
- Повторный запуск во время отката: 400 `Import commit or rollback is already in progress`.

### 1.7 Чтение и список

- `GET /api/v2/imports?page=&limit=` (по умолчанию `page=1`, `limit=10`, максимум 100). Ответ не кэшируется (заголовки `Cache-Control: no-store`).
- `GET /api/v2/imports/:id` отдаёт сессию с `fields`, `rows_count`, `rows`, `dry_run_summary`, `result`. Это тяжёлый ответ для больших файлов.

---

## 2. Приход по фото или PDF накладной (`/supplier-invoices`)

Контроллер: `SupplierInvoicesController` (`src/imports/controllers/supplier-invoices.controller.ts`). Сервис: `SupplierInvoiceService`. OCR: `InvoiceRecognitionService`. Сопоставление: `ImportMatcherService`. Нормализация строк: `ImportNormalizerService`.

### 2.1 Сценарий

```
POST   /api/supplier-invoices                       черновик        DRAFT
POST   /api/supplier-invoices/:id/files             загрузка файлов PROCESSING
POST   /api/supplier-invoices/:id/recognize         OCR            REVIEW (строки заменены)
POST   /api/supplier-invoices/:id/recognized-items  строки вручную REVIEW
PATCH  /api/supplier-invoices/:id/items/:itemId     правка строки
DELETE /api/supplier-invoices/:id/items/:itemId     удалить строку
POST   /api/supplier-invoices/:id/auto-match        предложения    (статусы строк)
POST   /api/supplier-invoices/:id/items/:itemId/match    подтвердить товар
POST   /api/supplier-invoices/:id/items/merge       объединить строки
POST   /api/supplier-invoices/:id/allocations       распределить по филиалам
POST   /api/supplier-invoices/:id/ready             проверка         READY
POST   /api/supplier-invoices/:id/commit            провести         COMMITTED
POST   /api/supplier-invoices/:id/rollback          откатить         ROLLED_BACK
POST   /api/supplier-invoices/:id/cancel            отменить         CANCELLED
GET    /api/supplier-invoices/:id/files/:fileIndex  скачать оригинал
```

### 2.2 Статусы прихода

| Статус | Как попадаем | Что можно |
|---|---|---|
| `DRAFT` | создание | загрузить файлы, отменить |
| `PROCESSING` | загрузка файлов | распознать, отменить |
| `REVIEW` | распознавание или ручные строки | править строки, сопоставлять, распределять, отменить |
| `READY` | `ready` (все строки сопоставлены и распределены) | провести, отменить |
| `COMMITTED` | `commit` | откатить |
| `ROLLED_BACK` | `rollback` | только просмотр |
| `CANCELLED` | `cancel` | только просмотр |

Изменять приход можно в статусах `DRAFT`, `PROCESSING`, `REVIEW`, `READY`. В остальных ответ 409 `Invoice can no longer be changed` (или 400 для загрузки файлов).

### 2.3 Статусы строк

`SupplierInvoiceItemStatus`: `MATCHED`, `NEEDS_REVIEW`, `NEW_PRODUCT`, `ERROR`.

- После `auto-match`: `NEEDS_REVIEW` (есть предложение) или `NEW_PRODUCT` (товара нет). Товар **не привязывается автоматически**: `matchedProductId` остаётся пустым, `userConfirmed` = false.
- После `match` (ручное подтверждение): `MATCHED`, `matchMethod` = `USER_CONFIRMED`, `userConfirmed` = true. Создаётся или обновляется псевдоним `SupplierProductAlias`, поэтому в следующих накладных этого поставщика строка найдётся сама.
- `ERROR` определён в enum, в текущем коде сервиса не выставляется.

### 2.4 Загрузка файлов

- `multipart/form-data`, поле `files`, до 10 файлов, до 20 МБ каждый.
- Типы: `image/jpeg`, `image/png`, `image/webp`, `application/pdf`. Excel-файлы в этом пути не принимаются. Для них используйте импорт файла (раздел 1).
- Файлы сохраняются в `private/invoices/` под UUID-именами. Через `/uploads` они не отдаются.
- Метаданные (`name`, `mimeType`, `size`, `url`) лежат в `originalFiles` прихода.

### 2.5 Распознавание (OCR)

`INVOICE_RECOGNITION_PROVIDER` выбирает движок:

| Значение | Что запускается | Переменные |
|---|---|---|
| `paddle` (по умолчанию) | `ocr/recognize_invoice.py` через Python | `PADDLE_OCR_PYTHON` (по умолчанию `.venv-ocr/bin/python` внутри проекта), `PADDLE_OCR_TIMEOUT_MS` (по умолчанию 600000), `PADDLE_OCR_MAX_CONCURRENCY` (по умолчанию 1), `OCR_DEBUG=1` (вывод stderr в лог) |
| `openai` | вызов OpenAI API | `OPENAI_API_KEY` (обязателен, иначе 400 `OPENAI_API_KEY is not configured`), `OPENAI_INVOICE_MODEL` (по умолчанию `gpt-5.4-nano`) |

Ограничения:

- Одновременно выполняется не больше `PADDLE_OCR_MAX_CONCURRENCY` распознаваний (очередь внутри процесса).
- Для PaddleOCR нужен отдельный venv: `npm run ocr:install` создаёт `.venv-ocr`, `npm run ocr:check` проверяет. В Windows путь к Python другой (`.venv-ocr\Scripts\python.exe`), переменную `PADDLE_OCR_PYTHON` задайте явно.
- Excel-файлы для локального OCR запрещены (400 `Local OCR accepts images and PDF...`).

Ошибки распознавания (502 от сервера OCR): `Local OCR returned no JSON`, `Local OCR returned invalid JSON`, `Recognition returned no data`, `Recognition returned invalid JSON`. Если OCR вернул строки без `rawName`, приход не меняется: 400 `rawName is required`. Если строк нет, 400 `items are required`.

Результат OCR: `invoiceNumber`, `invoiceDate` (проверяется, иначе 400 `Invalid recognized invoice date`) и список строк (`rawName`, `sku`, `barcode`, `quantity`, `supplyPrice`, `totalPrice`). Строки записываются с предупреждением `TOTAL_MISMATCH`, если сумма строки не сходится с `quantity × supplyPrice`.

Распознавание выполняется в транзакции `Serializable` с повторной проверкой статуса после OCR: если приход отменили за время распознавания, ответ 409.

### 2.6 Распределение и проверка

- `allocations` полностью заменяет распределение. Сумма по строке должна совпадать с `quantity` (допуск 0.0001), иначе `ready` вернёт 400 `Item <id> is not fully allocated`.
- Филиалы берутся из `allowedShopIds` пользователя. Чужой филиал: 403 `Shop is not available`.

### 2.7 Проведение (`commit`)

Тело: `{ "supplyPriceStrategy": "LAST_PURCHASE" | "WEIGHTED_AVERAGE" | "MANUAL" }` (необязательно).

Стратегия задаёт закупочную цену товара после прихода:

| Стратегия | Закупочная цена `Product.purchasePrice` |
|---|---|
| `LAST_PURCHASE` | цена последней строки прихода |
| `WEIGHTED_AVERAGE` | средневзвешенная по остаткам филиалов (если остаток > 0) |
| `MANUAL` | не меняется |

Если тело не передано, берётся `Company.supplyPriceStrategy` (по умолчанию `LAST_PURCHASE`). В одной транзакции: остатки по филиалам увеличиваются (`moveVariantStock`), пишутся движения `PURCHASE` с `externalId` = id прихода, `Product.quantity` пересчитывается как сумма остатков филиалов, приход получает `COMMITTED`, `committedAt`, `totalQuantity`, `totalAmount`.

Повторный `commit` для `COMMITTED`: 409 `Invoice already committed`.

### 2.8 Откат (`rollback`)

Только для `COMMITTED`. Ищутся движения `PURCHASE` с `externalId` = id прихода, они вычитаются обратными движениями. Ошибки:

- 409 `Only committed invoice can be rolled back`;
- 409 `Invoice stock movements not found` (движений нет).

Откат выполняется через `moveVariantStock` (`src/common/stock-ledger.ts`), который не списывает больше остатка. Если товар уже продан или списан, запрос завершится ошибкой 409 `Недостаточно остатка по товару <productId> на складе <branchCode>` (если вызывающий код не передал собственную ошибку), транзакция откатывается, приход остаётся `COMMITTED`. Перед откатом проверьте остатки.

### 2.9 Отмена

`POST .../cancel` работает только для `DRAFT`, `PROCESSING`, `REVIEW`, `READY`. Иначе 409 `Invoice cannot be cancelled`. Остатки не затрагиваются.

### 2.10 Дубли

- Пара `(supplierId, invoiceNumber)` среди не отменённых приходов: ответ создания содержит `duplicateWarning` (сам приход создаётся).
- `idempotencyKey` уникален в пределах компании (`@@unique([companyId, idempotencyKey])`). Повторная отправка с тем же ключом даёт 409 (`P2002`). Существующий приход не возвращается. Фронтенд генерирует ключ на каждый новый приход через `crypto.randomUUID()`.

---

## 3. Обработка ошибок

### 3.1 Формат

Все ошибки API в формате `{ statusCode, message, error }` (см. [api.md](./api.md#формат-ошибок)). `message` может быть массивом строк (ошибки DTO).

### 3.2 Во фронтенде

- `utils/apiError.ts` → `getApiErrorMessage(cause, fallback)`: берёт `data.message` (или `response._data.message`), массив склеивает через `; `. Используется в `composables/import/useSupplierInvoices.ts`.
- Страница `pages/products/import/new.vue`:
  - при ошибке загрузки прихода показывается красный блок с кнопками «Повторить» и «К списку приходов»;
  - для ответа 404 при восстановлении по `?id=` выводится «Приход не найден или был удалён.»;
  - ошибка распознавания показывается в `pageError` и возвращает мастер на шаг 1 (загрузка). Это не «тихий» сброс, но сообщение выводится через `e?.data?.message` без склейки массива.
- Страница `pages/products/receipts/[id].vue` (карточка прихода): состояния загрузки и ошибки с «Повторить». 404 → «Приход не найден.», 403 → «Нет доступа к этому приходу.». Отмена и откат обёрнуты в `try/catch`.
- Список `components/ImportDataTable.vue` + `store/DataTables/importDataTableStore.ts`: ошибка загрузки хранится в `store.error`, таблица показывает её с кнопкой «Обновить» (вместо пустой таблицы).

### 3.3 Сервер

- Исключения сервиса логируются при 404 приходов: `Logger.warn` с `id` и `companyId` (`SupplierInvoiceService.get`).
- Конфликты конкурентных изменений отвечают 409, а не 500 (`ConflictException`).

---

## 4. Кнопка «Обновить» и F5

### 4.1 Мастер прихода (`pages/products/import/new.vue`)

1. Создание черновика (`POST /supplier-invoices`) сразу записывает id прихода в адресную строку: `?id=<uuid>` через `navigateTo(..., { replace: true })`. Поэтому F5 возобновляет черновик, а не создаёт новый.
2. Возобновление (`resumeInvoice`): загружает приход. Если статус `COMMITTED`, `CANCELLED` или `ROLLED_BACK`, переходит на `/products/receipts/<id>`. Иначе восстанавливает поставщика, номер, дату, распределение и шаг мастера: `READY` → шаг 5, есть строки → шаг 3, иначе шаг 1.
3. Кнопка «Обновить» видна, пока приход не проведён (`invoice && !committed`). Во время загрузки, обновления или распознавания она недоступна.
4. Обновление перечитывает данные текущей страницы (`loadPage`) и **не меняет маршрут**. Если прихода ещё нет в URL, но он уже создан, сначала записывается `?id=`. Текущий шаг сохраняется, если он в диапазоне 1–5 и загрузка прошла без ошибки.
5. При ошибке загрузки показывается блок с «Повторить» и «К списку приходов».
6. Кнопка «Отменить приход» требует подтверждения и после успеха переходит к списку.

### 4.2 Список приходов (`components/ImportDataTable.vue`)

«Обновить» повторно запрашивает список (`store.loading` → «Обновляем...»). Ошибка загрузки показывается в таблице, а не скрывает её.

### 4.3 Карточка прихода (`pages/products/receipts/[id].vue`)

Баннер ошибки вынесен из `v-if="invoice"`, поэтому ошибка видна, даже если приход не загрузился. «Повторить» вызывает `load()` заново.

---

## 5. Проверка после изменений

Ручная проверка:

1. Создать приход, загрузить фото, распознать, F5 на шаге 3: должен вернуться тот же приход.
2. Нажать «Обновить» на шаге 4: адрес не меняется, шаг сохраняется.
3. Открыть `?id=` несуществующего прихода: «Приход не найден или был удалён.».
4. Откатить импорт файла, на котором есть продажа после импорта: HTTP 409 и список блокировок, остатки не меняются.

Автотесты: `npm test` (`src/imports/services/supplier-invoice.*.spec.ts`, `import-matcher.service.spec.ts`), `npm run test:postgres` (интеграционные тесты), во фронтенде `tests/api-error.test.mjs`.

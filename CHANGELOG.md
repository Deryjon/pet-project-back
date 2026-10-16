# Changelog

Формат: даты в виде `YYYY-MM-DD`, записи сгруппированы по репозиторию. Изменения в `pet-project` (frontend) перечислены в той же записи, чтобы было видно, какие части работают вместе.

---

## 2026-10-16

### Backend (`pet-project-back`)

**Исправления**

- `ReceiptsService.getOrCreateForSale`: гонка при создании чека. Если параллельный запрос создал `Receipt` раньше (`P2002` по `saleId`), чек перечитывается и возвращается, вместо ошибки 409. Логи получили контекст `saleId` и `companyId`. Добавлен `src/receipts/receipts.create-race.spec.ts`.
- `GET /api/supplier-invoices` и `GET /api/supplier-invoices/:id` больше не возвращают внутренний путь `path` в `originalFiles[]` (`SupplierInvoiceService.getForClient`); внутренние методы по-прежнему используют `path`.
- `SupplierInvoiceService.get`: при отсутствии прихода пишется `Logger.warn` с `id` и `companyId`.
- `PrismaExceptionFilter` (`src/common/filters/prisma-exception.filter.ts`): тело ответа теперь `{ statusCode, message, error }`. Поле `error` берётся из имени статуса. Добавлен `prisma-exception.filter.spec.ts` (пока не закоммичен).

- `POST /api/v2/imports/:id/rollback`: если остаток уже израсходован, реальный откат теперь отвечает **HTTP 409** с телом `{statusCode, message, error, can_rollback: false, blocked_items}`. Dry-run (`?dry_run=true`) по-прежнему возвращает 200 с `can_rollback: false`, чтобы UI показал список. Тест: `products.rollback-blocked.spec.ts`.
- `ProductsService.getImportStatusName`: добавлена подпись «Возвращён» для `rolled_back`.
- `prisma/seed.ts`: при `NODE_ENV=production` без `PLATFORM_ADMIN_PASSWORD` seed завершается ошибкой, в остальных случаях печатает предупреждение.
- `.env.example`: `FRONTEND_URL` указывает на `http://localhost:3000`.
- Миграция `20261016140000_widen_decimals_add_updated_at` (с `down.sql`): все 48 колонок `Decimal(12,x)` расширены до `Decimal(14,x)`, добавлен nullable `updatedAt` в `TelegramSubscriber`, `TelegramLinkToken`, `ProductSupplier`, `InventoryCountAttempt`. Проверено на временной БД PostgreSQL 18: применение, откат, повторное применение, `prisma migrate diff` без расхождений. Набор `test:postgres` даёт те же 9 падений, что и до миграции (проверено сравнением), 988 unit-тестов проходят. Колонки `Float` и статусы не менялись.

**Документация** (`docs/`)

- `docs/architecture.md`: модули, request pipeline, мультиарендность и guards, потоки данных, структура frontend.
- `docs/data-model.md`: сущности, связи, ER-диаграмма, все 21 enum, раздел «Единый справочник атрибутов», «Таблица расхождений», план миграций (без выполнения).
- `docs/api.md`: маршруты по контроллерам, права, тела, примеры ответов, формат ошибок.
- `docs/import.md`: импорт файла (`/v2/imports`), приход по накладной (`/supplier-invoices`), OCR, статусы, обработка ошибок, поведение «Обновить».
- `docs/receipts.md`: формирование чека, снимок, шаблоны и блоки, отображение во frontend, ошибки.
- `docs/deploy.md`: PM2, процедура выката, переменные окружения, CI, каталоги данных, рекомендации по бэкапам (помечены как рекомендация).
- `README.md`: описание проекта, стек, быстрый старт, тесты; исходное содержимое NestJS-шаблона сохранено ниже.

### Frontend (`pet-project`)

- Мастер прихода (`pages/products/import/new.vue`): id созданного прихода пишется в URL (`?id=`), F5 возобновляет черновик. Кнопка «Обновить» перечитывает данные без смены маршрута и сохраняет шаг. Ошибки загрузки показываются блоком с «Повторить» и «К списку приходов»; для 404 выводится «Приход не найден или был удалён.». Ошибка распознавания показывается с текстом сервера (раньше шаг сбрасывался молча).
- Список приходов (`store/DataTables/importDataTableStore.ts`, `components/ImportDataTable.vue`): ошибка загрузки хранится в `error` и показывается с кнопкой «Обновить» вместо пустой таблицы.
- Карточка прихода (`pages/products/receipts/[id].vue`): баннер ошибки вынесен из `v-if="invoice"`, состояния загрузки и ошибки с «Повторить» (404 и 403 с понятными текстами), отмена и откат обёрнуты в `try/catch`.
- POS (`components/pos/SummaryBlock.vue`): при сбое шаблона чека пишется `console.error` и показывается предупреждение (используется шаблон по умолчанию). Если автооткрытие и автопечать выключены, тост «Показать чек». Сообщения API-ошибок-массивов склеиваются, ошибки логируются с id продажи.
- `composables/useReceipts.ts`: если `blocks` пусты, используется `DEFAULT_BLOCKS`, чек никогда не печатается пустым.
- `utils/apiError.ts` (`getApiErrorMessage`) используется в `composables/import/useSupplierInvoices.ts`. Тест: `tests/api-error.test.mjs`.
- `types/enums.ts` и `types/common.ts`: общие union-типы enum'ов Prisma и алиасы (`EntityId`, `Money`, `Quantity`, `IsoDateTime`, `Timestamps`). `useClients.ts`, `useSupplierInvoices.ts`, `usePlatformAdmin.ts` реэкспортируют их.

### Известные проблемы (не исправлены)

Найдены при подготовке документации. Зафиксированы здесь, чтобы не потерять.

- `OrdersService.complete` не подключён к контроллеру: маршрута завершения заказа в `/api/orders` нет.
- `RolesController` не использует guard'ы; авторизация внутри `RolesService` (проверено: все 7 методов отказывают до обращения к БД, зафиксировано в `roles.access.spec.ts`). Стандартные guard'ы не добавлены намеренно: они сломали бы путь платформенного админа с `company_id`.
- Во фронтенде `startRecognition` (`pages/products/import/new.vue`) выводит `e?.data?.message` без склейки массива.
- `Product`, `ProductVariant`, `ProductStock`, `ProductVariantStock`, `Receipt`, `InventoryItem`, `SellerSalarySettings` хранят деньги и остатки в `Float`. План перехода — в `docs/data-model.md`, в этой версии не выполнен.
- Аудит (`docs/audit-report.md`) указывал `Decimal(14,2)` для `ProductSupplyPriceHistory.supplyPrice`. В схеме это `Decimal(12,2)`.

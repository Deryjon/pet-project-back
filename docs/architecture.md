# Архитектура Konkurent CRM

**Последнее обновление:** 2026-10-16

Документ описывает устройство backend (`pet-project-back`, NestJS 11) и связь с frontend (`pet-project`, Nuxt 4). Всё описанное проверено по исходному коду; если что-то расходится с кодом, верить нужно коду.

Связанные документы: [api.md](./api.md), [data-model.md](./data-model.md), [import.md](./import.md), [receipts.md](./receipts.md), [deploy.md](./deploy.md), [attribute-dictionaries.md](./attribute-dictionaries.md), аудит: [audit-report.md](./audit-report.md), [audit-progress.md](./audit-progress.md).

---

## 1. Общая схема

```
 Браузер / iOS (Capacitor)                       Telegram
        │                                           │ webhook
        │  HTTPS, Bearer JWT                        │
        ▼                                           ▼
 ┌──────────────────────┐   fetch   ┌────────────────────────────────────────┐
 │ Nuxt 4 (frontend)    │──────────▶│ NestJS 11 (backend), global prefix /api │
 │ SSR (web)            │           │                                        │
 │ SPA static (mobile)  │           │  middleware → guards → pipes → controller
 │ server/api proxy     │──(opt.)──▶│  → service → Prisma (PostgreSQL)       │
 └──────────────────────┘           │                                        │
                                    │  ↘ ocr/recognize_invoice.py (PaddleOCR)│
                                    │  ↘ OpenAI API (распознавание накладных)│
                                    └────────────────────────────────────────┘
```

- Backend работает как один процесс PM2 `konkurent-api` (см. [deploy.md](./deploy.md)).
- Перед приложением стоит один reverse proxy (nginx). В `main.ts` задано `trust proxy = 1`, поэтому `req.ip` берётся из `X-Forwarded-For`.
- Frontend в вебе ходит на API напрямую (`NUXT_PUBLIC_API_BASE`), либо через Nitro-прокси `server/api/[...path].ts` при `NUXT_PUBLIC_API_BASE=/api`.

---

## 2. Модули backend

Корневой модуль: `src/app.module.ts`. Подключены следующие модули (в скобках — каталог):

| Модуль | Каталог | Назначение |
|---|---|---|
| `PrismaModule` | `src/prisma` | `PrismaService`: клиент Prisma с адаптером `@prisma/adapter-pg` |
| `AuthModule` | `src/auth` | вход (company/platform), JWT, сессии `AuthSession`, refresh, guards, контекст запроса |
| `UsersModule` | `src/users` | пользователи компании, профиль, аватар, текущий филиал, права доступа |
| `PlatformModule` | `src/platform` | API оператора SaaS: компании, подписки, тарифы, платежи, пользователи платформы |
| `CompanySettingsModule` | `src/company-settings` | профиль компании, филиалы (`shop`), единицы измерения, типы оплаты, кассы, лояльность, валюта |
| `AttributeDictionariesModule` | `src/attribute-dictionaries` | общий справочник цветов/размеров/сезонов (`AttributeValue`) |
| `ProductAttributesModule` | `src/product-attributes` | атрибуты товаров, опции, цвета/размеры/сезоны (legacy-справочники) |
| `ProductsModule` | `src/products` | каталог, варианты, остатки, фото, трансферы, инвентаризация (`v2/stocktaking`), импорт файлов (`v2/imports`) |
| `ImportsModule` | `src/imports` | приходы от поставщиков: накладные (фото/PDF), OCR, сопоставление, поставщики |
| `PurchaseOrdersModule` | `src/purchase-orders` | заказы поставщикам (`v1/purchase-orders`) |
| `SalesModule` | `src/sales` | POS-документы `Sale` / `SaleItem` (`/new-sale`, `/order`, `/sales`) |
| `OrdersModule` | `src/modules/orders` | параллельный API заказов на модели `Order` (`/orders`) |
| `PaymentsModule` | `src/modules/payments` | типы оплаты (`/payment-types`) |
| `CashboxesModule` | `src/modules/cashboxes` | кассы (`/cashboxes`) |
| `ClientsModule` | `src/clients` | клиенты, группы, теги, карты, долги и погашения |
| `ReceiptsModule` | `src/receipts` | чеки: `Receipt` по продаже, шаблоны `ChequeSettings` |
| `PriceTagsModule` | `src/price-tags` | ценники (печать) |
| `ReportsModule` | `src/reports` | отчёты (продажи, остатки, клиенты, зарплаты продавцов) |
| `DashboardModule` | `src/dashboard` | отчёт для дашборда |
| `WarehouseModule` | `src/warehouse` | списания, инвентаризация (`v1/inventory-sessions`), переоценка |
| `RolesModule` | `src/roles` | CRM-роли компании (`v2/role`) |
| `TelegramModule` | `src/telegram` | бот уведомлений, webhook, подписчики |
| `AnalyticsModule` | `src/analytics` | аналитика продавцов (подключается через `TelegramModule`) |
| `HealthController` | `src/health.controller.ts` | `GET /api/health` |

Общий код лежит в `src/common`: фильтр ошибок Prisma, middleware, загрузка картинок, `runSerializableTransaction`, `money-calculations.ts`, `sale-stock-posting.ts`, `stock-ledger.ts`, `app-throttler.guard.ts`.

---

## 3. Request pipeline

Порядок обработки входящего HTTP-запроса (источник: `src/main.ts`, `src/app.module.ts`):

1. **Таймзона.** `src/timezone.ts` выставляет `TZ=Asia/Tashkent`, если переменная не задана. Импорт идёт первым в `main.ts`.
2. **Express-middleware `normalizeApiPrefix`.** Путь без `/api` переписывается в `/api/...`. Исключения: `/api/*` и `/uploads/*`.
3. **`normalizeAuthorizationHeader`.** Заголовок `Authorization` берётся из `authorization`, затем из `x-authorization`, затем из `x-access-token`.
4. **`helmet`** с `crossOriginResourcePolicy: cross-origin` (картинки открываются с другого origin).
5. **Global prefix** `api`, **CORS**: origin = `FRONTEND_URL` + `CORS_ORIGINS`. Если `FRONTEND_URL` не задан, допускаются `localhost:3000/5173/4173` плюс `CORS_ORIGINS`. `credentials: true`.
6. **Статика `/uploads`** (`src/common/public-uploads.ts`): анонимно отдаются только картинки из `uploads/products` и `uploads/avatars`. Файлы накладных лежат в `private/invoices` и через `/uploads` не отдаются.
7. **Global pipes**: `ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true })`. Лишние поля в DTO дают 400.
8. **Global filters**: `PrismaExceptionFilter` (ошибки Prisma → HTTP, см. [api.md](./api.md#формат-ошибок)).
9. **Middleware `RequestIdMiddleware`** (зарегистрирован в `AppModule` для всех путей): берёт `X-Request-Id` из запроса или генерирует UUID, возвращает его в ответе.
10. **Global guard `AppThrottlerGuard`** (`APP_GUARD`): rate limit. По умолчанию 600 запросов в минуту (`THROTTLE_LIMIT_PER_MINUTE`). Для авторизованного запроса счётчик ведётся по хэшу токена, для анонимного по IP. Маршруты входа ограничены `@Throttle` до 20 запросов в минуту на IP.
11. **Guards маршрута** (см. раздел 4), затем **params/body pipes**, затем **контроллер → сервис**.

---

## 4. Мультиарендность и авторизация

В системе два типа пользователей (`User.userType`): `platform` (оператор SaaS) и `company` (сотрудники клиентской компании). Один пользователь принадлежит одной компании (`User.companyId`).

### 4.1 Guards

| Guard | Файл | Что делает |
|---|---|---|
| `JwtAuthGuard` | `src/auth/guards/jwt-auth.guard.ts` | требует заголовок `Authorization`, через `UsersService.getRequestContext` кладёт `request.user` (`RequestContext`) |
| `CompanyAccessGuard` | `src/auth/guards/company-access.guard.ts` | через `requireCompanyContext` кладёт `request.companyContext`; без `companyId` и для `platform` отвечает 403 |
| `PermissionsGuard` | `src/auth/guards/permissions.guard.ts` | читает `@Permissions(...)` (все ключи обязательны) и `@AnyPermission(...)` (достаточно одного); права роли загружаются через `loadRoleAccess` |
| `PlatformAdminGuard` | `src/auth/guards/platform-admin.guard.ts` | `UsersService.assertPlatformAdminAccess`, используется в `PlatformController` и `admin/attributes` |

Типовая цепочка для компаний: `@UseGuards(JwtAuthGuard, CompanyAccessGuard, PermissionsGuard)` на классе или методе, плюс `@Permissions('<ключ>')`.

### 4.2 Контекст компании

`RequestContext` (`src/auth/request-context.ts`) содержит: `userId`, `fullName`, `userType`, `crmRoleId`, `companyId`, `currentShopId`, `currentBranchCode`, `allowedShopIds`, `allowedBranchCodes`, `canSwitchShops`.

В сервисах контекст получают через декоратор `@CurrentCompanyContext()` (`src/auth/company-context.decorator.ts`). **Все запросы сервисов должны фильтроваться по `companyId` и по доступным филиалам** (`allowedShopIds` / `allowedBranchCodes`). Это правило проверяют spec-файлы `src/auth/company-*.spec.ts` и `company-boundary-stage12.spec.ts`.

### 4.3 Права

- Ключи прав (например, `orders.create`, `import-check`, `clients`) совпадают с ключами, которые использует frontend в `composables/useAccessControl.ts`.
- Права роли хранятся в `Role` / `RolePermission`. `loadRoleAccess` берёт роль по `crmRoleId` внутри компании, только если `deletedAt = 0`.
- `isAdmin` у роли даёт полный доступ (см. `role-permissions.ts`).

### 4.4 Исключения из общей схемы

- **`RolesController` (`src/roles/roles.controller.ts`) не использует guards.** Авторизация выполняется внутри `RolesService` через `UsersService.assertAdminAccess(authorization)`, а компания определяется в `resolveManagedCompanyId`. Поведение корректное, но отличается от остальных контроллеров. При изменениях учитывать это.
- `ReportsController` и `UsersController` используют `JwtAuthGuard` на уровне класса и добавляют `CompanyAccessGuard`/`PermissionsGuard` на отдельных методах.
- В части методов нет `PermissionsGuard`, только `JwtAuthGuard` + `CompanyAccessGuard`: `GET /api/cheque-settings`, `GET /api/cheque`, `GET /api/cheque/:id` (`ReceiptsController`), `GET /api/price-tags*` и `price-tag-templates` (`PriceTagsController`), `GET /api/v1/price-tag*` (`CompanySettingsController`). Это фиксирует текущее поведение, а не рекомендацию.

### 4.5 Выбор филиала

- `Shop` идентифицируется двумя способами: `shopId` (uuid) и `branchCode`. Оба уникальны в паре с `companyId`.
- Текущий филиал пользователя меняется `PATCH /api/user/set-current-shop/:shopId`. Нужны `canSwitchShops` и больше одного доступного филиала, иначе 400.
- В UI всегда показывается название филиала (`Shop.name`), а не `branchCode`.

---

## 5. Конкурентность и деньги

- Записи, которые должны быть атомарными (продажа/сток, оплата долга, refresh-токены, создание чека, фиксация прихода), идут через `runSerializableTransaction` (`src/common/serializable-transaction.ts`). Транзакция выполняется в режиме `Serializable`, конфликт `P2034` повторяется.
- Проигравший в гонке получает доменную ошибку (например, 409 `Invoice can no longer be changed`), а не 500.
- Общая логика остатков: `src/common/sale-stock-posting.ts`, `src/common/stock-ledger.ts` (`moveVariantStock`). Денежные расчёты: `src/common/money-calculations.ts`.
- Погашение долга идемпотентно: уникальный ключ `(companyId, debtId, idempotencyKey)`. Повтор с тем же ключом возвращает текущий долг без повторного списания.
- Refresh-токен одноразовый: повторное использование отклоняется с 401 (`Refresh token was already used`).

---

## 6. Потоки данных

### 6.1 POS-продажа (`Sale`)

Основной поток кассы, маршруты из `SalesController`:

```
POST /api/new-sale                       черновик продажи (orders.create)
POST /api/order                          открыть/получить открытую продажу для филиала
GET  /api/new-sale/:id                   карточка черновика
POST /api/new-sale/:id/items             добавить позицию
PATCH /api/new-sale/:id/items/:itemId    изменить количество/цену
PATCH /api/new-sale/:id/customer         привязать клиента
PUT  /api/new-sale/:id/discount          скидка на чек (manual-discount)
POST /api/new-sale/:id/park              отложить (или /leave)
POST /api/new-sale/:id/pay               оплатить (orders.complete)
POST /api/receipts  (или GET /api/receipts/:saleId)   чек по продаже
```

Возвраты и обмены: `POST /api/order/:id/return`, `POST /api/order/:id/exchange` (право `order-return`). При оплате остатки списываются через `sale-stock-posting.ts`, при оплате в долг создаётся `ClientDebt`. Запись `Receipt` создаётся при первом запросе чека (см. [receipts.md](./receipts.md)).

### 6.2 Приход от поставщика (накладная)

Два пути, подробно в [import.md](./import.md):

1. **Фото / PDF накладной:** `/api/supplier-invoices` → файлы → OCR (`recognize`) → автосопоставление → распределение по филиалам → `ready` → `commit` (остатки и цены) → при необходимости `rollback`.
2. **Файл импорта товаров (Excel-подобный):** `/api/v2/imports` → `validate` → `commit`. Сессия хранится в `ProductImportSession`.

### 6.3 Клиенты и долги

- `POST /api/clients/:id/debts`: создаёт `ClientDebt` (`amount_uzs` > 0), опционально с `sale_id`, `shop_id`, `due_date`.
- `POST /api/clients/:id/debts/:debtId/repayment`: создаёт `ClientDebtRepayment`, уменьшает `remainingAmountUzs`, обновляет `status` (`paid` / `partial` / `unpaid`). `debtUzs` клиента пересчитывается как сумма `remainingAmountUzs` его долгов. Обязателен способ оплаты (`payment_method` = id `CompanyPaymentType`).

### 6.4 Чек

Чек формируется один раз при первом запросе (snapshot), дальше печатается из сохранённых данных. Подробности и блоки шаблона: [receipts.md](./receipts.md).

### 6.5 Telegram

- `POST /api/telegram/webhook` принимает обновления Telegram. Проверяется заголовок `x-telegram-bot-api-secret-token` против `TELEGRAM_WEBHOOK_SECRET` (сравнение через `timingSafeEqual`).
- Методы `TelegramService`: `notifyLogin` (вход, из `AuthService`), `notifySale` (оплата), `notifySaleCancelled` и `notifyLowStock` (из `SalesService`), `notifyDebtRepaid` (погашение долга, из `ClientsService`). Ошибки отправки логируются и не прерывают основной запрос.

---

## 7. Frontend (`pet-project`)

Nuxt 4 + Vue 3 + Pinia + `@nuxt/ui` + Tailwind 4, Capacitor iOS. Подробности запуска: [../../pet-project/README.md](../../pet-project/README.md).

| Каталог | Назначение |
|---|---|
| `pages/` | страницы по разделам CRM: `products/` (каталог, приход, импорт, инвентаризация, трансфер, списание, переоценка), `order/` (POS), `clients/`, `reports/`, `analytics/`, `settings/` (чек, ценники, типы оплаты), `management/` (сотрудники, роли), `platform/` (оператор SaaS) |
| `composables/` | доступ к данным: `useApi.ts` (единая точка HTTP), `useAccessControl.ts` (права по маршрутам), `useReceipts.ts`, `useClients.ts`, `import/useSupplierInvoices.ts`, `useProductImport.ts`, `usePlatformAdmin.ts` и др. |
| `store/` | Pinia: `useUserStore` (токен), `cart.ts` (POS, сохранение через `utils/cartPersistence.ts`), `printSettings.ts`, `useLocationStore.ts`, `DataTables/` |
| `middleware/` | `auth.global.ts` (разделение `/platform/*` и CRM), `mobile-scope.global.ts` (ограничение путей в мобильной сборке) |
| `layouts/` | обычный layout CRM и `platform.vue` |
| `server/api/[...path].ts` | Nitro-прокси на `NUXT_API_PROXY_TARGET` |
| `types/` | общие типы: `enums.ts` (union-типы, зеркалящие Prisma enum), `common.ts` (`EntityId`, `Money`, `Quantity`, `IsoDateTime`) |
| `utils/` | чистые функции без фреймворка (тестируются `node --test`), в т.ч. `apiError.ts` |
| `tests/` | `*.test.mjs`: загружают `.ts` через пакет `typescript` и `node:vm` |

Режимы сборки: `web` (SSR, по умолчанию) и `mobile` (`NUXT_APP_MODE=mobile`, `ssr: false`, статический SPA в `.output/public`, это `webDir` Capacitor).

Все HTTP-запросы идут через `useApi().apiFetch`: токен из `useUserStore`, однократный refresh при 401 через `/auth/refresh` (с дедупликацией параллельных запросов).

---

## 8. Известные архитектурные расхождения

Расхождения и их влияние на сопровождение перечислены в [data-model.md](./data-model.md#6-таблица-расхождений). Основные:

- две параллельные модели продажи: `Sale` (Int id, `/api/new-sale`, `/api/order`, `/api/sales`) и `Order` (uuid id, `/api/orders`). В `OrdersService` есть метод `complete`, но HTTP-маршрута завершения заказа в `OrdersController` нет.
- смешанный стиль API: snake_case в большинстве контроллеров и camelCase в DTO модулей `orders`, `supplier-invoices`, `purchase-orders`.
- деньги и остатки во `Float` в части таблиц (`Product`, `ProductVariant`, `ProductStock`, `Receipt` и др.), `Decimal` в остальных.

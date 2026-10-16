# HTTP API

**Последнее обновление:** 2026-10-16

Справочник маршрутов backend. Список собран из декораторов контроллеров (`src/**/*.controller.ts`). Права, guards и примеры ответов проверены по сервисам.

- Базовый URL: `https://api.konkurent-group.uz/api` (прод), локально `http://localhost:3001/api`. Глобальный префикс `api` задан в `src/main.ts`.
- Запросы без префикса `/api` переписываются middleware в `/api/...`, кроме `/uploads`. Но документация и frontend используют полный путь с `/api`.
- Многие маршруты имеют алиасы `v1/...`, `v2/...`, `v3/...`. Пути в таблицах даны без префикса версии, если алиас идентичен по поведению. Алиасы перечислены в декораторах `@Get([...])`.

Связанные документы: [architecture.md](./architecture.md), [data-model.md](./data-model.md), [import.md](./import.md), [receipts.md](./receipts.md).

---

## Аутентификация

- Заголовок: `Authorization: Bearer <access_token>`. Также принимаются `x-authorization` и `x-access-token` (их переносит middleware в `Authorization`).
- Access-токен живёт `JWT_EXPIRES_IN` (по умолчанию 1h). Refresh-токен: `JWT_REFRESH_EXPIRES_IN` (по умолчанию 30d).
- Заголовок `X-Request-Id` возвращается в каждом ответе. Если клиент передал свой, он сохраняется.
- Права: `@Permissions('<key>')` требует **все** ключи, `@AnyPermission(...)` требует **хотя бы один**. Если права заданы и на классе, и на методе, действует **метод** (`getAllAndOverride`).

### Формат ошибок

Ответ ошибки имеет вид `{ statusCode, message, error }`.

| Источник | Пример тела |
|---|---|
| Исключение сервиса (`NotFoundException('Invoice not found')`) | `{"statusCode":404,"message":"Invoice not found","error":"Not Found"}` |
| `ValidationPipe` (ошибки DTO) | `{"statusCode":400,"message":["supplierId must be an integer number"],"error":"Bad Request"}`. `message` здесь **массив строк** |
| `PrismaExceptionFilter` (ошибки Prisma) | `{"statusCode":409,"message":"Record with this data already exists","error":"CONFLICT"}` |
| Ошибка валидации Prisma | `{"statusCode":400,"message":"Invalid data","error":"BAD_REQUEST"}` |

`PrismaExceptionFilter` (`src/common/filters/prisma-exception.filter.ts`) сопоставляет коды Prisma так:

| Код Prisma | HTTP | `message` |
|---|---|---|
| `P2002` | 409 | `Record with this data already exists` |
| `P2025` | 404 | `Record not found` |
| `P2003` | 400 | `Related record not found` |
| `P2014` | 400 | `The provided value violates a required relation` |
| прочие | 500 | `Database error occurred` |

Поле `error` у ответов фильтра берётся из имени статуса (`HttpStatus[status]`). У ошибок `ValidationPipe` и исключений Nest оно текстовое (`Bad Request`, `Not Found`).

Частые коды:

| HTTP | Когда |
|---|---|
| 400 | неверное тело или параметр, нарушение бизнес-правила (`Invoice is not ready`) |
| 401 | нет или неверный токен (`Missing bearer token`), неверный логин/пароль, истёкший refresh |
| 403 | нет права (`Insufficient permissions`), филиал недоступен (`Shop is not available`), не company-пользователь |
| 404 | сущность не найдена в рамках компании |
| 409 | конфликт состояния (`Invoice can no longer be changed`), уникальный ключ, проигрыш конкурентной транзакции |
| 429 | превышен лимит частоты (см. ниже) |
| 500 | необработанная ошибка |

### Лимиты частоты

- По умолчанию **600 запросов в минуту** (`THROTTLE_LIMIT_PER_MINUTE`). Для авторизованных запросов счётчик на токен, для анонимных на IP.
- Маршруты входа (`/auth/login`, `/auth/company-login`, `/auth/platform-login`, `/platform/auth/login`): **20 запросов в минуту на IP**.
- Telegram webhook не ограничивается (`@SkipThrottle`).

### Соглашения об именах

В API смешаны два стиля. Фактическое состояние:

| Стиль | Где |
|---|---|
| `snake_case` | большинство контроллеров: auth (`company_login`, `phone_number`, `refresh_token`), clients (`amount_uzs`, `payment_method`), receipts и cheque (`sale_id`, `is_default`), imports v2 (`shop_id`, `on_match`, `status_code`), products |
| `camelCase` | DTO модулей `modules/orders` (`shopId`, `productId`, `paymentTypeId`), `supplier-invoices` (`supplierId`, `invoiceNumber`), `purchase-orders` |

Для клиента важно сверять ключи с конкретным маршрутом, а не угадывать по соседнему.

---

## Auth (`AuthController`, `src/auth/auth.controller.ts`)

Guard'ов у этого контроллера нет. Токен проверяется внутри `AuthService` (`me`, `platform/auth/me`, `logout`, `set-current-shop`).

| Метод | Путь | Право | Назначение |
|---|---|---|---|
| POST | `/api/auth/company-login` | — (лимит 20/мин на IP) | найти компанию по логину |
| POST | `/api/auth/login` | — (лимит 20/мин на IP) | вход сотрудника компании |
| POST | `/api/auth/platform-login` | — | вход оператора платформы |
| POST | `/api/platform/auth/login` | — | то же, что `platform-login` |
| GET | `/api/auth/me` | токен | профиль текущего пользователя |
| GET | `/api/platform/auth/me` | токен, роль `platform_admin` или `superadmin` | профиль оператора |
| POST | `/api/auth/refresh` | refresh-токен в теле | новая пара токенов |
| POST | `/api/auth/logout` | токен или `refresh_token` | отзыв сессии |
| POST | `/api/platform/auth/logout` | то же | то же |
| PATCH | `/api/user/set-current-shop/:shopId` | токен | сменить текущий филиал |

### POST /api/auth/company-login

Тело:
```json
{ "company_login": "my-company" }
```
Ответ 200: `{ "company": { ... } }`. Ошибка 401: `Company not found`.

### POST /api/auth/login

Тело (все поля обязательны):
```json
{
  "company_login": "my-company",
  "phone_number": "+998901234567",
  "password": "********"
}
```
`phone_number`: `^\+?[0-9]{7,15}$`. `password`: минимум 8 символов.

Ответ 200:
```json
{
  "token": "<access>",
  "access_token": "<access>",
  "refresh_token": "<refresh>",
  "session_id": "<id сессии>",
  "user": { "...профиль: id, роль, филиалы, permissions..." }
}
```
`token` и `access_token` дублируют друг друга (совместимость со старым клиентом). Ошибки: 401 `Company not found`, `User not found`, `Invalid password`.

### POST /api/auth/refresh

Тело: `{ "refresh_token": "<refresh>" }`. Ответ: `{ "token", "access_token", "refresh_token" }` (без `user` и `session_id`, которые есть только у входа). Ошибки 401: `Refresh token is required`, `Invalid refresh token`, `Session is invalid`, `Session expired`, `Refresh token was already used`.

### POST /api/auth/logout

Тело (необязательно): `{ "refresh_token": "<refresh>" }`. Ответ: `{ "message": "Выход выполнен успешно" }`.

### PATCH /api/user/set-current-shop/:shopId

Меняет `User.currentShopId`. Ошибки 400: `This user is not allowed to switch shops` (нет `canSwitchShops` или доступен только один филиал), `This user does not have access to the requested shop` (филиала нет среди доступных), `Platform user cannot switch shops`.

---

## Health

| Метод | Путь | Право | Ответ |
|---|---|---|---|
| GET | `/api/health` | — | `{ "status": "ok" }` |

---

## Company settings (`CompanySettingsController`)

| Метод | Путь | Право | Назначение |
|---|---|---|---|
| GET | `/api/default-currency`, `/api/v1/default-currency` | `JwtAuth`, company | валюта по умолчанию |
| GET | `/api/country`, `/api/v1/country` | — | справочник стран |
| GET | `/api/time-zone`, `/api/v1/time-zone` | — | справочник часовых поясов |
| GET | `/api/v2/company-tariff` | company | тариф компании |
| GET | `/api/company`, `/api/v1/company` | company | профиль компании |
| PUT | `/api/company`, `/api/v1/company` | `company-edit` | изменить профиль |
| GET | `/api/shop`, `/api/v1/shop` | company | список филиалов |
| GET | `/api/v1/shop/:id` | company | филиал |
| GET | `/api/v2/measurement-unit`, `/api/v2/measurement-unit/:id` | company | единицы измерения |
| POST | `/api/v2/measurement-unit` | `catalog-operations` | создать единицу |
| GET | `/api/v2/default-measurement-unit` | company | единица по умолчанию |
| GET | `/api/price-tag`, `/api/price-tag/:id` (+ `v1`) | `JwtAuth`, company | ценники (без PermissionsGuard) |
| POST | `/api/price-tag` (+ `v1`) | `bulk-price-tags` | создать ценник |
| PUT | `/api/price-tag/:id` (+ `v1`) | `bulk-price-tags` | изменить |
| DELETE | `/api/price-tag/:id` (+ `v1`) | `bulk-price-tags` | удалить |
| GET | `/api/company-payment-type` (+ `v1`) | company | типы оплаты компании |
| POST | `/api/company-payment-type` | `payment-type-create` | создать |
| PUT | `/api/company-payment-type/:id` | `payment-type-edit` | изменить |
| DELETE | `/api/company-payment-type/:id` | `payment-type-delete` | удалить |
| GET | `/api/cash-box`, `/api/v1/cash-box` | company | кассы |
| GET | `/api/v1/loyalty-program` | company | программа лояльности |
| PUT | `/api/v1/loyalty-program` | `loyalty-edit` | изменить программу |
| GET | `/api/v2/company-currencies` | company | валюты компании |

Тип оплаты, который видит кассир в POS, — это `CompanyPaymentType`. Его `id` используется в погашении долга (`payment_method`).

---

## Users и роли

### UsersController (`src/users/users.controller.ts`)

Класс: `@UseGuards(JwtAuthGuard)`. Проверки прав и компании выполняются в сервисе. Декоратора `@Permissions` у маршрутов нет.

| Метод | Путь | Назначение |
|---|---|---|
| GET | `/api/users` | список пользователей компании |
| GET | `/api/user`, `/api/v1/user` | текущий пользователь |
| GET | `/api/v2/user/:id/permissions` | права пользователя |
| POST | `/api/users/add` | создать сотрудника |
| GET | `/api/users/:id` | сотрудник |
| PUT | `/api/users/:id` | изменить |
| PATCH | `/api/users/:id/status` | блокировка / разблокировка |
| PATCH | `/api/users/:id/restore` | восстановить |
| DELETE | `/api/users/:id` | удалить |
| GET | `/api/user/profile` | профиль |
| PATCH | `/api/user/profile` | изменить профиль |
| PATCH | `/api/user/profile/password` | сменить пароль |
| POST | `/api/user/profile/avatar` | загрузить аватар (картинка) |
| DELETE | `/api/user/profile/avatar` | удалить аватар |
| GET | `/api/company/roles` | роли компании (`CompanyRole`) |
| POST | `/api/company/roles` | создать |
| PUT | `/api/company/roles/:id` | изменить |
| PATCH | `/api/company/roles/:id/status` | активность |
| DELETE | `/api/company/roles/:id` | удалить |

### RolesController (`src/roles/roles.controller.ts`)

**Без guard'ов.** Токен передаётся в заголовке `Authorization` и проверяется в `RolesService` через `UsersService.assertAdminAccess`. Компания берётся из токена, query `company_id` допустим только для платформы.

| Метод | Путь | Назначение |
|---|---|---|
| POST | `/api/v2/role` | создать CRM-роль |
| GET | `/api/v2/role` | список (`?company_id=` для платформы) |
| GET | `/api/v2/role/:id` | роль |
| GET | `/api/v2/role/:id/permissions` | права роли |
| PUT | `/api/v2/role/:id` | изменить |
| PUT | `/api/v2/role/:id/permissions` | задать права |
| DELETE | `/api/v2/role/:id` | удалить |

---

## Catalog и продукты (`ProductsController`, `ProductAttributesController`, `AttributeDictionariesController`)

Класс `ProductsController`: `JwtAuthGuard, CompanyAccessGuard, PermissionsGuard`. Право по умолчанию `catalog-operations` задано на методах.

### Основные маршруты

| Метод | Путь | Право |
|---|---|---|
| GET | `/api/products/search` | `catalog-operations` |
| GET | `/api/products` | `catalog-operations` |
| POST | `/api/products` | `catalog-operations` |
| GET | `/api/products/:id/variants` | `catalog-operations` |
| POST | `/api/products/:id/variants` | `catalog-operations` |
| POST | `/api/products/variant-barcodes` | `catalog-operations` |
| GET | `/api/products/:id/variant-matrix` | `catalog-operations` |
| PATCH | `/api/product-variants/:id` | `catalog-operations` |
| GET | `/api/product-colors`, `/api/product-sizes`, `/api/product-size-grids` | `catalog-operations` |
| GET | `/api/v2/product` | `catalog-operations` |
| GET | `/api/v2/product-stats` | `catalog-operations` |
| GET | `/api/v2/catalog/filter-options` | `catalog-operations` |
| GET | `/api/v2/product/:id` | `catalog-operations` |
| POST | `/api/v2/product` | `catalog-operations` |
| POST | `/api/v2/product/create` | `catalog-operations` |
| POST | `/api/v2/product/photo` | `product-photo` (multipart, картинка) |
| PUT | `/api/v2/product/:id` | `product-edit` |
| PATCH | `/api/v2/product/:id/identifiers` | `product-edit` |
| PUT | `/api/v2/products/bulk/archive` | `product-edit` |
| DELETE | `/api/v2/products/archived` | `product-edit` |
| DELETE | `/api/v2/products/bulk/delete` | `product-edit` |
| POST | `/api/v2/product/generate-sku` | `product-create` |
| POST | `/api/v2/product/generate-barcode` | `product-create` |
| GET | `/api/v2/product-characteristic` | `catalog-operations` |
| GET | `/api/v2/product-movement/:id` | `catalog-operations` |
| GET | `/api/v2/stock-movements` | `catalog-operations` |
| POST | `/api/v2/product-search-with-filters` | `catalog-operations` |
| POST | `/api/v2/product-search-stats-with-filters` | `catalog-operations` |

### Трансферы между филиалами

| Метод | Путь | Право |
|---|---|---|
| GET | `/api/v2/transfer`, `/api/v2/transfer/:id` | `transfers.read` |
| POST | `/api/v2/transfer` | `transfer-create` |
| GET | `/api/v2/transfer-products/:id`, `/api/v2/transfer-items/:id` | `transfers.read` |
| POST | `/api/v2/transfer/:id/items` | `transfer-create` |
| POST | `/api/v2/transfer/:id/send` | `transfer-create` |
| POST | `/api/v2/transfer/:id/accept` | `transfer-check` |
| POST | `/api/v2/transfer/:id/accept-verified` | `transfer-check` |
| POST | `/api/v2/transfer/:id/cancel` | `transfer-create` |

### Импорт товаров из файла и инвентаризация

Маршруты `/api/v2/imports*`, `/api/v2/excel/*`, `/api/v2/import*`, `/api/v2/stocktaking*`. Полный сценарий и статусы в [import.md](./import.md#1-импорт-товаров-из-файла-v2imports).

| Метод | Путь | Право |
|---|---|---|
| POST | `/api/v2/imports` | `imports.write` |
| GET | `/api/v2/imports` | `imports.read` |
| GET | `/api/v2/imports/:id` | `imports.read` |
| POST | `/api/v2/imports/:id/validate` | `imports.write` |
| POST | `/api/v2/excel/validate-import` | `imports.write` |
| GET | `/api/v2/import-progress/:id` | `imports.read` |
| GET | `/api/v2/import-search/:id` | `imports.read` |
| GET | `/api/v2/import-items-dp/:id` | `imports.read` |
| POST | `/api/v2/imports/:id/commit` | `import-check` |
| POST | `/api/v2/import-commit/:id` | `import-check` |
| POST | `/api/v2/imports/:id/cancel` | `imports.write` |
| POST | `/api/v2/imports/:id/rollback` | `import-delete` (`?dry_run=true`) |
| POST | `/api/v2/excel/import-without-check` | `import-create` и `import-check` |
| GET | `/api/v2/excel/import-properties` | `imports.read` |
| POST | `/api/v2/import/inventory` | `imports.write` |
| GET | `/api/v2/stocktaking/:id` | `imports.read` |
| GET | `/api/v2/stocktaking-logs/:id` | `imports.read` |
| PATCH | `/api/v2/stocktaking/:id/set-product-by-barcode` | `imports.write` |
| POST | `/api/v2/stocktaking/:id/accept` | `import-check` |

### Пример: создание сессии импорта

`POST /api/v2/imports`, тело (поля из `buildCreateBody` фронтенда; `rows` обязателен, иначе 400 `rows must be an array`):
```json
{
  "name": "Приход октябрь",
  "shop_id": "<uuid филиала>",
  "mode": "with_check",
  "generate_barcode": true,
  "generate_sku": false,
  "properties": [],
  "on_match": {
    "name": "keep_store",
    "supply_price": "from_file"
  },
  "rows": [
    { "name": "Футболка", "sku": "T-01", "color_name": "Белый", "size_name": "M", "quantity": 5, "supply_price": 40000, "retail_price": 75000 }
  ]
}
```
`on_match` принимает значения `keep_store` (по умолчанию) и `from_file`. Ключи: `name`, `brand`, `category`, `description`, `measurement_unit`, `supplier`, `supply_price`, `retail_price`, `color`. Неизвестный ключ даёт 400 `on_match.<key> is not supported`.

Ответ: сводка сессии с полями `id`, `import_id`, `name`, `mode`, `status` (человекочитаемое), `status_code`, `shop_id`, `branch_code`, `branch_name`, `requires_approval`, `can_commit`, `is_finished`, `rows_count`, `on_match`, `dry_run_summary`, `result`.

---

## Атрибуты товаров и справочники

### AttributeDictionariesController (`src/attribute-dictionaries/`)

| Метод | Путь | Право / guard |
|---|---|---|
| GET | `/api/attributes/:type` | `catalog-operations` (`type`: COLOR, SIZE, SEASON) |
| POST | `/api/attributes/:type` | `catalog-operations` |
| POST | `/api/attributes/link` | `catalog-operations` |
| PATCH | `/api/attributes/:id` | `catalog-operations` |
| DELETE | `/api/attributes/:id` | `catalog-operations` |
| GET/POST/PATCH | `/api/admin/attributes`, `/api/admin/attributes/:id` | `PlatformAdminGuard` (системный справочник) |

Подробности: [attribute-dictionaries.md](./attribute-dictionaries.md).

### ProductAttributesController (`src/product-attributes/`)

Все маршруты `catalog-operations`.

| Метод | Путь |
|---|---|
| GET | `/api/product-categories` |
| GET, POST | `/api/product-attributes` |
| PATCH, DELETE | `/api/product-attributes/:id` |
| POST | `/api/product-attributes/:id/options` |
| PATCH, DELETE | `/api/product-attributes/:id/options/:optionId` |
| PUT | `/api/product-variants/:id/attributes` |
| GET, PUT | `/api/products/:id/attributes` |
| POST | `/api/product-colors`, PATCH, DELETE `/api/product-colors/:id` |
| POST | `/api/product-sizes`, PATCH, DELETE `/api/product-sizes/:id` |
| GET, POST | `/api/product-seasons`, PATCH, DELETE `/api/product-seasons/:id` |

---

## Продажи (POS, `SalesController`)

Класс: `JwtAuthGuard, CompanyAccessGuard, PermissionsGuard`, право по умолчанию `orders.read`. Модель: `Sale` (Int id). Полный поток: [architecture.md](./architecture.md#61-pos-продажа-sale).

| Метод | Путь | Право |
|---|---|---|
| GET | `/api/sales` | `sales.read` |
| POST | `/api/new-sale` | `orders.create` |
| POST | `/api/order`, `/api/v2/order` | `orders.create` |
| GET | `/api/order/:id`, `/api/v2/order/:id` | `orders.read` |
| GET | `/api/order/:id/audit-logs` | `sales.read` |
| GET | `/api/order-draft-debt/:id` | `orders.read` |
| GET | `/api/order-search`, `/api/v3/order-search` | `sales.read` |
| GET | `/api/order-search-stats`, `/api/v3/order-search-stats` | `sales.read` |
| GET | `/api/parked-sales`, `/api/draft-sales` (+ `v2`) | `orders.read` |
| GET | `/api/new-sale/products` (+ `v2`) | `orders.read` (параметры `page`, `limit`, `search`, `shop_id`) |
| GET | `/api/new-sale/:id`, `/api/new-sale/:id/items` | `orders.read` |
| POST | `/api/new-sale/:id/items` | `orders.create` |
| PATCH | `/api/new-sale/:id/items/:itemId` (+ `v1`, `v2`) | `orders.create` |
| DELETE | `/api/new-sale/:id/items/:itemId` (+ `v1`, `v2`) | `orders.create` |
| PUT | `/api/new-sale/:id/discount` | `manual-discount` |
| PATCH | `/api/new-sale/:id/customer` или `/client` (+ `v1`, `v2`) | `orders.create` |
| POST | `/api/new-sale/:id/pay` | `orders.complete` |
| POST | `/api/new-sale/:id/park` или `/leave` (+ `v1`, `v2`) | `orders.create` |
| POST | `/api/leave-sale/:id` (+ `v1`, `v2`) | `orders.create` |
| POST | `/api/parked-sales/:id/resume`, `/api/draft-sales/:id/resume` (+ `v2`) | `delay-finish` |
| DELETE | `/api/new-sale/:id` | `orders.cancel` |
| DELETE | `/api/order/:id` (+ `v2`) | `order-delete` |
| POST | `/api/order-payment/:id` (+ `v2`) | `orders.create` |
| POST | `/api/order/:id/return` (+ `v2`) | `order-return` |
| POST | `/api/order/:id/exchange` (+ `v2`) | `order-return` |
| PATCH | `/api/order/:id/payment-method` (+ `v2`) | `payment-type` |
| PATCH | `/api/order/:id/date` (+ `v2`) | `order-date` |

### POST /api/new-sale/:id/pay

Ответ при успешной оплате (`SalesService.payOrder`): `{ "order_type": "SALE", "should_print_cheque": true }`. Если продажа уже не черновик, ответ тот же. После оплаты уходит уведомление в Telegram (`notifySale`, ошибка не прерывает ответ).

### POST /api/order

Открывает или получает открытую продажу для филиала (`shop_id` в теле необязателен). Ответ в виде конверта:
```json
{
  "session_id": "<uuid>",
  "status_code": 200,
  "id": "123",
  "error": { "code": "", "message": "" },
  "data": { "id": "123", "order_number": "S-2026-0001", "order_type": "SALE" },
  "correlation_id": "<uuid>",
  "topic": "v2.order_service.order.created"
}
```

Многие другие маршруты продаж возвращают сводку черновика (`toDraftSummary`): `id`, `sid`, `number`, `order_number`, `status`, `park_status`, `park_note`, `discount_percent`, `discount_amount`, `payable_total`, `client_id`, `customer_id`, `client_name`. Денежные поля приходят числами.

---

## Заказы (модуль `orders`, модель `Order`)

Параллельный API на модели `Order` (uuid id). DTO в camelCase. Завершения заказа (complete) по HTTP **нет**: метод `OrdersService.complete` не подключён к контроллеру. Подробности в [data-model.md](./data-model.md#6-таблица-расхождений).

| Метод | Путь | Право | Тело (DTO) |
|---|---|---|---|
| POST | `/api/orders` | `orders.create` | `CreateOrderDto`: `shopId`, `cashboxId?` |
| GET | `/api/orders/:id` | `orders.read` | — |
| POST | `/api/orders/:id/items` | `orders.create` | `AddOrderItemDto`: `productId` (string), `quantity` (≥ 0.001) |
| PATCH | `/api/orders/:id/items/:itemId` | `orders.create` | `UpdateOrderItemDto`: `quantity` |
| DELETE | `/api/orders/:id/items/:itemId` | `orders.create` | — |
| POST | `/api/orders/:id/payments` | `payments.create` | `AddPaymentDto`: `paymentTypeId`, `amount` |
| DELETE | `/api/orders/:id/payments/:paymentId` | `payments.create` | — |
| PATCH | `/api/orders/:id/discount` | `orders.create` | `ApplyDiscountDto`: `discountAmount` |
| PATCH | `/api/orders/:id/customer` | `orders.create` | `AttachCustomerDto`: `customerId` или `clientId` (одно из двух обязательно) |
| PATCH | `/api/orders/:id/comment` | `orders.create` | `UpdateOrderCommentDto`: `comment?` |
| POST | `/api/orders/:id/cancel` | `orders.cancel` | — |
| POST | `/api/orders/:id/park` | `orders.create` | — |
| POST | `/api/orders/:id/resume` | `orders.create` | — |

Типы оплаты: `GET/POST /api/payment-types` (`payment-types.read`, `payment-type-create`). Кассы: `GET/POST /api/cashboxes` (`cashboxes.read`, `cashbox-create`).

---

## Клиенты (`ClientsController`)

Класс: `JwtAuthGuard, CompanyAccessGuard, PermissionsGuard`, право по умолчанию `clients`.

| Метод | Путь | Право |
|---|---|---|
| POST | `/api/clients` | `client-card-edit` |
| GET | `/api/clients` | `clients` |
| GET | `/api/v1/customers-list` | `clients` |
| GET | `/api/v1/customers-stats` | `clients` |
| GET | `/api/clients/filters` | `clients` |
| GET, POST | `/api/client-groups` (создание: `client-card-edit`) | `clients` |
| GET, POST | `/api/client-tags` (создание: `client-card-edit`) | `clients` |
| GET | `/api/clients/debts` | `debt-detail` |
| GET | `/api/clients/:id`, `/api/v1/customer/:id` | `client-card` |
| PATCH | `/api/clients/:id` | `client-card-edit` |
| GET, POST | `/api/clients/:id/notes` (POST: `client-card-edit`) | `client-card` |
| GET | `/api/clients/:id/history` | `client-card` |
| GET | `/api/clients/:id/preferences` | `client-card` |
| GET | `/api/clients/:id/debts` | `debt-detail` |
| POST | `/api/clients/:id/debts` | `debt-edit` |
| POST | `/api/clients/:id/debts/:debtId/repayment` | `debt-cancel` |
| GET, POST | `/api/clients/:id/cards` (POST: `client-card-edit`) | `client-card` |

### POST /api/clients/:id/debts

Тело:
```json
{
  "amount_uzs": 150000,
  "shop_id": "<uuid филиала, необязательно>",
  "sale_id": 123,
  "due_date": "2026-11-01",
  "comment": "Оплата до конца месяца"
}
```
`amount_uzs` обязателен и должен быть положительным (иначе 400 `amount_uzs must be a positive number`). Если передан `sale_id`, продажа должна принадлежать этому клиенту (иначе 404 `Sale not found`).

### POST /api/clients/:id/debts/:debtId/repayment

Тело:
```json
{
  "amount_uzs": 50000,
  "payment_method": "<id CompanyPaymentType>",
  "idempotency_key": "9b1e5f0e-..."
}
```
- `amount_uzs` (или `amount`) обязателен и положителен.
- `payment_method` (или `paymentMethod`) обязателен: иначе 400 `Выберите способ оплаты`. Неизвестный тип: 400 `Способ оплаты не найден`.
- `idempotency_key` (или `idempotencyKey`) не длиннее 128 символов. Повтор с тем же ключом возвращает текущий долг без повторного списания.
- Ошибки: 404 `Debt not found`, 400 `Debt is already repaid`, 400 `Debt was changed by another repayment` (конкурентное изменение, повторите запрос).

---

## Чеки и шаблоны (`ReceiptsController`)

Подробно: [receipts.md](./receipts.md).

| Метод | Путь | Право |
|---|---|---|
| GET | `/api/receipts/:saleId` (+ `v1`) | `RECEIPT_PERMISSIONS` (любое из списка) |
| GET | `/api/receipts/by-number/:number` (+ `v1`) | то же |
| POST | `/api/receipts` (+ `v1`) | то же, тело `{ "sale_id": 123 }` |
| POST | `/api/receipts/:saleId/mark-printed` (+ `v1`) | то же |
| GET | `/api/cheque-settings` (+ `v1`) | `JwtAuth`, company (без PermissionsGuard), `?template_id=` |
| GET | `/api/cheque` (+ `v1`) | `JwtAuth`, company (без PermissionsGuard) |
| GET | `/api/cheque/:id` (+ `v1`) | `JwtAuth`, company (без PermissionsGuard) |
| POST | `/api/cheque` (+ `v1`) | `cheque-edit` |
| PUT | `/api/cheque/:id` (+ `v1`) | `cheque-edit` |
| DELETE | `/api/cheque/:id` (+ `v1`) | `cheque-edit` |

`RECEIPT_PERMISSIONS`: `new-sale`, `order-new`, `manual-discount`, `order-debt`, `delay-finish`, `sell-gift-card`, `pay-gift-card`, `order-return`, `all-sales`, `orders`, `show-all-sales`, `show_deleted_orders`, `orders-other-shops`, `cash-shifts`, `all-clients`, `clients`.

### GET /api/receipts/:saleId

Создаёт чек при первом запросе и возвращает его (snapshot не пересчитывается). Ответ (сокращённо):
```json
{
  "id": "<uuid>",
  "sale_id": 123,
  "number": "S-2026-0001",
  "status": "CREATED",
  "created_at": "2026-10-16T09:12:00.000Z",
  "shop_id": "<uuid>",
  "branch_code": "001",
  "manager_name": "Иван Иванов",
  "manager_phone": "998901234567",
  "seller_name": "Иван",
  "client_name": "Петров Пётр",
  "client_phone": "998900000000",
  "sale_comment": null,
  "items": [ { "name": "Футболка", "sku": "T-01", "quantity": 2, "price": 75000, "total": 150000, "discount": 0, "discountPercent": 0 } ],
  "item_count": 2,
  "currency": "UZS",
  "subtotal": 150000,
  "discount": 0,
  "discount_percent": 0,
  "cashback_earned": 0,
  "total_due": 150000,
  "paid_cash": 150000,
  "paid_card": 0,
  "paid_cashback": 0,
  "loyalty_type": "cashback",
  "debt": 0,
  "balance_before": 0,
  "balance_added": 0,
  "balance_deducted": 0,
  "balance_after": 0,
  "debt_before": 0,
  "debt_added": 0,
  "debt_paid": 0,
  "debt_after": 0,
  "qr_payload": "https://<frontend>/order/all?receipt=S-2026-0001",
  "printed_at": null,
  "sent_at": null,
  "shop": { "...название, адрес, телефоны филиала..." },
  "company": { "...юридические данные компании..." }
}
```
Ошибка 404 `Sale not found` (продажа не найдена или филиал вне `allowedBranchCodes`).

### POST /api/receipts/:saleId/mark-printed

Ставит `status = PRINTED` и `printedAt`. Ответ: `{ "id": "<uuid>", "status": "PRINTED", "printed_at": "..." }`.

### GET /api/cheque-settings

Ответ — шаблон для печати (`toSettingsResponse`). Поля: `id`, `name`, `is_default`, `has_information_block`, `has_lower_block`, `paper_width`, `printable_width`, `offset_mm`, `feed_mm`, `print_mode` (`browser` / `pdf`), `font_size`, `divider_style`, `divider_gap`, `section_gap`, `item_dividers`, `has_logo`, `logo_url`, `logo_width`, `has_brand_name`, `brand_name`, `brand_tagline`, `brand_name_size`, `has_additional_image`, `additional_image_url`, `footer_message`, `footer_note`, `qr_code_url`, `element_styles`, `blocks`.

`blocks` — массив: `{ "key", "block_type", "name", "sequence_number", "is_active" }`, отсортирован по `sequence_number`. Список ключей и значения по умолчанию: `src/receipts/cheque-blocks.constant.ts`.

### GET /api/cheque

Ответ: `{ "items": [ { "id", "name", "is_default", "paper_width", "print_mode", "created_at", "updated_at" } ], "page", "limit", "total" }`. Query: `name` (поиск без учёта регистра), `page` (по умолчанию 1), `limit` (по умолчанию 10, максимум 100).

### PUT /api/cheque/:id

Все поля необязательны. Основные (проверки из `UpdateChequeSettingsDto`):

| Поле | Ограничение |
|---|---|
| `name` | строка, пустое значение заменяется на `Новый чек` |
| `is_default` | `true` делает шаблон основным; `false` для основного шаблона отклоняется |
| `paper_width` | целое 20–220 |
| `printable_width` | целое 0–220 (0 = по умолчанию для рулона) |
| `offset_mm` | целое 0–30 |
| `feed_mm` | целое 0–100 |
| `print_mode` | `browser` или `pdf` |
| `font_size` | целое ≥ 6 |
| `divider_style` | `single`, `double`, `none` |
| `logo_url` | строка до 90 000 символов (data: URL или https) |
| `logo_width` | целое 20–100 |
| `brand_name` / `brand_tagline` | до 60 / 80 символов |
| `brand_name_size` | целое 14–40 |
| `qr_code_url` | пустая строка или URL http(s) |
| `blocks` | массив `{ "key", "is_active"?, "sequence_number"? }`, неизвестные ключи игнорируются |

Пример тела:
```json
{
  "name": "Основной 80 мм",
  "paper_width": 80,
  "print_mode": "browser",
  "blocks": [
    { "key": "shop_name", "is_active": true, "sequence_number": 10 },
    { "key": "address", "is_active": true }
  ]
}
```
Ответ: обновлённый шаблон (`toSettingsResponse`). Ошибки: 404 `Cheque template not found`, 400 `Нельзя снять этот шаблон с "по умолчанию" — сначала назначьте другой...`.

### DELETE /api/cheque/:id

Ответ: `{ "success": true }`. Нельзя удалить основной шаблон (400 `Нельзя удалить шаблон по умолчанию...`).

---

## Приходы от поставщиков (`SupplierInvoicesController`)

Класс: `JwtAuthGuard, CompanyAccessGuard, PermissionsGuard`, право `import-details`. Подробный сценарий, статусы и обработка ошибок: [import.md](./import.md#2-приход-по-фото-или-pdf-накладной-supplier-invoices).

| Метод | Путь | Право | Примечание |
|---|---|---|---|
| POST | `/api/supplier-invoices` | `import-create` | создать черновик |
| GET | `/api/supplier-invoices` | `import-details` | список с пагинацией |
| GET | `/api/supplier-invoices/:id` | `import-details` | карточка |
| POST | `/api/supplier-invoices/:id/files` | `import-create` | multipart, поле `files` |
| GET | `/api/supplier-invoices/:id/files/:fileIndex` | `import-details` | скачать оригинал |
| POST | `/api/supplier-invoices/:id/recognize` | `import-check` | OCR (PaddleOCR или OpenAI) |
| POST | `/api/supplier-invoices/:id/recognized-items` | `import-check` | добавить строки вручную |
| PATCH | `/api/supplier-invoices/:id/items/:itemId` | `import-check` | исправить строку |
| DELETE | `/api/supplier-invoices/:id/items/:itemId` | `import-check` | удалить строку |
| POST | `/api/supplier-invoices/:id/auto-match` | `import-check` | предложения сопоставления |
| POST | `/api/supplier-invoices/:id/items/:itemId/match` | `import-check` | подтвердить товар |
| POST | `/api/supplier-invoices/:id/items/merge` | `import-check` | объединить строки |
| POST | `/api/supplier-invoices/:id/allocations` | `import-check` | распределить по филиалам |
| POST | `/api/supplier-invoices/:id/ready` | `import-check` | перевести в READY |
| POST | `/api/supplier-invoices/:id/commit` | `import-check` | провести приход |
| POST | `/api/supplier-invoices/:id/cancel` | `import-delete` | отменить черновик |
| POST | `/api/supplier-invoices/:id/rollback` | `import-delete` | откатить проведённый приход |

### POST /api/supplier-invoices

Тело (`CreateSupplierInvoiceDto`):
```json
{
  "supplierId": 4,
  "invoiceNumber": "A-1024",
  "invoiceDate": "2026-10-15",
  "idempotencyKey": "3f1c2a9e-..."
}
```
- `supplierId` — целое ≥ 1, обязательно. Поставщик должен быть активным (иначе 404 `Supplier not found`).
- `invoiceNumber` — до 100 символов. Если такой номер уже есть у того же поставщика (кроме отменённых и откаченных), в ответе будет `duplicateWarning`.
- `idempotencyKey` — до 128 символов, уникален в пределах компании. Повтор с тем же ключом даёт **409** (`P2002`), а не возвращает существующий приход.

Ответ (код 201):
```json
{
  "invoice": { "id": "<uuid>", "intId": 17, "status": "DRAFT", "supplier": { "...": "..." }, "items": [], "...": "..." },
  "duplicateWarning": null
}
```

### GET /api/supplier-invoices

Query: `page` (≥ 1), `limit` (1–100, по умолчанию 20), `status` (`DRAFT`, `PROCESSING`, `REVIEW`, `READY`, `COMMITTED`, `CANCELLED`, `ROLLED_BACK`), `supplierId`. Ответ: `{ "data": [ ... ], "meta": { "page", "limit", "total" } }`. Сортировка по `createdAt` по убыванию.

### GET /api/supplier-invoices/:id

Ответ — приход с `supplier`, `createdBy` (id, имя, фамилия), `items` (с `matchedProduct` и `allocations.shop`) и `originalFiles`. Поле `path` (внутренний путь на сервере) в ответ не попадает. Каждому файлу добавляется `url` вида `/api/supplier-invoices/<id>/files/<index>`.


Ошибка 404 `Invoice not found` (также логируется с `id` и `companyId`).

### POST /api/supplier-invoices/:id/files

Multipart, поле `files` (до 10 файлов, по 20 МБ). Допустимые типы: `image/jpeg`, `image/png`, `image/webp`, `application/pdf`. Иначе 400 `OCR accepts JPG, PNG, WEBP and PDF files only`. Переводит приход в `PROCESSING`. Если приход уже не редактируется, 400 `Invoice files can no longer be changed`.

Ответ: `{ "files": [ { "name", "mimeType", "size", "url" } ] }`.

### POST /api/supplier-invoices/:id/recognize

Запускает OCR по загруженным файлам, **заменяет все строки** прихода распознанными и переводит в `REVIEW`. Ручные правки строк будут потеряны. Таймаут клиента на этот запрос во фронтенде 10 минут.

Ответ: приход с новыми строками. Ошибки: 409 `Invoice can no longer be changed`, 400 `items are required` (OCR не нашёл строк), 400 `Invalid recognized invoice date`.

### POST /api/supplier-invoices/:id/recognized-items

Тело: `{ "items": [ { "rawName": "Футболка", "sku"?, "barcode"?, "quantity": 5, "supplyPrice": 40000, "totalPrice"? } ] }`. Добавляет строки (не заменяя существующие) и переводит приход в `REVIEW`. `quantity` > 0, `supplyPrice` ≥ 0. Если `totalPrice` не передан, считается как `quantity × supplyPrice`. Если `totalPrice` отличается от `quantity × supplyPrice` больше чем на `max(1, 1%)`, добавляется предупреждение `TOTAL_MISMATCH`.

### PATCH /api/supplier-invoices/:id/items/:itemId

Тело (все поля необязательны): `correctedName`, `rawName`, `sku`, `barcode`, `quantity`, `supplyPrice`. Правки сохраняются в `corrected*`, исходные значения (`rawName`, `rawSku`, `rawBarcode`) не меняются. Ошибка 404 `Invoice item not found`.

### POST /api/supplier-invoices/:id/auto-match

Ищет совпадения по псевдонимам поставщика (`SupplierProductAlias`) и по товарам. **Не привязывает товар.** Ставит строке `status` = `NEEDS_REVIEW` (есть кандидат) или `NEW_PRODUCT` (нет). Ответ:
```json
{
  "summary": { "total": 3, "matched": 0, "needsReview": 2, "newProducts": 1 },
  "items": [
    { "invoiceItemId": "<uuid>", "rawName": "<исходное название>", "product": { "...карточка товара-кандидата..." }, "variantId": null, "matchMethod": "<метод из ImportMatcherService>", "confidence": "<число>", "conflict": false, "status": "NEEDS_REVIEW" }
  ]
}
```
Значения `matchMethod` и `confidence` задаёт `ImportMatcherService`. Поле `matched` в сводке считает строки в статусе `MATCHED`. Автосопоставление такой статус не ставит, поэтому после него `matched` всегда 0.

### POST /api/supplier-invoices/:id/items/:itemId/match

Тело: `{ "productId": 42 }`. Привязывает товар вручную: `matchMethod` = `USER_CONFIRMED`, `confidence` = 100, `status` = `MATCHED`, `userConfirmed` = true. Создаёт или обновляет `SupplierProductAlias` (псевдоним для будущих накладных). Ошибки: 404 `Product not found`, 404 `Product variant not found`.

### POST /api/supplier-invoices/:id/items/merge

Тело: `{ "itemIds": ["<uuid>", "<uuid>"] }`, минимум две строки. Только в `REVIEW`. Ошибки: 400 `Items can only be merged during review`, `Select at least two items`, `Some items do not belong to invoice`, `Remove allocations before merging items`.

### POST /api/supplier-invoices/:id/allocations

Тело:
```json
{
  "allocations": [
    { "invoiceItemId": "<uuid строки>", "shopId": "<uuid филиала>", "quantity": 3 },
    { "invoiceItemId": "<uuid строки>", "shopId": "<uuid филиала 2>", "quantity": 2 }
  ]
}
```
Полностью заменяет распределение прихода. `shopId` должен входить в доступные пользователю филиалы (иначе 403 `Shop is not available`). Пара `(строка, филиал)` не должна повторяться (400 `Duplicate allocation`). Ответ: приход целиком.

### POST /api/supplier-invoices/:id/ready

Проверяет, что все строки в `MATCHED` с `matchedProductId`, и что сумма распределения по филиалам равна `quantity` строки (допуск 0.0001). Иначе 400: `Every item must be matched`, `Item <id> is not fully allocated`, `Invoice has no items`. Переводит в `READY`.

### POST /api/supplier-invoices/:id/commit

Тело (необязательно): `{ "supplyPriceStrategy": "LAST_PURCHASE" | "WEIGHTED_AVERAGE" | "MANUAL" }`. Если не передано, берётся `Company.supplyPriceStrategy`, по умолчанию `LAST_PURCHASE`.

Проводит приход в одной транзакции `Serializable`: увеличивает остатки по филиалам (`moveVariantStock`), пишет движения `PURCHASE` с `externalId` = id прихода, пересчитывает `Product.quantity` и закупочную цену по стратегии, ставит `COMMITTED`, `committedAt`, `totalQuantity`, `totalAmount`.

Ответ: `{ "id": "<uuid>", "status": "COMMITTED" }`.

Ошибки: 404 `Invoice not found`, 409 `Invoice already committed`, 400 `Invoice is not ready`, 400 `Invalid item allocation`, 404 `Matched product not found`, 400 `Invalid supply price strategy`.

### POST /api/supplier-invoices/:id/cancel

Отменяет приход, который ещё не проведён (`DRAFT`, `PROCESSING`, `REVIEW`, `READY`). Ответ: `{ "id", "status": "CANCELLED" }`. Иначе 409 `Invoice cannot be cancelled`.

### POST /api/supplier-invoices/:id/rollback

Откатывает проведённый приход (`COMMITTED`) обратными движениями. Ответ: `{ "id", "status": "ROLLED_BACK" }`. Ошибки 409: `Only committed invoice can be rolled back`, `Invoice stock movements not found` (движений нет, например приход проведён до появления функции отката).

---

## Поставщики (`SuppliersController`)

| Метод | Путь | Право |
|---|---|---|
| GET | `/api/suppliers` | `supplier-list` |
| POST | `/api/suppliers` | `supplier-create` |
| GET | `/api/suppliers/:id` | `supplier-list` |
| PATCH | `/api/suppliers/:id` | `supplier-edit` |
| GET | `/api/suppliers/:id/product-aliases` | `supplier-list` |
| POST | `/api/suppliers/:id/product-aliases` | `supplier-edit` |
| PATCH | `/api/suppliers/:id/product-aliases/:aliasId` | `supplier-edit` |
| DELETE | `/api/suppliers/:id/product-aliases/:aliasId` | `supplier-edit` |

---

## Заказы поставщикам (`PurchaseOrdersController`)

Класс: `JwtAuthGuard, CompanyAccessGuard, PermissionsGuard`, право на классе `AnyPermission(all-orders, order-detail)`. Модель `PurchaseOrder`, статусы `DRAFT`, `SENT`, `PARTIAL`, `RECEIVED`, `CANCELLED`.

| Метод | Путь | Право (любое из) |
|---|---|---|
| GET | `/api/v1/purchase-orders` | `all-orders`, `order-detail` |
| GET | `/api/v1/purchase-orders/:id` | `all-orders`, `order-detail` |
| POST | `/api/v1/purchase-orders` | `order-create` |
| PATCH | `/api/v1/purchase-orders/:id` | `order-edit`, `order-create` |
| POST | `/api/v1/purchase-orders/:id/send` | `order-edit`, `order-create` |
| POST | `/api/v1/purchase-orders/:id/receive` | `order-accept` |
| POST | `/api/v1/purchase-orders/:id/close` | `order-accept` |
| POST | `/api/v1/purchase-orders/:id/cancel` | `order-edit`, `order-create` |

---

## Склад и инвентаризация (`WarehouseController`)

Класс: право `inventory-list`.

| Метод | Путь | Право |
|---|---|---|
| GET | `/api/v1/write-offs` | `write-offs` |
| GET | `/api/v1/inventory` | `inventory-list` |
| GET | `/api/v1/revaluation` | `product-revaluation` |
| GET | `/api/v1/inventory-sessions` | `inventory-list` |
| POST | `/api/v1/inventory-sessions` | `inventory-create` |
| GET | `/api/v1/inventory-sessions/:id` | `inventory-result` |
| PATCH | `/api/v1/inventory-sessions/:id` | `inventory-create` |
| POST | `/api/v1/inventory-sessions/:id/start` | `inventory-create` |
| GET | `/api/v1/inventory-sessions/:id/items` | `inventory-result` |
| POST | `/api/v1/inventory-sessions/:id/items` | `inventory-create` |
| PATCH | `/api/v1/inventory-sessions/:id/items/:itemId/count` | `inventory-create` |
| POST | `/api/v1/inventory-sessions/:id/scan` | `inventory-create` |
| GET | `/api/v1/inventory-sessions/:id/summary` | `inventory-result` |
| POST | `/api/v1/inventory-sessions/:id/submit` | `inventory-create` |
| POST | `/api/v1/inventory-sessions/:id/mark-uncounted-as-zero` | `inventory-finish` |
| POST | `/api/v1/inventory-sessions/:id/items/:itemId/request-recount` | `inventory-finish` |
| POST | `/api/v1/inventory-sessions/:id/items/:itemId/approve` | `inventory-finish` |
| GET | `/api/v1/inventory-sessions/:id/items/:itemId/attempts` | `inventory-result` |
| POST | `/api/v1/inventory-sessions/:id/approve` | `inventory-finish` |
| POST | `/api/v1/inventory-sessions/:id/apply` | `inventory-finish` |
| POST | `/api/v1/inventory-sessions/:id/cancel` | `inventory-delete` |

---

## Отчёты (`ReportsController`)

Класс: `JwtAuthGuard`. На каждом маршруте `CompanyAccessGuard` + `PermissionsGuard` с группой `AnyPermission` (`SHOP_REPORT_PERMISSIONS`, `PRODUCT_REPORT_PERMISSIONS`, `CLIENT_REPORT_PERMISSIONS`, `SELLER_REPORT_PERMISSIONS`, `ANY_REPORT_PERMISSIONS`).

Пути сгруппированы в константах `*_ROUTES` и `*_API_ROUTES` в начале `src/reports/reports.controller.ts`. Не дублируйте их списком: при изменении констант документ устареет. Зарплаты продавцов: `GET/PUT /api/...` для `SELLER_SALARY_SETTINGS_ROUTES` (только `CompanyAccessGuard`) и `GET` для `SELLER_SALARY_REPORT_ROUTES`.

---

## Дашборд (`DashboardController`)

| Метод | Путь | Право |
|---|---|---|
| GET | `/api/v1/dashboard-report` | `dashboard-orders` |
| POST | `/api/v1/dashboard-setting` | `dashboard-orders` |

---

## Ценники (`PriceTagsController`)

| Метод | Путь | Guard |
|---|---|---|
| GET | `/api/price-tags` (+ `v1`) | `JwtAuth`, company |
| GET | `/api/price-tag-templates/:branchId` (+ `v1`) | `JwtAuth`, company |
| POST | `/api/price-tags/print-metrics` (+ `v1`) | `JwtAuth`, company |

---

## Telegram (`TelegramController`)

| Метод | Путь | Право / проверка |
|---|---|---|
| POST | `/api/telegram/webhook` | заголовок `x-telegram-bot-api-secret-token` = `TELEGRAM_WEBHOOK_SECRET`, иначе 401 `Invalid Telegram webhook secret`. Без лимита частоты |
| POST | `/api/telegram/generate-link` | `telegram-notification` |
| GET | `/api/telegram/status` | `telegram-notification` |
| POST | `/api/telegram/repair-webhook` | `telegram-notification` |
| GET | `/api/telegram/subscribers` | `telegram-notification` |
| PATCH | `/api/telegram/subscribers/:id` | `telegram-notification` |
| DELETE | `/api/telegram/subscribers/:id` | `telegram-notification` |

---

## Платформа оператора (`PlatformController`)

Класс: `@UseGuards(PlatformAdminGuard)`. Доступно только платформе. Маршруты (без подробностей, тела см. DTO в `src/platform/dto/`):

- Компании: `GET/POST /api/platform/companies`, `GET/PUT/PATCH/DELETE /api/platform/companies/:companyId`, `PATCH /api/platform/companies/:companyId/status`, `POST .../block`, `POST .../unblock`.
- Филиалы компании: `GET/POST /api/platform/companies/:companyId/shops`, `PUT/PATCH/DELETE .../shops/:shopId`, `PATCH .../shops/:shopId/status`.
- Товары компании: `GET /api/platform/companies/:companyId/products`, `DELETE .../products`, `DELETE .../products/:productId`.
- Пользователи компании: `GET/POST /api/platform/companies/:companyId/users`, `GET/PUT/PATCH/DELETE .../users/:id`, `POST .../users/:id/block`, `POST .../users/:id/unblock`.
- Подписки и платежи: `GET /api/platform/subscriptions`, `POST .../subscriptions/:id/renew`, `PATCH .../subscriptions/:id/plan`, `POST /api/platform/subscriptions/check-expired`, `GET/POST /api/platform/payments`.
- Тарифы: `GET/POST /api/platform/plans`, `PATCH/DELETE /api/platform/plans/:id`.
- Пользователи платформы: `GET /api/platform/users`, `GET/PUT/PATCH/DELETE /api/platform/users/:id`, `POST /api/platform/users`, `POST .../block`, `POST .../unblock`, `GET /api/platform/roles`.
- Настройки и журнал: `GET/PATCH /api/platform/settings`, `GET/PATCH /api/platform/settings/notifications`, `GET /api/platform/audit-logs`.
- Дашборд: `GET /api/platform/dashboard/stats`.

---

## Файлы и картинки

- `GET /uploads/products/<file>` и `GET /uploads/avatars/<file>`: анонимно, только картинки (расширения из `PUBLIC_IMAGE_EXTENSIONS`). Заголовки `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'`.
- Файлы накладных в `private/invoices/` через `/uploads` не отдаются, только через `GET /api/supplier-invoices/:id/files/:fileIndex`.
- Абсолютные URL картинок строятся из `APP_URL`.

---

## Версии и совместимость

- Алиасы `v1/`, `v2/`, `v3/` сохраняют старые клиенты. Новый код использует путь без версии или `v2/` там, где он уже есть.
- Не удаляйте алиас без проверки всех клиентов (web, mobile, интеграции).
- Изменения в ключах тела и ответа: сначала принимайте оба варианта (`snake_case` и `camelCase`), затем переводите клиент (см. [data-model.md](./data-model.md#62-api-ключи-и-dto)).

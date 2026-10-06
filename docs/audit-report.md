# Аудит Konkurent CRM — 2026-10-07

Проекты:
- **F** = `pet-project/` — фронтенд, Nuxt 4 / Vue 3 / Pinia.
- **B** = `pet-project-back/` — бэкенд, NestJS 11 / Prisma 6 / PostgreSQL.

Аудит только на чтение: код не менялся.

Отчёт собран из восьми параллельных агентов. Повторяющиеся находки объединены.

| Агент | Область |
|---|---|
| security-reviewer | Безопасность и мультитенантность |
| database-reviewer | Prisma, индексы, транзакции, гонки |
| typescript-reviewer | Логика бэкенда |
| vue-reviewer | Баги фронтенда |
| performance-optimizer | Производительность |
| code-explorer | Контракты API между фронтом и бэком |
| architect | Архитектура, мёртвый код, дублирование |
| a11y-architect | UI/UX и доступность |

Пометка «проверить» означает, что агент видел признак проблемы, но не подтвердил её до конца.

Межтенантных утечек (доступа к данным чужой компании) аудит не нашёл: запросы к данным фильтруются по `companyId`. Основные дыры — внутри одной компании: доступ без прав и обход ограничения по магазинам.

---

## 🔴 Критично

### 1. Отчёты и зарплаты доступны любому сотруднику
**Где:**
- `B src/reports/reports.controller.ts:134-510`: около 40 эндпоинтов. `@Permissions` есть только на `:230-231` (`reports-products-summary`), остальные закрыты лишь `JwtAuthGuard` и `CompanyAccessGuard`.
- `sellers/:id/salary-settings` (GET/PUT) и `salary-report` (`:473-499`).

**Почему это проблема:**
- Продавец прямым запросом получает прибыль, закупочные цены, зарплаты и бонусы коллег.
- Продавец может **изменить** настройки зарплаты.
- Фронт ограничивает доступ только скрытием страниц (`F composables/useAccessControl.ts:145-174`).
- Права `salary.view` и `salary.manage` есть только на фронте, в `B src/roles/roles.permissions.ts` их нет. Поэтому блок зарплаты скрыт у всех, кроме админа.

**Как исправить:**
- Подключить `PermissionsGuard` на уровне класса и поставить `@Permissions` на каждый отчёт, со слагами как в `ROUTE_PERMISSION_MAP`.
- Завести слаги `salary.view` и `salary.manage` на бэке и повесить их на маршруты зарплаты.
- Согласовать права `/reports/products/sales-by-attribute`: страница пускает с `report-products`, а API требует `reports-products-summary`.

### 2. Запасная «компания по умолчанию» в мультиарендной системе
**Где:**
- `B products.service.ts:520`: `process.env.COMPANY_ID`, 9 использований, например `:7861` `company_id: COMPANY_ID` без контекста.
- `B sales.service.ts:35`.
- `B company-settings.service.ts:55`: захардкоженный UUID `3b791c40-…`, около 40 мест вида `companyId || DEFAULT_COMPANY_ID`.
- `B products.service.ts:12436` `buildShopLookupByBranchCodes`: при пустом `companyId` ищет магазины по **всем** компаниям.

**Почему это проблема:** при потерянном контексте данные или настройки молча пишутся в чужую («дефолтную») компанию или читаются из неё.

**Как исправить:** убрать запасной вариант, сделать `companyId` обязательным параметром и бросать ошибку, если его нет.

### 3. Хранимый XSS через загрузку фото и аватара; нет лимита размера
**Где:**
- `B products.service.ts:713-735` и `B users.service.ts:1310-1327`: файл сохраняется как `uuid + extname(originalname)`, тип проверяется только по присланному mimetype.
- `/uploads/products` и `/uploads/avatars` раздаёт `express.static`.
- `B products.controller.ts:680`: `FileInterceptor('photo')` без `limits`, файл целиком буферизуется в памяти.

**Почему это проблема:**
- Файл `x.html` или `x.svg`, присланный с `Content-Type: image/png`, затем отдаётся как HTML. Это XSS на домене API.
- Он особенно опасен потому, что токены лежат в `localStorage` (см. 🟠 «Токены в localStorage»).
- Отсутствие лимита размера открывает DoS по памяти.

**Как исправить:**
- Разрешить только jpg, png и webp.
- Проверять magic bytes и выводить расширение из реального типа.
- Отдавать `/uploads` с `X-Content-Type-Options: nosniff`.
- Задать `limits: { fileSize: 10 MB }`.

### 4. Отмена продажи не атомарна: склад возвращается дважды, долг остаётся
**Где:** `B sales.service.ts:2277-2312`.

**Почему это проблема:**
- `restoreSaleStock`, `sale.update(cancelled)`, `undoSaleCashback` и `refreshClientSalesAggregates` идут отдельными вызовами, без транзакции.
- Проверка `status === 'cancelled'` выполняется до записи. Два параллельных запроса на отмену дважды вернут товар на склад.
- Если упадёт любой шаг после возврата остатка, товар уже на складе, а продажа остаётся `paid`.
- Долг продажи (`ClientDebt`) не аннулируется.

**Как исправить:** обернуть всё в `runSerializableTransaction` с захватом через `updateMany({ where: { id, status: { not: 'cancelled' } } })`, как в `payOrder`, и аннулировать долги продажи.

### 5. Отмена возврата ломает повторный возврат и долг
**Где:**
- `B sales.service.ts:2894-2924`: `getReturnableQuantities` учитывает и **отменённые** возвраты.
- `B sales.service.ts:2190-2275`: отмена возврата или обмена не откатывает `applyReturnCreditToDebt`.

**Почему это проблема:**
- После отмены ошибочного возврата товар нельзя вернуть снова: «exceeds available amount».
- Долг клиента остаётся уменьшенным, и `Client.debtUzs` занижен.

**Как исправить:**
- Добавить в запрос `status: { not: 'cancelled' }`.
- Сохранять сумму, зачтённую в долг, и восстанавливать её при отмене.

### 6. Большие списки грузятся целиком и фильтруются в JS
**Где:**
- Клиенты: `B clients/clients.service.ts:45-64` и `:74`. Все клиенты компании плюс метрики по всем, `slice` в памяти.
- Продажи: `B sales.service.ts:177-215`. `findMany` с `user` и `items` без `take`; фильтрация, статистика и опции считаются в JS.
- Статистика заказов: `B sales.service.ts:506-525`.
- Дашборд: `B dashboard/dashboard.service.ts:76-107`. Все продажи периода с `user: true` (тянет и хэш пароля) и `items`.
- Статистика каталога: `B products.service.ts:3958, 4060`.
- Отчёт по атрибутам: `B reports.service.ts:638`.

**Почему это проблема:** стоимость запроса растёт вместе с размером базы, а не страницы. Под нагрузкой это таймауты и блокировка event loop.

**Как исправить:**
- Перенести фильтры в Prisma `where` и выбирать страницу через `skip/take`.
- Статистику считать через `groupBy`, `aggregate` или SQL (`date_trunc` по `paidAt`).
- Вместо `include` выбирать только нужные поля через `select`.
- Без дат брать период по умолчанию.

### 7. Деньги и остатки во Float, остатки ниже нуля не запрещены в БД
**Где:**
- `B prisma/schema.prisma`:
  - `Receipt` (`:918-936`) — все суммы;
  - цены и `quantity` в `Product`, `ProductVariant`, `ProductStock`, `ProductVariantStock`;
  - `StockMovement`.
- Триггер ledger считает в `double precision`.
- `CHECK (quantity >= 0)` нет ни в одной миграции. `setVariantStock` и ручные `update` (`B products.service.ts:~7100, ~7156`) обходят защиту, которая есть в `moveVariantStock`.

**Почему это проблема:** копятся ошибки округления в деньгах. Ошибка в коде может оставить отрицательный остаток, и база это пропустит.

**Как исправить:**
- Перевести цены на `Decimal(12,2)`, количества на `Decimal(12,3)`. Это нужно делать в окно обслуживания; начать с `Receipt` и цен.
- Добавить `CHECK (quantity >= 0) NOT VALID`, затем `VALIDATE`. Перед этим проверить прод на уже существующие минусы.

### 8. Два параллельных способа завершить продажу
**Где:**
- POS платит через `/new-sale/:id/pay` (`sales.service`).
- Платежи добавляются через `/orders/:id/payments` (`B src/modules/orders`; вызовы в `F components/pos/SummaryBlock.vue:867, 915`).
- Отдельный `/orders/:id/complete` (`B orders.service.ts:482`) сам списывает остатки через `postSaleStockDecrease`.
- `completeOrder` во фронте (`F store/cart.ts:1405`) нигде не вызывается.

**Почему это проблема:** два пути меняют деньги и остатки по разной логике. Любая правка в одном легко ломает инварианты другого.

**Как исправить:** оставить один путь, второй эндпоинт удалить или закрыть, мёртвый `completeOrder` удалить.

### 9. Фронт: после сбоя перезагрузки прав все страницы ведут на /403
**Где:** `F store/useUserStore.ts:417-426` и `F middleware/auth.global.ts:111-118`, `:70-80`.

**Почему это проблема:**
- Одного сетевого сбоя при `fetchMe({ force: true })` достаточно, например при смене филиала. После него `permissionsLoaded = true` и `permissionsLoadFailed = true` остаются навсегда.
- Каждая навигация идёт на `/403`, а оттуда обратно. Похоже на цикл редиректов («проверить»).

**Как исправить:** если права уже были загружены, не ставить `Failed`; в middleware повторять загрузку, когда `permissionsLoadFailed`.

### 10. Фронт: после F5 режим возврата превращается в обычную продажу
**Где:** `F store/cart.ts:939-1010` (`saveLocalState` / `loadLocalState`) и `:1656-1702` (`startReturnSession`).

**Почему это проблема:**
- Сохраняются корзина и `saleId`, то есть id **исходной** продажи, но не `saleFlowMode` и `sourceSale`.
- После перезагрузки страницы POS шлёт `/new-sale/<старый id>/pay` и `/leave` по уже завершённой продаже.

**Как исправить:** в режиме возврата не сохранять состояние, либо сохранять и восстанавливать режим вместе с исходной продажей.

---

## 🟠 Важно

### Безопасность
- **Чеки без проверки прав и филиала.**
  - Где: `B receipts.controller.ts:35-105`, `B receipts.service.ts:87-89` — фильтр только `{ id, companyId }`.
  - Почему: сотрудник филиала A читает чеки филиала B, перебирая последовательные `saleId`.
  - Как исправить: добавить `shopId: { in: allowedShopIds }` и `@Permissions`.
- **Нет глобального rate limit и `helmet`.**
  - Где: `B app.module.ts:32`. `ThrottlerModule` настроен, но `APP_GUARD` не найден («проверить»). Лимит 5 запросов в минуту стоит только на 4 маршрутах `auth.controller`.
  - Почему: платформенный логин и вебхуки остаются без лимита.
  - Как исправить: подключить `APP_GUARD` с `ThrottlerGuard` и `helmet()` в `main.ts`.
- **Секреты и срок жизни токенов.**
  - Где: `B auth.service.ts:470-476`, `B auth.module.ts:17`.
  - Почему: refresh-токен без `JWT_REFRESH_SECRET` подписывается `JWT_SECRET`, а если не задан ни один, то пустой строкой. Access-токен живёт 7 дней.
  - Как исправить: требовать оба секрета при старте и сократить срок access-токена.
- **Токены в localStorage.**
  - Где: `F store/useUserStore.ts:523-577`.
  - Почему: любой XSS (критичный пункт 3) крадёт и access-, и refresh-токен.
  - Как исправить: хранить refresh-токен в httpOnly-cookie.
- **Нетипизированные тела запросов.**
  - Где: много мест с `@Body() body: Record<string, unknown>` или `any`, например `B suppliers.controller.ts:31-73`.
  - Почему: `ValidationPipe` на них не срабатывает.
  - Как исправить: DTO с `class-validator`, начиная с денежных и складских операций.
- **`users.controller` в обход общей схемы прав.**
  - Где: `users.controller`: только `JwtAuthGuard` и ручной `assertAdminAccess`; `B reports.repository.ts:38`: upsert зарплаты по `userId` без `companyId`.
  - Как исправить: перейти на `CompanyAccessGuard`, `PermissionsGuard` и `@CurrentCompanyContext`.
- **Нет теста на соответствие ключей прав.**
  - Где: `B auth/role-permissions.ts:57-61`.
  - Почему: опечатка в `@Permissions(...)` молча закрывает маршрут для всех, кроме админа.
  - Как исправить: spec, который резолвит каждый ключ.

### Логика и данные (бэкенд)
- **Баланс лояльности уходит в минус.**
  - Где: `B sales.service.ts:~6046-6054, ~6095-6101` (`reverseReturnCashback`, `undoSaleCashback`): `decrement` без проверки.
  - Как исправить: выбрать политику — ограничивать списание текущим балансом или явно показывать минус.
- **Границы дней зависят от часового пояса сервера** («проверить» `TZ` на проде).
  - Где: `B reports.repository.ts:215-221`, `reports.service.ts:3856-3860`, `reports.mapper.ts:50` (`toISOString().slice(0,10)`), `dashboard.service.ts:388-391`, `clients.service.ts:1481, 2153`.
  - Почему: продажи с 00:00 до 05:00 по Ташкенту уходят в предыдущий день.
  - Как исправить: считать границы в зоне компании (`AT TIME ZONE 'Asia/Tashkent'`) или задать `TZ=Asia/Tashkent`.
- **Транзакции Read Committed.**
  - Где: возврат (`B sales.service.ts:1232`), обмен (`:1308`), удаление корректировок (`:2192`), отмена (`:3857`) идут через обычный `$transaction`.
  - Как исправить: единообразно использовать `runSerializableTransaction` или явный `FOR UPDATE`. То же для commit и rollback накладной (`B supplier-invoice.service.ts:~790-845`): там нет повтора при P2034.
- **Горячая строка `Product`.**
  - Где: триггер на каждое движение остатка обновляет `Product.quantity`; `B serializable-transaction.ts:12` `maxAttempts=3`.
  - Почему: одновременные продажи одного товара в разных филиалах конфликтуют, после трёх попыток пользователь получает 500.
  - Как исправить: 5–6 попыток с jitter, либо считать `Product.quantity` при чтении.
- **Ручной пересчёт `Product.quantity` и N+1.**
  - Где: `B sales.service.ts:3866-3910`: абсолютный `update` поверх инкрементов триггера и `findUnique` в цикле.
  - Как исправить: убрать ручной пересчёт и загружать товары пачкой.
- **Нет составных индексов под отчёты.**
  - Где:
    - у `Sale` нет индекса по `paidAt`;
    - у `StockMovement` нет индекса по `createdAt`;
    - у `ClientDebt` нет `(companyId, status)`.
  - Как исправить: добавить `Sale @@index([companyId, branchCode, paidAt])`, `@@index([companyId, status, createdAt])` и `StockMovement @@index([companyId, shopId, createdAt])`. Создавать через `CREATE INDEX CONCURRENTLY` отдельной миграцией.
- **Состояние импорта и инвентаризации в памяти процесса.**
  - Где: `B products.service.ts:514-518`.
  - Почему: при рестарте PM2 всё теряется, масштабироваться нельзя.
  - Как исправить: перенести в БД или Redis.
- **Миграция ledger.**
  - Где: `20261006140000_variant_stock_ledger` вызывает `stock_ledger_align()`: полный проход в одной транзакции.
  - Как исправить: перед релизом прогнать на копии прода. Убедиться, что код приложения никогда не ставит `konkurent.stock_ledger = 'bypass'`.

### Фронтенд
- **`fetchMe` при параллельном вызове возвращает `false`, и пользователя отправляет на логин.**
  - Где: `F useUserStore.ts:441-443`.
  - Как исправить: хранить промис текущего запроса и возвращать его. Отличать сетевую ошибку от 401 (`:459-468`).
- **Битый `selectedLocation` в localStorage ломает каждую навигацию.**
  - Где: `F useUserStore.ts:593-596` — `JSON.parse` без try/catch.
- **POS: необработанные ошибки при перезагрузке заказа.**
  - Где: `F store/cart.ts:1244, 1534, 1574` — `loadSale` внутри `catch` без собственной обработки; в `syncCartItemChanges` в позицию пишутся значения, которые сервер отверг.
  - Как исправить: `await loadSale(...).catch(() => null)` и сначала выставлять текст ошибки.
- **POS: повторная оплата не заблокирована в сторе.**
  - Где: `F cart.ts:1581, 1405, 1744`.
  - Как исправить: `if (payLoading.value) return`.
- **Страница новой продажи (new-order).**
  - Где: `F pages/order/new-order/index.vue`.
  - Почему:
    - слушатели `beforeunload` и `pagehide` навешиваются после `await` (`:180-190`): при ошибке их нет, при раннем размонтировании они утекают;
    - `onBeforeRouteLeave` не ждёт `leave` (`:192-195`).
  - Как исправить: навешивать слушатели синхронно до `await` и дожидаться `leave`.
- **Обновление токена на SSR** («проверить»).
  - Где: `F useUserStore.ts:532-551`.
  - Почему: `useCookie` после `await` теряет контекст, новый refresh-токен не сохраняется, и пользователя потом разлогинивает.
- **Страница «Магазин» всегда отдаёт 404.**
  - Где: `F pages/settings/shop.vue:68, 82` вызывает `/branches/:key`, а такого маршрута на бэке нет.
  - Как исправить: сделать `PUT v1/shop/:id` либо убрать страницу и пункт меню.

### Производительность (фронт)
- **Корзина сохраняется на каждое изменение.**
  - Где: `F store/cart.ts:2097-2112` — глубокий watch и синхронный `JSON.stringify` с `localStorage.setItem` без debounce (`saveLocalState` без try/catch, `:947`).
  - Как исправить: debounce 200–300 мс с flush на `beforeunload`.
- **Огромные файлы.**
  - Бэкенд: `products.service.ts` 12 536 строк, `sales.service.ts` 6 684, `reports.service.ts` 3 903, `users.service.ts` 3 091.
  - Фронт: `store/cart.ts` 2 281, `pages/order/all/index.vue` 1 696, `useProductImport.ts` 1 452, `pages/index.vue` 1 450.
  - Как исправить: делить по подобластям. Для товаров: каталог, импорт, инвентаризация, перемещение, штрихкоды. Для продаж: черновик, оплата, возврат и обмен. Расчёты корзины вынести в `utils/` и покрыть тестами.

### UI/UX и доступность
- **Кнопки-иконки без подписи и мелкие зоны нажатия в POS.**
  - Где: `F components/pos/CartItem.vue:24-38` (кнопки ▲/▼ высотой 16px), `:74, 104, 123-131, 154`. По проекту `aria-*` есть только в 25 из 129 файлов с `@click`.
  - Как исправить: `aria-label` на каждую такую кнопку и зона нажатия не меньше 32–44px.
- **Самодельные модалки без `role="dialog"`, Esc и удержания фокуса.**
  - Где: `F pages/order/all/index.vue:411, 438, 531` (там «Изменить продажу», то есть деньги), `products/inventory.vue:14`, `products/transfer/[id].vue:212, 300`, `components/platform/ConfirmDialog.vue:20`, `ModalForm.vue:17`.
  - Как исправить: заменить на `UModal`.
- **Строки таблиц, на которые можно кликнуть, но нельзя выбрать с клавиатуры.**
  - Где: `F pages/platform/companies/index.vue:216`, `platform/subscriptions.vue:127`, `pages/index.vue:144`.
  - Как исправить: `NuxtLink` в ячейке или `tabindex` плюс Enter.
- **Фокус и контраст.**
  - Где: `outline-none` без замены (`F BaseDataTableHeader.vue:143`, `settings/shop.vue:9, 30`, `employees/DataTableBody.vue:35` и другие); плейсхолдеры `#555` на `#2a2a2a` (`BulkSkuBarcodeEditor.vue:276`).
  - Как исправить: глобальный стиль `:focus-visible` и плейсхолдеры не темнее `#8a8a8a`.
- **Поля без связанной подписи.**
  - Где: `F EmployeeCreateForm.vue:335-404`, `settings/shop.vue`, `order/all/index.vue:449-454`.
- **«UZS» и «сум» вперемешку.**
  - Где: 138 вхождений в 50 файлах.
  - Как исправить: везде `formatSum` из `F utils/formatMoney.ts` (см. дублирование ниже).
- **Мобильная вёрстка.**
  - Где: таблицы с `min-w-[1180px]` (`F products/inventory/[id].vue:703`), 760px и 720px (`CreateProductPrices.vue:248`, `CreateProductStocks.vue:327`); у части из них «проверить» обёртку `overflow-x-auto`.
  - Как исправить: на ключевых экранах телефона показывать карточки вместо таблиц.
- **Разнобой стилей.**
  - Почему: акцентный синий встречается в трёх оттенках (`#1f78ff`, `#2f6ed6`, `#4993dd`), стили инпутов и модалок разные, админка в светлой теме.
  - Как исправить: токены в `@theme` и общие компоненты `AppInput` и `AppModal`.
- **Латиница и технические id в интерфейсе.**
  - Где: плейсхолдеры «Sardor/Obidjanov» (`F EmployeeCreateForm.vue:336-368`), «branch_a» (`settings/shop.vue:9`).
  - Почему: это нарушает правило «показывать название магазина, а не branchCode».

### Архитектура и дублирование
- **Форматтеры цены.**
  - Где: `F utils/formatMoney.ts`, `utils/formatters.ts`, `components/dashboard/formatters.ts` (тоже `formatCurrency`, но с «UZS»), `composables/useFormatPrice.ts` и около 15 локальных `formatMoney/formatUZS`.
  - Как исправить: оставить только `formatSum`.
- **Поиск магазина реализован в 6 местах.**
  - Где: `SHOP_BY_BRANCH_CODE = {}` всегда пустой (`B sales.service.ts:51`, `products.service.ts:642`); `resolveShopByBranchCode` в двух копиях (`products.service.ts:12389`, `sales.service.ts:6377`) при промахе возвращает код филиала вместо названия; ещё варианты в `receipts`, `reports`, `clients`.
  - Как исправить: один общий `ShopResolver` в `common/`.
- **Знаковая сумма продажи посчитана по-разному.**
  - Где: `B common/money-calculations.ts:22` используется только в дашборде; копии в `sales.service.ts:5186` и `seller-analytics.service.ts:29`, плюс ручные `saleType === 'return' ? -1 : 1` в `reports.service.ts:669, 3244`.
  - Почему: отчёты могут разойтись с дашбордом.
- **Несколько источников ролей и прав.**
  - Бэкенд: `users/constants/role-definitions.ts` с захардкоженными UUID, `roles/default-crm-roles.ts`, `roles.permissions.ts`, `PERMISSION_ALIASES`.
  - Фронт: `ROUTE_PERMISSION_MAP` и `MENU_PERMISSION_MAP` почти дублируют друг друга (`F useAccessControl.ts:10, 204`).
  - Как исправить: одна карта, меню выводить из маршрутов.
- **Пробелы в CI.**
  - Бэкенд CI не запускает `lint`.
  - Фронтовый CI не собирает `generate:mobile`, поэтому поломки iOS-сборки не ловятся.
  - На фронте нет `.env.example`; в бэкендовом нет `TELEGRAM_*`, `OCR_DEBUG`, `DEFAULT_*`.
  - Все пять `posPaymentTypeIds` по умолчанию указывают на один UUID (`F nuxt.config.ts:73-77`).
  - `noImplicitAny: false` (`B tsconfig.json:17`).
- **`src/generated/prisma` лежит в git и проверяется в CI, хотя устарел.** Удалить и добавить в `.gitignore`.

---

## 🟡 Можно потом

- **Мелкие баги POS:**
  - количество всегда считается от 0, потому что `getCartItemQuantity` сравнивает разные id (`F cart.ts:1214`); бэк сам суммирует и проверяет остаток;
  - `finally` в ветке возврата сбрасывает чужой `addingItem` (`:1248`);
  - `loadSale` без защиты от устаревшего ответа;
  - O(n²) в `itemGlobalDiscountShare` (`:2037-2073`);
  - процентная скидка не ограничена 100 (`:1955`);
  - `console.log` в бою (`:1497, 1519`).
- **Смена магазина** (`F useLocationStore.ts:40-77`): применяется до ответа сервера; корзина сбрасывается без `leave`; `fetchMe` вызывается без `force`.
- **`usePrintWindow.ts:29-36`:** слушатель `afterprint` может копиться в iOS WKWebView («проверить»).
- **Округление при возврате** (`B sales.service.ts:2661-2672`): цена за единицу округляется `toFixed(2)`, поэтому полный возврат может разойтись на тийины.
- **Обмен не возвращает потраченные бонусы** (`B sales.service.ts:1294-1415`). Возможно, так задумано — уточнить у владельца логики.
- **`generateOrderNumber()`** (`B sales.service.ts:5182`): `Date.now().slice(-12)`, две продажи в одну миллисекунду упадут на уникальности номера.
- **`Sale` связан с магазином через `branchCode`, а не FK `shopId`** (`B reports.repository.ts`): при переименовании кода филиала история «разъедется».
- **`loadAllReportPages`** (`B reports.service.ts:1654`): пагинация через OFFSET; «проверить» стабильный `orderBy`.
- **`$queryRawUnsafe` со склеенным `whereSql`** (`B reports.repository.ts:106, 153`): значения передаются параметрами; «проверить» `buildSaleItemWhere`.
- **Фронт, мелочи производительности:**
  - `.filter()` прямо в шаблоне (`F pages/order/all/index.vue:75`);
  - глубокие watchers (`clients/index.vue:628, 655`, `CreateProductStocks.vue:79, 93`, `import/edit/[id].vue:1387`);
  - статический импорт `jsbarcode` и `uqr`.
- **Мёртвый код:**
  - бэкенд: `src/auth/auth.service.ts.save`, `prisma.config.ts.bak`, `todolist.txt`, `pnpm-lock.yaml`, пустые `reports/customer-reports.service.ts` и `product-reports.service.ts`;
  - разовые скрипты `prisma/fix-*.ts` и `*cheque-migration*.ts`;
  - фронт: `register()` (`F composables/useAuth.ts:47-60`, на бэке нет `/auth/register`); компоненты `components/dashboard/{catalog,create,BaseDataTablePagination,ProductDetailsSlideover}.vue` и `components/pos/{PosAll,AllPosSearch,Transactions}.vue`; неиспользуемые экспорты `canAccessPath`, `firstAllowedCompanyRoute`, `isFullAccessRole`; слаги `reports.*.view`, которых нет на бэке.
- **Дублирование компонентов:** 9 копий наборов `*/DataTableHeader|Body|TableFilter.vue`; страницы импортируют другие страницы (`F reports/shop/transactions.vue:6`, `inventory/[id]/count.vue:2`).
- **Устаревшие версии маршрутов** (`v1/`, `v2/`): фронт перебирает до 4 URL (`F cart.ts:1893-1896, 1505-1513`); `@Query('company_id')` принимается, но игнорируется.
- **Структура модулей:** `src/modules/*` лежит рядом с модулями верхнего уровня; `reports.service` ходит в Prisma мимо репозитория; продажи напрямую зависят от `TelegramService`.
- **Тесты:**
  - нет spec для `receipts.service`, `platform.service`, `roles.service`, `import-normalizer`;
  - на фронте нет тестов расчётов корзины и карты прав;
  - `loadTs` скопирован в 13 файлов, его стоит вынести в `tests/_helpers.mjs`.
- **UI:** модалки закрываются кликом по фону без подтверждения (`F transfer/[id].vue:212, 300`); нет общего компонента состояний загрузки, пустых данных и ошибки, нет `aria-live`.

---

## Топ-10: что исправить первым

1. **Права на отчёты и зарплату** (🔴1): `@Permissions` на `reports.controller` и слаги `salary.*`. Сейчас любой продавец видит прибыль и меняет зарплаты.
2. **Убрать `COMPANY_ID` и `DEFAULT_COMPANY_ID`** (🔴2), а `buildShopLookupByBranchCodes` без компании превратить в ошибку.
3. **Загрузка файлов** (🔴3): только jpg, png и webp, проверка magic bytes, `nosniff`, лимит размера.
4. **Атомарная отмена продажи с аннулированием долгов** (🔴4), исправление отмены возврата (🔴5).
5. **Чеки: фильтр по `allowedShopIds` и `@Permissions`** (🟠), глобальный `ThrottlerGuard` и `helmet`.
6. **Пагинация и агрегаты в SQL** для клиентов, продаж, статистики заказов и дашборда (🔴6), вместе с составными индексами `Sale(companyId, branchCode, paidAt)` и `StockMovement(companyId, shopId, createdAt)`.
7. **Фронт: выход из «вечного /403»** (🔴9) и сохранение режима возврата в корзине (🔴10).
8. **`CHECK (quantity >= 0)` на остатках** (🔴7), затем план перевода денег на Decimal, начиная с `Receipt`.
9. **Часовой пояс отчётов `Asia/Tashkent`** и политика отрицательного баланса лояльности (🟠).
10. **Один путь завершения продажи** (🔴8). Удалить мёртвый `/orders/:id/complete` и `completeOrder`, затем убрать мусор из репозитория (`generated/prisma`, `.save`, `.bak`).

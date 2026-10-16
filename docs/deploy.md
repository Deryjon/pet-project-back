# Деплой и эксплуатация

**Последнее обновление:** 2026-10-16

Документ описывает только то, что есть в репозиториях: скрипты `package.json`, `ecosystem.config.js`, `.github/workflows/ci.yml` (оба репозитория) и `.env.example`. Всё, что в репозитории отсутствует (автодеплой, бэкапы, мониторинг), вынесено в отдельные разделы с пометкой «рекомендация».

Связанные документы: [architecture.md](./architecture.md), [api.md](./api.md), [data-model.md](./data-model.md), [../../pet-project/README.md](../../pet-project/README.md).

---

## 1. Что деплоится

| Компонент | Репозиторий | Как собирается | Как запускается |
|---|---|---|---|
| Backend API | `pet-project-back` | `npm run build` (SWC) | PM2, приложение `konkurent-api`, `dist/main.js` |
| Frontend web (SSR) | `pet-project` | `npm run build` | Node-сервер Nuxt (`.output/`) |
| Frontend mobile (iOS) | `pet-project` | `npm run generate:mobile` → `.output/public` | Capacitor (`webDir: .output/public`) |
| OCR (PaddleOCR) | `pet-project-back/ocr/` | `npm run ocr:install` → `.venv-ocr` | вызывается backend'ом как процесс Python |

Продакшн-URL API: `https://api.konkurent-group.uz/api` (значение по умолчанию во фронтенде).

---

## 2. PM2 (`ecosystem.config.js`)

```js
module.exports = {
  apps: [
    {
      name: "konkurent-api",
      script: "dist/main.js",
      cwd: "/home/deryjon/pet-project-back",
      env: {
        NODE_ENV: "production",
        TZ: "Asia/Tashkent"
      }
    }
  ]
};
```

- Имя процесса: `konkurent-api`.
- Скрипт: `dist/main.js`, то есть собранный код. Исходники на сервере не нужны для запуска, но нужны `prisma/`, `ocr/` и каталоги данных.
- `cwd` **важен**: 7 мест в коде используют `process.cwd()` для путей загрузок (`uploads/products`, `uploads/avatars`, `private/invoices`, `.venv-ocr`). Если `cwd` не совпадает с каталогом проекта, файлы будут писаться в другое место.
- `TZ=Asia/Tashkent` также задаётся в `src/timezone.ts`, если переменная не выставлена.

Команды (стандартные для PM2; в `package.json` они не вынесены в скрипты):

```bash
pm2 start ecosystem.config.js          # первый запуск
pm2 restart konkurent-api --update-env # после обновления кода и .env
pm2 logs konkurent-api                 # логи
pm2 status                             # состояние
```

`npm run start:prod` делает `node ./dist/main.js` и перед этим (`prestart:prod`) вызывает `npm run build`. Для PM2 `start:prod` не нужен, PM2 запускает `dist/main.js` напрямую.

При занятом порту приложение выводит `Port <PORT> is already in use` и завершается с кодом 1.

---

## 3. Процедура выката backend

1. Обновить код: `git pull` (ветка `main`, см. CI).
2. Установить зависимости: `npm ci` (в репозитории есть `package-lock.json`; `pnpm-lock.yaml` устарел, CI его не использует).
3. Сгенерировать клиент Prisma: `npm run prisma:generate`.
4. Применить миграции: `npm run prisma:migrate:deploy` (это `prisma migrate deploy`).
5. Собрать: `npm run build`.
6. Перезапустить: `pm2 restart konkurent-api --update-env`.
7. Проверить: `curl -s https://api.konkurent-group.uz/api/health` → `{"status":"ok"}`.

Правила:

- **`npm run prisma:migrate` (это `prisma migrate dev`) на проде не запускать.** Он создаёт миграции и может сбросить данные при расхождении схемы.
- Порядок «миграции → сборка → перезапуск»: новый код не должен работать со старой схемой.
- Любое изменение `schema.prisma` поставляется вместе с миграцией. Тест `npm run test:postgres` падает, если миграции расходятся со схемой.
- Миграции и data-repair скрипты: `prisma/migrations/`, `prisma/*.ts`. Скрипты `npm run repair:*`, `attributes:apply`, `attributes:rollback`, `units:audit` и др. меняют данные. Запускайте их только после чтения кода, аудита (`audit:*`, `*:audit`) и резервной копии.

Фронтенд (`pet-project`) выкатывается отдельно. В репозитории нет скриптов деплоя веб-версии. Для мобильной версии:

```bash
npm run generate:mobile          # NUXT_APP_MODE=mobile, статический SPA в .output/public
npx cap sync ios                 # перенос в iOS-проект (команда Capacitor CLI, в package.json не вынесена)
```

---

## 4. Переменные окружения

### 4.1 Backend (`.env`)

Источник: `.env.example` и `process.env.*` в коде. Значения-заглушки в примере не используйте в проде.

| Переменная | Обязательна | Назначение |
|---|---|---|
| `PORT` | нет (по умолчанию 3001) | порт HTTP-сервера |
| `DATABASE_URL` | да | строка подключения PostgreSQL (`postgresql://USER:PASSWORD@HOST:5432/DB`) |
| `APP_URL` | да в проде | публичный адрес API (`https://...`). Нужен для абсолютных URL файлов и для webhook Telegram. Без него URL файлов указывают на `http://localhost:<PORT>` |
| `FRONTEND_URL` | да в проде | адрес фронтенда. Используется в CORS и в QR-ссылке чека. Если задан, встроенные localhost-origin отключаются |
| `CORS_ORIGINS` | нет | дополнительные origin через запятую (например, локальный фронтенд на `:3000`) |
| `JWT_SECRET` | да | подпись access-токена. Обязательна (иначе ошибка при старте) |
| `JWT_EXPIRES_IN` | нет (по умолчанию `1h`) | срок access-токена |
| `JWT_REFRESH_SECRET` | да | подпись refresh-токена. Должна отличаться от `JWT_SECRET` (иначе ошибка при старте) |
| `JWT_REFRESH_EXPIRES_IN` | нет (по умолчанию `30d`) | срок refresh-токена |
| `THROTTLE_LIMIT_PER_MINUTE` | нет (по умолчанию 600) | лимит запросов в минуту на пользователя или IP |
| `INVOICE_RECOGNITION_PROVIDER` | нет (по умолчанию `paddle`) | `paddle` или `openai` |
| `PADDLE_OCR_PYTHON` | нет (по умолчанию `.venv-ocr/bin/python`) | путь к Python для PaddleOCR. В Windows задайте явно |
| `PADDLE_OCR_TIMEOUT_MS` | нет (по умолчанию 600000) | таймаут распознавания |
| `PADDLE_OCR_MAX_CONCURRENCY` | нет (по умолчанию 1) | одновременных распознаваний |
| `OPENAI_API_KEY` | только для `openai` | ключ OpenAI. Секрет, не коммитить |
| `OPENAI_INVOICE_MODEL` | нет (по умолчанию `gpt-5.4-nano`) | модель для распознавания накладных |
| `OCR_DEBUG` | нет | `1` — выводить stderr OCR в лог |
| `TELEGRAM_BOT_TOKEN` | для Telegram | токен бота (от @BotFather). Секрет |
| `TELEGRAM_BOT_USERNAME` | для Telegram | имя бота для ссылок привязки |
| `TELEGRAM_WEBHOOK_SECRET` | для Telegram | секрет webhook; тот же, что передан в `secret_token` при регистрации |
| `TELEGRAM_WEBHOOK_URL` | нет | явный URL webhook. По умолчанию `<APP_URL>/api/telegram/webhook` |
| `TZ` | нет (по умолчанию `Asia/Tashkent`) | часовой пояс процесса |
| `NODE_ENV` | в PM2 `production` | режим Node |

Webhook Telegram регистрируется при старте приложения (`OnApplicationBootstrap` в `TelegramService`). Для этого `APP_URL` должен быть публичным HTTPS-адресом.

### 4.2 Переменные только для разработки и seed

Используются скриптами `prisma/seed*.ts` и тестами. В проде не нужны, кроме случаев первоначального заведения данных.

| Переменная | Где | Назначение |
|---|---|---|
| `COMPANY_LOGIN`, `COMPANY_SUBDOMAIN`, `COMPANY_NAME` | `prisma/seed.ts` | компания, которую создаёт seed |
| `PLATFORM_ADMIN_PHONE`, `PLATFORM_ADMIN_PASSWORD` | `prisma/seed.ts` | учётка оператора платформы |
| `DATABASE_URL` для тестов `TEST_DATABASE_URL`, `TEST_LEGACY_DATABASE_URL`, `POSTGRES_TEST_ADMIN_URL`, `PG_BIN` | `test/postgres/` | см. `test/postgres/README.md` |
| `SHOPS_JSON`, `CASH_BOXES_JSON`, `PRICE_TAGS_JSON`, `COMPANY_*_JSON`, `MEASUREMENT_UNITS_JSON`, `DEFAULT_CURRENCY_*`, `PRODUCT_TYPE_*_ID`, `DEFAULT_PRODUCT_TYPE_ID` | код компании и товаров | значения по умолчанию для тестовых и seed-данных |

> **Предупреждение.** Если `PLATFORM_ADMIN_PASSWORD` не задан, `prisma/seed.ts` использует встроенное значение по умолчанию. Перед запуском seed на любой публичной базе задайте все переменные `PLATFORM_ADMIN_*` и смените пароль оператора.

### 4.3 Frontend (`pet-project/.env`)

| Переменная | Назначение |
|---|---|
| `NUXT_PUBLIC_API_BASE` | адрес API, на который ходит браузер. Локально `http://localhost:3001/api` или `/api` (через прокси) |
| `NUXT_API_PROXY_TARGET` | цель Nitro-прокси `server/api/[...path].ts` и значение по умолчанию для `NUXT_PUBLIC_API_BASE` |
| `NUXT_PUBLIC_BACKEND_ORIGIN` | origin без `/api` для картинок `/uploads` |
| `NUXT_APP_MODE` | `web` (SSR, по умолчанию) или `mobile` (статический SPA) |
| `NUXT_PUBLIC_POS_PAYMENT_TYPE_CASH`, `…_CARD`, `…_PAYME`, `…_CLICK`, `…_TRANSFER` | id типов оплаты для кнопок POS. По умолчанию все пять одинаковые, задавайте по установке |

Подробности: [../../pet-project/README.md](../../pet-project/README.md).

---

## 5. CI

### 5.1 Backend (`pet-project-back/.github/workflows/ci.yml`)

Запуск: `pull_request` и `push` в `main`. Окружение: Ubuntu, Node 22, сервис PostgreSQL 16 (`postgres:16`, база `konkurent_ci`).

Шаги:

1. `npm ci`
2. `npm run prisma:generate`
3. `npm run prisma:migrate:deploy` (проверка, что миграции применяются с нуля)
4. `npm run build:typecheck` (`nest build`, проверка типов)
5. `npm test -- --runInBand` (unit-тесты Jest)
6. `npm run test:postgres` с `POSTGRES_TEST_ADMIN_URL` (интеграционные тесты; падает, если миграции расходятся со схемой)
7. `npm run ocr:test` (Python unittest для `ocr/`)
8. `npm run build` (SWC)

Деплой в CI не выполняется. Выкат делается вручную по разделу 3.

### 5.2 Frontend (`pet-project/.github/workflows/ci.yml`)

Запуск: `pull_request` и `push` в `dev`, `main`, `staging`. Node 22.

1. `npm ci`
2. `npm test` (`node --test tests/*.test.mjs`)
3. `npm run typecheck` (`nuxt typecheck`)
4. `npm run build` (web)
5. `npm run generate:mobile` (проверка мобильной сборки)

---

## 6. Данные, которые надо сохранять

Каталоги, которые создаются во время работы и не входят в git:

| Путь | Что хранится | Где пишется |
|---|---|---|
| `uploads/products/` | фото товаров (публичные) | `products.service.ts` |
| `uploads/avatars/` | аватары (публичные) | `users.service.ts` |
| `private/invoices/` | оригиналы накладных (приватные) | `supplier-invoices.controller.ts` |
| `.venv-ocr/` | окружение PaddleOCR | `npm run ocr:install` |

Потеря `private/invoices/` делает оригиналы приходов недоступными (ссылки в `SupplierInvoice.originalFiles` останутся). Потеря `uploads/` сломает фото товаров.

---

## 7. Резервные копии (рекомендация, не реализовано в репозитории)

В репозитории **нет** скриптов бэкапа, расписания и хранения копий. Ниже рекомендуемый минимум. Перед использованием проверьте команды на тестовой базе.

Логическая копия PostgreSQL (в формате custom, с возможностью выборочного восстановления):

```bash
# DATABASE_URL брать из переменного окружения, не писать в скрипт
pg_dump --format=custom --no-owner --file "backup_$(date +%F_%H%M).dump" "$DATABASE_URL"
```

Восстановление (только на отдельную базу, не на прод):

```bash
pg_restore --no-owner --dbname "$RESTORE_DATABASE_URL" backup_YYYY-MM-DD_HHMM.dump
```

Рекомендации:

- запускать `pg_dump` по расписанию (cron) не реже раза в сутки и перед каждой миграцией и data-repair скриптом;
- сохранять копии вне сервера (другой диск или объектное хранилище), с ограничением доступа;
- копировать `uploads/` и `private/invoices/` вместе с базой (их нет в дампе);
- раз в месяц проверять восстановление на тестовой базе.

Откат миграций Prisma не автоматический. Для данных атрибутов есть обратный скрипт `npm run attributes:rollback` (см. [attribute-dictionaries.md](./attribute-dictionaries.md)). Для остальных изменений откат — это восстановление из резервной копии.

---

## 8. Проверка состояния

- `GET /api/health` → `{"status":"ok"}` (без аутентификации).
- Каждый ответ содержит `X-Request-Id`. Если клиент передал свой, он сохраняется. Этим идентификатором связываются записи логов (`Logger`), например в `PrismaExceptionFilter`.
- Логи PM2: `pm2 logs konkurent-api`.
- Telegram-уведомления о входах и продажах (если настроены) показывают активность.

---

## 9. Частые проблемы

| Симптом | Причина | Что сделать |
|---|---|---|
| CORS-ошибка в браузере при локальной разработке | `FRONTEND_URL` задан, а фронтенд на другом порту | добавить origin в `CORS_ORIGINS` (например, `http://localhost:3000`) |
| Картинки товаров ведут на `localhost` | не задан `APP_URL` | задать `APP_URL` и перезапустить |
| `JWT_REFRESH_SECRET is missing or equal to JWT_SECRET` при старте | секреты совпадают или не заданы | задать разные значения |
| `Port 3001 is already in use` | старый процесс занял порт | `pm2 status`, остановить лишний процесс |
| OCR не запускается | неверный `PADDLE_OCR_PYTHON` или нет `.venv-ocr` | `npm run ocr:check`, задать путь явно |
| `Telegram setWebhook failed` в логах | неверный токен или не публичный `APP_URL` | проверить `TELEGRAM_BOT_TOKEN`, `APP_URL` (HTTPS) |
| Миграция падает на `dev` с предупреждением о сбросе | использован `prisma:migrate` вместо `prisma:migrate:deploy` | на проде только `prisma:migrate:deploy` |

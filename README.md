# Konkurent CRM — backend

Backend мультиарендной CRM/POS для розничных магазинов: каталог и остатки по филиалам, продажи и чеки, клиенты и долги, приходы от поставщиков (фото/PDF накладных с OCR), отчёты, Telegram-уведомления. Работает в связке с фронтендом [`pet-project`](../pet-project/README.md) (Nuxt 4).

**Стек:** NestJS 11, Prisma 6, PostgreSQL 16 (в CI), Node.js 22, Jest. Распознавание накладных: PaddleOCR (Python, `ocr/`) или OpenAI.

**Прод:** `https://api.konkurent-group.uz/api`, процесс PM2 `konkurent-api`.

## Документация

| Документ | Содержание |
|---|---|
| [docs/architecture.md](./docs/architecture.md) | модули, request pipeline, мультиарендность, потоки данных, структура frontend |
| [docs/api.md](./docs/api.md) | все маршруты по контроллерам, права, тела, ответы, ошибки |
| [docs/data-model.md](./docs/data-model.md) | сущности, связи, ER-диаграмма, enum'ы, справочник терминов, таблица расхождений |
| [docs/import.md](./docs/import.md) | импорт товаров из файла, приход по накладной, OCR, статусы, «Обновить» |
| [docs/receipts.md](./docs/receipts.md) | формирование чека, снимок, шаблоны, отображение, ошибки |
| [docs/deploy.md](./docs/deploy.md) | PM2, выкат, переменные окружения, CI, бэкапы |
| [docs/attribute-dictionaries.md](./docs/attribute-dictionaries.md) | общий справочник цветов, размеров и сезонов |
| [docs/audit-report.md](./docs/audit-report.md), [docs/audit-progress.md](./docs/audit-progress.md) | аудит от 2026-10-07 и ход исправлений |
| [CHANGELOG.md](./CHANGELOG.md) | история изменений |

## Быстрый старт (разработка)

Требования: Node.js 22, npm, PostgreSQL 16 (локально или в Docker). Python 3 нужен только для OCR.

```bash
# 1. Зависимости (CI использует npm ci, pnpm-lock.yaml устарел)
npm ci

# 2. Переменные окружения
cp .env.example .env          # в Windows: copy .env.example .env
```

В `.env` заполните минимум: `DATABASE_URL` (формат `postgresql://USER:PASSWORD@localhost:5432/DB`), `JWT_SECRET` и `JWT_REFRESH_SECRET` (два разных значения). Полный список переменных — в [docs/deploy.md](./docs/deploy.md#4-переменные-окружения).

```bash
# 3. Клиент Prisma (нужен DATABASE_URL в .env)
npm run prisma:generate

# 4. Миграции: применить все существующие (без создания новых)
npm run prisma:migrate:deploy

# 5. Начальные данные (необязательно, для пустой базы)
npm run prisma:seed           # компания и учётка оператора платформы
npm run attributes:seed       # общий справочник цветов, размеров и сезонов
```

> Перед `prisma:seed` задайте `COMPANY_LOGIN`, `PLATFORM_ADMIN_PHONE` и `PLATFORM_ADMIN_PASSWORD`. Без `PLATFORM_ADMIN_PASSWORD` seed использует встроенное значение по умолчанию: не запускайте его на общей базе без этих переменных.

```bash
# 6. Запуск с перезагрузкой при изменениях
npm run start:dev             # API на http://localhost:3001, проверка: /api/health
```

Фронтенд: в `pet-project/.env` укажите `NUXT_PUBLIC_API_BASE=http://localhost:3001/api`, затем `npm run dev` (порт 3000). Так как `.env.example` задаёт `FRONTEND_URL=http://localhost:5173`, добавьте `CORS_ORIGINS="http://localhost:3000"` в `.env` backend, иначе браузер заблокирует запросы.

Для новой миграции при разработке используйте `npm run prisma:migrate` (это `prisma migrate dev`). **На проде только `prisma:migrate:deploy`.**

### OCR (необязательно)

```bash
npm run ocr:install           # создаёт .venv-ocr (скрипт рассчитан на bash/Linux/macOS)
npm run ocr:check             # проверка PaddleOCR
```

В Windows создайте venv вручную и задайте `PADDLE_OCR_PYTHON` (например, `.venv-ocr\Scripts\python.exe`). Без OCR можно работать с `INVOICE_RECOGNITION_PROVIDER=openai` и `OPENAI_API_KEY`.

## Команды

| Команда | Назначение |
|---|---|
| `npm run start:dev` | разработка с перезапуском |
| `npm run build` | сборка SWC |
| `npm run build:typecheck` | сборка `tsc`, проверка типов (так делает CI) |
| `npm run start:prod` | запуск `dist/main.js` (перед ним сборка) |
| `npm run lint` | ESLint с `--fix` (меняет файлы) |
| `npm test` | unit-тесты Jest (`src/**/*.spec.ts`) |
| `npx jest src/clients/clients.debt-idempotency.spec.ts` | один файл |
| `npx jest -t "имя теста"` | один тест по имени |
| `npm run test:postgres` | интеграционные тесты на реальном PostgreSQL (см. `test/postgres/README.md`) |
| `npm run ocr:test` | тесты Python для `ocr/` |
| `npm run prisma:generate` / `prisma:migrate:deploy` / `prisma:migrate` / `prisma:studio` | Prisma |
| `npm run prisma:seed` / `attributes:seed` | начальные данные |

`npm run test:postgres` не использует `DATABASE_URL`. Он создаёт временный кластер (укажите `PG_BIN` с PostgreSQL 16) или подключается по `POSTGRES_TEST_ADMIN_URL`. Тест падает, если миграции расходятся со `schema.prisma`, поэтому любое изменение схемы сопровождается миграцией.

Скрипты `repair:*`, `attributes:apply`, `attributes:rollback`, `units:audit` и др. меняют или проверяют данные. Перед запуском прочитайте их в `prisma/` и сделайте резервную копию.

## Структура

```
src/
  main.ts, app.module.ts      точка входа, корневой модуль
  auth/                       вход, JWT, сессии, guards, контекст компании
  users/, roles/, platform/   пользователи, роли, API оператора платформы
  company-settings/           компания, филиалы, типы оплаты, кассы
  products/, product-attributes/, attribute-dictionaries/   каталог и атрибуты
  imports/                    приходы по накладным, OCR, сопоставление
  purchase-orders/            заказы поставщикам
  sales/, modules/orders/, modules/payments/, modules/cashboxes/   продажи и оплаты
  clients/, receipts/, price-tags/, reports/, dashboard/, warehouse/
  telegram/, analytics/       уведомления и аналитика
  common/                     фильтры, middleware, транзакции, деньги, остатки
  prisma/                     PrismaService
prisma/                       schema.prisma, миграции, seed и скрипты данных
ocr/                          recognize_invoice.py (PaddleOCR)
test/                         интеграционные тесты PostgreSQL, jest-e2e
docs/                         документация
```

## Лицензия и служебная информация

Проект приватный (`"private": true`, `"license": "UNLICENSED"` в `package.json`).

---

## Справка: исходный шаблон NestJS

<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ pnpm install
```

## Compile and run the project

```bash
# development
$ pnpm run start

# watch mode
$ pnpm run start:dev

# production mode
$ pnpm run start:prod
```

## Run tests

```bash
# unit tests
$ pnpm run test

# e2e tests
$ pnpm run test:e2e

# test coverage
$ pnpm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ pnpm install -g mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).

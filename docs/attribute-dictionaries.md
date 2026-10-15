# Справочники цвет / размер / сезон — порядок выката

ТЗ от 15.10.2026. Работает только для `storeType` CLOTHING, SHOES, CLOTHING_SHOES.
У действующих клиентов ничего не меняется, пока для компании не включён флаг
`useAttributeDictionaries` (по умолчанию `false`).

## Что добавлено в БД

Миграция `20261015120000_attribute_dictionaries` только добавляет объекты, откат лежит рядом в `down.sql`.

| Объект | Назначение |
|---|---|
| `AttributeValue` | Значения справочников. `companyId IS NULL` — системные, иначе значения магазина. Уникальность: `(type, COALESCE(companyId,''), COALESCE(group,''), code)` |
| `StoreAttributeSetting` | Скрытие и порядок системных значений для магазина |
| `AttributeBindingLog` | История привязок (APPLY / LINK / ROLLBACK) |
| `Company.useAttributeDictionaries` | Флаг магазина |
| `ProductVariant.colorValueId / sizeValueId`, `Product.seasonValueId / collectionValueId` | Ссылки товара на справочник (nullable) |
| `ProductColor / ProductSize / ProductSeasonOption.attributeValueId` | Какому значению справочника соответствует старая строка |
| Триггеры `ProductVariant_dictionary_links`, `Product_dictionary_links` | Переносят ссылку старой строки на товар при сохранении |

В уникальность входит группа: иначе размер `42` не мог бы быть одновременно
брючным (NUM_BOTTOM 30–42) и обувным (NUM_SHOES 35–47).

Старые колонки (`colorId`, `sizeId`, `seasonOptionId`, `collection`), значения и индексы не меняются.

## Порядок на проде (api.konkurent-group.uz)

1. Бэкап: `pg_dump -Fc "$DATABASE_URL" > konkurent-$(date +%F-%H%M).dump`
2. `npm run prisma:migrate:deploy`
3. `npm run attributes:seed` — системные значения, повторный запуск безопасен.
   Раз в год: `npm run attributes:seed -- --year=2027` добавляет SS28/FW28.
4. Аудит клиента (только чтение, транзакция READ ONLY):
   `npm run attributes:audit -- --company-id=<id> --out=./attributes-audit`
   - `<id>-attributes.csv` — «старое значение → предложенный код, статус»:
     `exact` — совпало, `alias` — другое написание (XXL → 2XL), `new` — будет создано своё значение магазина,
     `manual` — нужен ручной выбор, `linked` — уже привязано.
   - `<id>-attributes-conflicts.csv` — варианты одного товара, которые получат одинаковую пару цвет+размер
     (например, XXL и 2XL одной футболки). Их надо разобрать с владельцем до применения.
   - `<id>-attributes-checksum.json` — контрольная сумма товаров, вариантов, остатков и старых справочников.
5. CSV отдаётся владельцу. В колонке `approved_code` он может указать другой код или `skip`.
   Строки `manual` без `approved_code` не применяются.
6. После подтверждения владельца — пробный прогон, затем применение:
   `npm run attributes:apply -- --company-id=<id> --csv=<проверенный.csv>` (dry run)
   `npm run attributes:apply -- --company-id=<id> --csv=<проверенный.csv> --apply`
   Пишутся только колонки ссылок (сырым SQL, `updatedAt` не меняется), каждая запись попадает в `AttributeBindingLog`.
   Если контрольная сумма до и после не совпала, транзакция откатывается.
7. Флаг включает суперадмин: `PUT /platform/companies/<id>` с `{ "use_attribute_dictionaries": true }`.
8. Сверка: повторный `attributes:audit` — контрольная сумма в `*-checksum.json` должна совпасть с первой.

## Откат

- Данные: `npm run attributes:rollback -- --company-id=<id> [--batch=<batchId>] --apply`
  возвращает ссылки к прежним значениям по журналу и выключает флаг.
- Схема (если нужно убрать всё): `psql -f prisma/migrations/20261015120000_attribute_dictionaries/down.sql`,
  затем `DELETE FROM "_prisma_migrations" WHERE migration_name = '20261015120000_attribute_dictionaries'`.

## API

| Метод | Путь | Кто |
|---|---|---|
| GET | `/attributes/{colors,sizes,seasons}[?all=1]` | Сотрудник с `catalog-operations`. `all=1` включает скрытые, выключенные и архивные |
| POST | `/attributes/{type}` `{code, name?, group?}` | Владелец/админ. Нормализация; при дубле — 409 `{message, existing}`; похожий цвет — `warnings` |
| PATCH | `/attributes/{id}` | Своё: `name`, `sort_order`, `is_active`, `is_archived`. Системное: только `is_hidden`, `sort_order`, иначе 403 |
| DELETE | `/attributes/{id}` | Своё; используемое уходит в архив. Системное — 403 |
| POST | `/attributes/{id}/link` | Карточка товара (флаг включён): старая строка для выбранного значения |
| GET/POST/PATCH | `/admin/attributes` | Суперадмин платформы, только системные значения; код не меняется |

Сезоны: тип `SEASON`, две группы — `TIME_OF_YEAR` (время года) и `COLLECTION` (SS/FW + год).
Если решат, что справочник один, достаточно не показывать группы в интерфейсе — данные менять не придётся.

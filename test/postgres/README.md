# PostgreSQL acceptance checks

Run `npm run test:postgres` from the backend repository. This suite uses PostgreSQL 16, real Prisma repositories and disposable synthetic data. It does not use the application's `DATABASE_URL` or restore production data.

Locally, the runner starts a temporary cluster with `/opt/homebrew/opt/postgresql@16/bin`. Set `PG_BIN` to another PostgreSQL 16 bin directory if needed. It uses a random loopback port and stops/removes its cluster after the run. The Homebrew service does not need to run.

In CI, set `POSTGRES_TEST_ADMIN_URL` to the dedicated PostgreSQL service (loopback only). The role needs CREATEDB. The runner creates two randomly named `konkurent_test_*` databases and drops only those databases afterward. It never resets the database named in that connection URL. Do not pass application credentials.

The runner applies all committed migrations to one database and compares it with `schema.prisma`; any difference fails the run. The second database contains migration history up to the ProductStock identity migration. Tests apply that migration to representative legacy rows within rolled-back transactions.

Concurrency tests synchronize initial snapshots of independent serializable transactions. Database queries are real; the wrapper only schedules overlap. Expected losing requests must return domain errors rather than exhausted serialization retries. Telegram and token-signing collaborators are isolated from external services.

Coverage: stock identity migration, duplicate/orphan rejection, uniqueness and FK constraints, same-order completion, competing orders for the last unit, rollback of a partially posted order, concurrent legacy Sale payment, debt overpayment and idempotency, inventory application with a missing stock row, concurrent stock upsert, and refresh-session rotation.

For acceptance on an anonymized production copy, first run `prisma/product-stock-preflight.sql` against that copy. It reports duplicate stock rows, missing shops and aggregate discrepancies without repairing data. Preserve a before/after snapshot before applying migrations. If inventory tables already exist outside migration history, compare their full definitions before deciding how to reconcile the new inventory migration; do not mark it applied solely because the table names exist.

Synthetic fixtures prove the tested invariants. They do not establish that production has no duplicate/orphan rows or that its migration history matches the repository.

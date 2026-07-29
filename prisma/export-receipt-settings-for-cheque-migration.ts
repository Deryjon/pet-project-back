import 'dotenv/config';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

/**
 * Phase 1 of the ReceiptSettings -> ChequeSettings backfill.
 *
 * Run this BEFORE deploying migration 20260726180000_cheque_settings_rework —
 * that migration DROPs "ReceiptSettings" in the same step it creates the new
 * "ChequeSettings" table, so there is no point in time where both tables exist
 * together. This script must therefore run against the OLD schema (whatever
 * is currently live on the target database) and dump the result to a JSON
 * file; prisma/import-cheque-settings-from-receipt-settings.ts then applies
 * that dump AFTER the migration has run and "ChequeSettings" exists.
 *
 * Raw SQL is used deliberately instead of `prisma.receiptSettings` — the
 * generated Prisma Client in this repo's current schema.prisma no longer
 * has a `ReceiptSettings` model (the rework migration already exists in
 * migration history), but the actual table may still be physically present
 * on whichever database this is pointed at, if that database hasn't had the
 * migration applied yet. Raw SQL only cares about what's actually in Postgres.
 */

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is not configured');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const OUTPUT_PATH = join(__dirname, 'receipt-settings-export.json');

// Every column and its DB default, from migration
// 20260713090000_add_receipts_and_receipt_settings/migration.sql — a row is
// "non-default" if any of these differ from what's listed here.
const DEFAULTS: Record<string, unknown> = {
  showClientInfo: true,
  showManagerName: true,
  showManagerPhone: false,
  showCashback: true,
  showDebtLine: true,
  showQrCode: false,
  showItemIndex: true,
  paperWidth: 80,
  fontSize: 13,
  dividerStyle: 'single',
  dividerGap: 8,
  sectionGap: 12,
  itemDividers: false,
  footerMessage: '',
  footerNote: '',
  hasLogo: false,
  logoUrl: '',
  hasBarCode: false,
  branchName: '',
  hasBranchName: false,
  address: '',
  hasAddress: false,
  phone: '',
  hasPhone: false,
  workingHours: '',
  hasWorkingHours: false,
  website: '',
  hasWebsite: false,
  taxId: '',
  hasTaxId: false,
  qrCodeUrl: '',
  hasCustomerDebt: false,
  hasCustomerBalance: false,
  elementStyles: null,
};

function isRowAllDefault(row: Record<string, unknown>): boolean {
  return Object.entries(DEFAULTS).every(([key, defaultValue]) => {
    const value = row[key];
    if (defaultValue === null) {
      return value === null || value === undefined;
    }
    return value === defaultValue;
  });
}

async function main() {
  let rows: Record<string, unknown>[];
  try {
    rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      'SELECT * FROM "ReceiptSettings" ORDER BY "companyId", "shopId"',
    );
  } catch (error) {
    console.log(
      'Could not read "ReceiptSettings" — the table likely no longer exists ' +
        '(migration 20260726180000_cheque_settings_rework has already run on ' +
        'this database). Nothing to export.',
    );
    console.error(error);
    return;
  }

  console.log(`Found ${rows.length} ReceiptSettings row(s).`);

  const nonDefaultRows = rows.filter((row) => !isRowAllDefault(row));

  if (nonDefaultRows.length === 0) {
    console.log(
      '\nAll rows are on defaults — no meaningful data to backfill. ' +
        'Documenting this check; no export file written.',
    );
    writeFileSync(
      OUTPUT_PATH,
      JSON.stringify(
        {
          checkedAt: new Date().toISOString(),
          totalRows: rows.length,
          nonDefaultRows: 0,
          note: 'All ReceiptSettings rows were on defaults; backfill was not required.',
          rows: [],
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(
    `${nonDefaultRows.length} row(s) have non-default (customized) settings:`,
  );
  for (const row of nonDefaultRows) {
    console.log(`- companyId=${row.companyId} shopId=${row.shopId}`);
  }

  writeFileSync(
    OUTPUT_PATH,
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        totalRows: rows.length,
        nonDefaultRows: nonDefaultRows.length,
        rows,
      },
      null,
      2,
    ),
  );

  console.log(`\nExported ${rows.length} row(s) to ${OUTPUT_PATH}`);
  console.log(
    'Next: deploy migration 20260726180000_cheque_settings_rework, then run ' +
      'prisma/import-cheque-settings-from-receipt-settings.ts against the ' +
      'same database.',
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

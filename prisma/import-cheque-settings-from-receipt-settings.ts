import 'dotenv/config';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Prisma } from '@prisma/client';
import {
  ChequeBlockDefinition,
  DEFAULT_CHEQUE_BLOCKS,
} from '../src/receipts/cheque-blocks.constant';

/**
 * Phase 2 of the ReceiptSettings -> ChequeSettings backfill.
 *
 * Run this AFTER migration 20260726180000_cheque_settings_rework (and the
 * later cheque migrations that add `name`/`isDefault`) have been applied —
 * i.e. once "ChequeSettings" exists. It reads the JSON dump produced by
 * prisma/export-receipt-settings-for-cheque-migration.ts (which must have
 * been run BEFORE the migration, since that migration drops the source
 * table) and creates/updates each company's default ChequeSettings row with
 * whatever has an equivalent in the new blocks-based model.
 *
 * Field mapping notes (old boolean flag -> new representation):
 * - showClientInfo      -> blocks: client, client_phone
 * - showManagerName     -> blocks: cashier
 * - showManagerPhone    -> blocks: cashier_phone
 * - showCashback        -> blocks: cashback
 * - showDebtLine /
 *   hasCustomerDebt     -> blocks: debt_before, debt_added, debt_paid, debt_after
 * - hasCustomerBalance  -> blocks: balance_before, balance_added, balance_deducted, balance_after
 * - showQrCode          -> blocks: qr_code; qrCodeUrl copied directly
 * - showItemIndex       -> blocks: item_index
 * - hasBarCode          -> blocks: barcode
 * - hasAddress/address  -> blocks: address (address text itself is resolved live from Shop in the new model, not stored here)
 * - hasWorkingHours     -> blocks: working_hours
 * - hasWebsite          -> blocks: website
 * - hasTaxId            -> blocks: tax_id
 * - hasPhone            -> blocks: contacts (closest equivalent; new model has no separate shop-phone block)
 * - hasBranchName       -> no real equivalent (shop_name stays on regardless)
 * - paperWidth, fontSize, dividerStyle, dividerGap, sectionGap, itemDividers,
 *   hasLogo, logoUrl, footerMessage, footerNote, qrCodeUrl, elementStyles -> copied directly (same field names on both models)
 * - hasInformationBlock, hasLowerBlock -> no old equivalent; left at their schema defaults (true)
 */

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is not configured');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const INPUT_PATH = join(__dirname, 'receipt-settings-export.json');
const DRY_RUN = process.argv.includes('--dry-run');

interface ExportedReceiptSettingsRow {
  id: string;
  companyId: string;
  shopId: string;
  showClientInfo: boolean;
  showManagerName: boolean;
  showManagerPhone: boolean;
  showCashback: boolean;
  showDebtLine: boolean;
  showQrCode: boolean;
  showItemIndex: boolean;
  paperWidth: number;
  fontSize: number;
  dividerStyle: string;
  dividerGap: number;
  sectionGap: number;
  itemDividers: boolean;
  footerMessage: string;
  footerNote: string;
  hasLogo: boolean;
  logoUrl: string;
  hasBarCode: boolean;
  hasBranchName: boolean;
  hasAddress: boolean;
  hasPhone: boolean;
  hasWorkingHours: boolean;
  hasWebsite: boolean;
  hasTaxId: boolean;
  qrCodeUrl: string;
  hasCustomerDebt: boolean;
  hasCustomerBalance: boolean;
  elementStyles: unknown;
}

function setBlockActive(
  blocks: ChequeBlockDefinition[],
  key: string,
  isActive: boolean,
): void {
  const block = blocks.find((b) => b.key === key);
  if (block) {
    block.isActive = isActive;
  }
}

function buildBlocksFromReceiptSettings(
  row: ExportedReceiptSettingsRow,
): ChequeBlockDefinition[] {
  const blocks = DEFAULT_CHEQUE_BLOCKS.map((b) => ({ ...b }));

  setBlockActive(blocks, 'client', row.showClientInfo);
  setBlockActive(blocks, 'client_phone', row.showClientInfo);
  setBlockActive(blocks, 'cashier', row.showManagerName);
  setBlockActive(blocks, 'cashier_phone', row.showManagerPhone);
  setBlockActive(blocks, 'cashback', row.showCashback);
  setBlockActive(blocks, 'qr_code', row.showQrCode);
  setBlockActive(blocks, 'item_index', row.showItemIndex);
  setBlockActive(blocks, 'barcode', row.hasBarCode);
  setBlockActive(blocks, 'address', row.hasAddress);
  setBlockActive(blocks, 'working_hours', row.hasWorkingHours);
  setBlockActive(blocks, 'website', row.hasWebsite);
  setBlockActive(blocks, 'tax_id', row.hasTaxId);
  setBlockActive(blocks, 'contacts', row.hasPhone);
  // shop_name has no real off-switch in the old model (hasBranchName only
  // gated a redundant branch-name override) — keep it on, matching the
  // catalog default, regardless of the old flag's value.
  setBlockActive(blocks, 'shop_name', true);

  const debtVisible = row.showDebtLine || row.hasCustomerDebt;
  setBlockActive(blocks, 'debt_before', debtVisible);
  setBlockActive(blocks, 'debt_added', debtVisible);
  setBlockActive(blocks, 'debt_paid', debtVisible);
  setBlockActive(blocks, 'debt_after', debtVisible);

  setBlockActive(blocks, 'balance_before', row.hasCustomerBalance);
  setBlockActive(blocks, 'balance_added', row.hasCustomerBalance);
  setBlockActive(blocks, 'balance_deducted', row.hasCustomerBalance);
  setBlockActive(blocks, 'balance_after', row.hasCustomerBalance);

  return blocks;
}

function buildChequeSettingsData(row: ExportedReceiptSettingsRow) {
  return {
    paperWidth: row.paperWidth,
    fontSize: row.fontSize,
    dividerStyle: row.dividerStyle,
    dividerGap: row.dividerGap,
    sectionGap: row.sectionGap,
    itemDividers: row.itemDividers,
    hasLogo: row.hasLogo,
    logoUrl: row.logoUrl,
    footerMessage: row.footerMessage,
    footerNote: row.footerNote,
    qrCodeUrl: row.qrCodeUrl,
    elementStyles: (row.elementStyles ?? Prisma.JsonNull) as Prisma.InputJsonValue,
    blocks: buildBlocksFromReceiptSettings(row) as unknown as Prisma.InputJsonValue,
  };
}

async function main() {
  if (!existsSync(INPUT_PATH)) {
    console.log(
      `No export file found at ${INPUT_PATH}. Run ` +
        'prisma/export-receipt-settings-for-cheque-migration.ts against the ' +
        'pre-migration database first.',
    );
    return;
  }

  const dump = JSON.parse(readFileSync(INPUT_PATH, 'utf-8')) as {
    totalRows: number;
    nonDefaultRows: number;
    rows: ExportedReceiptSettingsRow[];
  };

  if (!dump.rows.length) {
    console.log(
      `Export file confirms no backfill was required (checked ${dump.totalRows} row(s), all on defaults).`,
    );
    return;
  }

  // One ChequeSettings row per company (per-shop settings collapse onto the
  // company-wide default) — if a company had multiple customized shops,
  // the most recently created ReceiptSettings row for that company wins.
  const byCompany = new Map<string, ExportedReceiptSettingsRow>();
  for (const row of dump.rows) {
    byCompany.set(row.companyId, row);
  }

  console.log(
    `Backfilling ${byCompany.size} compan${byCompany.size === 1 ? 'y' : 'ies'} from ${dump.rows.length} exported row(s).`,
  );

  const changes: { companyId: string; action: 'create' | 'update' }[] = [];

  await prisma.$transaction(async (tx) => {
    for (const [companyId, row] of byCompany) {
      const existingDefault = await tx.chequeSettings.findFirst({
        where: { companyId, isDefault: true },
      });
      const anyExisting =
        existingDefault ??
        (await tx.chequeSettings.findFirst({
          where: { companyId },
          orderBy: { createdAt: 'asc' },
        }));

      const data = buildChequeSettingsData(row);

      if (anyExisting) {
        changes.push({ companyId, action: 'update' });
        console.log(`- #${companyId}: updating existing template "${anyExisting.name}" (${anyExisting.id})`);
        if (!DRY_RUN) {
          await tx.chequeSettings.update({
            where: { id: anyExisting.id },
            data: { ...data, isDefault: true },
          });
        }
      } else {
        changes.push({ companyId, action: 'create' });
        console.log(`- #${companyId}: creating new default template`);
        if (!DRY_RUN) {
          await tx.chequeSettings.create({
            data: {
              companyId,
              name: 'Стандартный',
              isDefault: true,
              ...data,
            },
          });
        }
      }
    }
  });

  if (DRY_RUN) {
    console.log(`\nDry run — no changes written. Would have: ${changes.length} update(s)/create(s).`);
  } else {
    console.log(`\nBackfilled ${changes.length} compan${changes.length === 1 ? 'y' : 'ies'}' ChequeSettings.`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

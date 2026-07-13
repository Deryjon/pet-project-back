import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is not configured');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

// One-time copy of ChequeSetting (+ per-shop Cashbox.chequeId overrides) into the new
// per-shop ReceiptSettings model. Run this AFTER the migration that adds Receipt/
// ReceiptSettings but BEFORE the follow-up migration that drops ChequeSetting — both
// tables must exist simultaneously for this script to read from one and write the other.
//
//   npx prisma migrate dev --name add_receipts_and_receipt_settings
//   npx ts-node prisma/migrate-receipt-settings.ts
//   (remove ChequeSetting model + Company.cheques from schema.prisma)
//   npx prisma migrate dev --name drop_cheque_setting

async function main() {
  const companies = await prisma.company.findMany({ select: { id: true } });

  let shopsProcessed = 0;
  let shopsWithSource = 0;
  let shopsSkipped = 0;

  for (const company of companies) {
    const chequeRows = await prisma.chequeSetting.findMany({
      where: { companyId: company.id },
    });
    const defaultCheque =
      chequeRows.find((c) => c.isDefault) ?? chequeRows[0] ?? null;

    const shops = await prisma.shop.findMany({
      where: { companyId: company.id },
    });

    for (const shop of shops) {
      shopsProcessed += 1;

      const cashboxes = await prisma.cashbox.findMany({
        where: { shopId: shop.id },
      });
      const cashboxChequeId = cashboxes.find((c) => c.chequeId)?.chequeId;
      const sourceCheque =
        (cashboxChequeId &&
          chequeRows.find((c) => c.id === cashboxChequeId)) ||
        defaultCheque;

      if (!sourceCheque) {
        shopsSkipped += 1;
        continue;
      }

      shopsWithSource += 1;
      const extra = (sourceCheque.extraSettings ?? {}) as Record<string, unknown>;

      await prisma.receiptSettings.upsert({
        where: { shopId: shop.id },
        create: {
          companyId: company.id,
          shopId: shop.id,
          ...buildReceiptSettingsPatch(sourceCheque, extra),
        },
        update: buildReceiptSettingsPatch(sourceCheque, extra),
      });
    }
  }

  console.log('Migration summary:');
  console.log({
    companies: companies.length,
    shopsProcessed,
    shopsWithSource,
    shopsSkipped,
  });
}

function buildReceiptSettingsPatch(
  sourceCheque: {
    compact: boolean;
    width: number;
    hasLogo: boolean;
    logoUrl: string;
    hasBarCode: boolean;
    displayText: string;
    hasCustomerDebt: boolean;
    hasCustomerBalance: boolean;
  },
  extra: Record<string, unknown>,
) {
  return {
    paperWidth: sourceCheque.compact
      ? 58
      : sourceCheque.width > 0
        ? Math.round(sourceCheque.width)
        : 80,
    hasLogo: sourceCheque.hasLogo,
    logoUrl: sourceCheque.logoUrl,
    hasBarCode: sourceCheque.hasBarCode,
    footerMessage: sourceCheque.displayText ?? '',
    branchName: String(extra.branchName ?? ''),
    hasBranchName: Boolean(extra.hasBranchName ?? false),
    address: String(extra.address ?? ''),
    hasAddress: Boolean(extra.hasAddress ?? false),
    phone: String(extra.phone ?? ''),
    hasPhone: Boolean(extra.hasPhone ?? false),
    workingHours: String(extra.workingHours ?? ''),
    hasWorkingHours: Boolean(extra.hasWorkingHours ?? false),
    website: String(extra.website ?? ''),
    hasWebsite: Boolean(extra.hasWebsite ?? false),
    taxId: String(extra.taxId ?? ''),
    hasTaxId: Boolean(extra.hasTaxId ?? false),
    qrCodeUrl: String(extra.qrCodeUrl ?? ''),
    showQrCode: Boolean(extra.hasQrCode ?? false),
    hasCustomerDebt: sourceCheque.hasCustomerDebt,
    hasCustomerBalance: sourceCheque.hasCustomerBalance,
    elementStyles: (extra.elementStyles as any) ?? undefined,
  };
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

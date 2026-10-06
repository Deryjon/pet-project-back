-- Align migrated databases with schema.prisma (detected by test:postgres).

-- AlterTable
ALTER TABLE "InventoryItem" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "InventorySession" ALTER COLUMN "status" SET DEFAULT 'DRAFT';

-- RenameIndex: PostgreSQL truncated the original 79-character name to 63
-- characters; Prisma expects its own shortened name.
ALTER INDEX "ProductBundleComponent_bundleProductId_componentProductId_compo" RENAME TO "ProductBundleComponent_bundleProductId_componentProductId_c_key";

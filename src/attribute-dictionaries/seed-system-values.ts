import { randomUUID } from 'crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { systemValues } from './system-values';

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Inserts the system values that are missing. Idempotent: an existing value
 * (type + group + code) is left as it is, including the name, order and
 * activity a super admin may have changed. Returns how many were inserted.
 */
export async function seedSystemAttributeValues(
  db: Db,
  year = new Date().getFullYear(),
) {
  let inserted = 0;
  for (const value of systemValues(year)) {
    inserted += await db.$executeRaw`
      INSERT INTO "AttributeValue"
        ("id", "type", "companyId", "code", "name", "group", "isDefault", "isActive", "sortOrder", "updatedAt")
      VALUES
        (${randomUUID()}, ${value.type}::"AttributeValueType", NULL, ${value.code}, ${value.name},
         ${value.group}, true, true, ${value.sortOrder}, now())
      ON CONFLICT ("type", COALESCE("companyId", ''), COALESCE("group", ''), "code") DO NOTHING`;
  }
  return inserted;
}

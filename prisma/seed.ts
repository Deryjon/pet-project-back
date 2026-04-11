import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is not configured');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const DEFAULT_COMPANY_ROLES = [
  { code: 'owner', name: 'Управляющий компании', isSystem: true },
  { code: 'admin', name: 'Админ', isSystem: true },
  { code: 'store_manager', name: 'Управляющий магазина', isSystem: true },
  { code: 'cashier', name: 'Кассир', isSystem: true },
  { code: 'employee', name: 'Сотрудник', isSystem: true },
] as const;

const DEFAULT_PLATFORM_ROLES = [
  { code: 'platform_admin', name: 'Админ платформы', isSystem: true },
  { code: 'support', name: 'Поддержка', isSystem: true },
  { code: 'superadmin', name: 'Суперадмин', isSystem: true },
] as const;

function normalizePhoneNumber(value: string) {
  const normalized = value.replace(/\D/g, '');

  if (!normalized) {
    throw new Error('Phone number must contain digits');
  }

  return normalized;
}

async function main() {
  const companyLogin =
    process.env.COMPANY_LOGIN ?? process.env.COMPANY_SUBDOMAIN ?? 'konkurentcases';
  const companySubdomain = process.env.COMPANY_SUBDOMAIN ?? companyLogin;
  const companyName = process.env.COMPANY_NAME ?? 'Konkurentcases';
  const adminPhone = normalizePhoneNumber(
    process.env.PLATFORM_ADMIN_PHONE ?? '+998900000001',
  );
  const adminPassword = process.env.PLATFORM_ADMIN_PASSWORD ?? 'admin123';
  const primaryPlatformRole = DEFAULT_PLATFORM_ROLES[0]?.code ?? 'platform_admin';

  const company = await prisma.company.upsert({
    where: {
      login: companyLogin,
    },
    update: {
      name: companyName,
      subdomain: companySubdomain,
      isActive: true,
    },
    create: {
      login: companyLogin,
      name: companyName,
      subdomain: companySubdomain,
      isActive: true,
    },
  });

  const shops = [
    {
      branchCode: 'main',
      name: 'Samarqand Darvoza',
    },
    {
      branchCode: 'a',
      name: 'Globus Mall',
    },
  ];

  for (const shop of shops) {
    await prisma.shop.upsert({
      where: {
        companyId_branchCode: {
          companyId: company.id,
          branchCode: shop.branchCode,
        },
      },
      update: {
        name: shop.name,
        isActive: true,
      },
      create: {
        companyId: company.id,
        branchCode: shop.branchCode,
        name: shop.name,
        isActive: true,
      },
    });
  }

  for (const role of DEFAULT_COMPANY_ROLES) {
    await prisma.companyRole.upsert({
      where: {
        companyId_code: {
          companyId: company.id,
          code: role.code,
        },
      },
      update: {
        name: role.name,
        isSystem: role.isSystem,
        isActive: true,
      },
      create: {
        companyId: company.id,
        code: role.code,
        name: role.name,
        isSystem: role.isSystem,
        isActive: true,
      },
    });
  }

  const adminPhoneVariants = [adminPhone, `+${adminPhone}`];
  const existingPlatformAdmins = await prisma.user.findMany({
    where: {
      phoneNumber: {
        in: adminPhoneVariants,
      },
      userType: 'platform',
    },
    orderBy: {
      id: 'asc',
    },
  });

  const primaryPlatformAdmin = existingPlatformAdmins[0];

  if (primaryPlatformAdmin) {
    await prisma.user.update({
      where: {
        id: primaryPlatformAdmin.id,
      },
      data: {
        firstName: 'Platform',
        lastName: 'Admin',
        phoneNumber: adminPhone,
        password: await bcrypt.hash(adminPassword, 10),
        role: primaryPlatformRole,
        isActive: true,
      },
    });

    const duplicatePlatformAdminIds = existingPlatformAdmins
      .slice(1)
      .map((user) => user.id);

    if (duplicatePlatformAdminIds.length) {
      await prisma.user.deleteMany({
        where: {
          id: {
            in: duplicatePlatformAdminIds,
          },
        },
      });
    }
  } else {
    await prisma.user.create({
      data: {
        firstName: 'Platform',
        lastName: 'Admin',
        phoneNumber: adminPhone,
        password: await bcrypt.hash(adminPassword, 10),
        userType: 'platform',
        role: primaryPlatformRole,
        isActive: true,
      },
    });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

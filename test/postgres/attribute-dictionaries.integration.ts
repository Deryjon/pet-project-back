import { randomUUID } from 'crypto';
import { StoreType } from '@prisma/client';
import { AttributeDictionariesService } from '../../src/attribute-dictionaries/attribute-dictionaries.service';
import { seedSystemAttributeValues } from '../../src/attribute-dictionaries/seed-system-values';
import { PrismaService } from '../../src/prisma/prisma.service';
import { companyContext } from '../fixtures/request-context';
import { database } from './support';

describe('Attribute dictionaries (system + store values)', () => {
  const { client: db, close } = database();
  const service = new AttributeDictionariesService(
    db as unknown as PrismaService,
  );

  beforeAll(async () => {
    await seedSystemAttributeValues(db, 2026);
  });
  afterAll(close);

  async function store(storeType: StoreType, isAdmin = true) {
    const key = randomUUID();
    const company = await db.company.create({
      data: { login: key, subdomain: key, name: 'Store', storeType },
    });
    const role = await db.role.create({
      data: { companyId: company.id, name: 'Owner', externalId: 1, isAdmin },
    });
    return {
      company,
      context: companyContext({ companyId: company.id, crmRoleId: role.id }),
    };
  }

  async function status(promise: Promise<unknown>) {
    try {
      await promise;
      return 200;
    } catch (error: any) {
      return error.getStatus?.() ?? error;
    }
  }

  it('seeds idempotently and gives every apparel store 50 colours', async () => {
    expect(await seedSystemAttributeValues(db, 2026)).toBe(0);
    const { context } = await store('CLOTHING');
    expect(await service.list('COLOR', context)).toHaveLength(50);
    const seasons = await service.list('SEASON', context);
    expect(seasons.map((s) => s.code)).toEqual(
      expect.arrayContaining([
        'SPRING',
        'SUMMER',
        'AUTUMN',
        'WINTER',
        'DEMI',
        'ALL',
        'SS26',
        'FW27',
      ]),
    );
  });

  it('shows size groups by store type and nothing to other store types', async () => {
    const clothing = await store('CLOTHING');
    const shoes = await store('SHOES');
    const accessories = await store('ACCESSORIES');
    const groups = async (context: any) =>
      [
        ...new Set((await service.list('SIZE', context)).map((s) => s.group)),
      ].sort();
    expect(await groups(clothing.context)).toEqual([
      'LETTER',
      'NUM_BOTTOM',
      'NUM_TOP',
    ]);
    expect(await groups(shoes.context)).toEqual(['NUM_SHOES']);
    expect(await status(service.list('COLOR', accessories.context))).toBe(403);
  });

  it('normalizes and refuses duplicates with 409 and the existing value', async () => {
    const { context } = await store('CLOTHING');
    for (const input of ['XXL', 'xxl', 'ХХЛ', '2xl', '2 XL', '2-XL']) {
      const error: any = await service
        .create('SIZE', { code: input }, context)
        .catch((e) => e);
      expect(error.getStatus()).toBe(409);
      expect(error.getResponse().existing).toMatchObject({
        code: '2XL',
        scope: 'system',
      });
    }
    const white: any = await service
      .create('COLOR', { code: '#fff' }, context)
      .catch((e) => e);
    expect(white.getResponse().existing).toMatchObject({
      code: '#FFFFFF',
      name: 'Белый',
    });
  });

  it('stores an own colour by HEX, warns about a similar one, and refuses its duplicate', async () => {
    const { context } = await store('CLOTHING');
    const created = await service.create('COLOR', { code: '#fefefe' }, context);
    expect(created).toMatchObject({
      code: '#FEFEFE',
      name: null,
      scope: 'store',
      is_default: false,
    });
    expect(created.warnings[0]).toMatchObject({
      code: 'SIMILAR_COLOR',
      similar: { code: '#FFFFFF' },
    });
    expect(
      await status(service.create('COLOR', { hex: 'FEFEFE' }, context)),
    ).toBe(409);
    const own = await service.create('SIZE', { code: '5xl' }, context);
    expect(own).toMatchObject({ code: '5XL', group: 'LETTER' });
  });

  it('lets a store hide and move a system value but not change it', async () => {
    const { context } = await store('CLOTHING');
    const [black] = (await service.list('COLOR', context)).filter(
      (c) => c.code === '#000000',
    );
    expect(
      await status(service.update(black.id, { name: 'Чёрный!' }, context)),
    ).toBe(403);
    expect(
      await status(service.update(black.id, { is_active: false }, context)),
    ).toBe(403);
    expect(await status(service.remove(black.id, context))).toBe(403);
    await service.update(black.id, { is_hidden: true, sort_order: 5 }, context);
    expect(
      (await service.list('COLOR', context)).some((c) => c.id === black.id),
    ).toBe(false);
    const all = await service.list('COLOR', context, true);
    expect(all.find((c) => c.id === black.id)).toMatchObject({
      is_hidden: true,
      sort_order: 5,
    });
    // The system value itself and other stores are untouched.
    expect(
      await db.attributeValue.findUnique({ where: { id: black.id } }),
    ).toMatchObject({
      name: 'Чёрный',
      isActive: true,
    });
    const other = await store('CLOTHING');
    expect(
      (await service.list('COLOR', other.context)).some(
        (c) => c.id === black.id,
      ),
    ).toBe(true);
  });

  it('keeps store values apart from system management and from other stores', async () => {
    const a = await store('CLOTHING');
    const b = await store('CLOTHING');
    const own = await service.create(
      'COLOR',
      { code: '#123456', name: 'Свой' },
      a.context,
    );
    expect(await status(service.adminUpdate(own.id, { name: 'x' }))).toBe(403);
    expect(await status(service.update(own.id, { name: 'x' }, b.context))).toBe(
      404,
    );
    expect(await status(service.remove(own.id, b.context))).toBe(404);
    expect(
      await status(service.update(own.id, { code: '#654321' }, a.context)),
    ).toBe(400);
    expect(
      await service.update(own.id, { name: 'Мой синий' }, a.context),
    ).toMatchObject({
      name: 'Мой синий',
    });
  });

  it('requires the owner/admin role for changes', async () => {
    const { context } = await store('CLOTHING', false);
    expect(await service.list('COLOR', context)).toHaveLength(50);
    expect(
      await status(service.create('COLOR', { code: '#ABCDEF' }, context)),
    ).toBe(403);
  });

  it('deletes an unused own value and archives a used one', async () => {
    const { company, context } = await store('CLOTHING');
    const unused = await service.create('COLOR', { code: '#0A0B0C' }, context);
    expect(await service.remove(unused.id, context)).toMatchObject({
      deleted: true,
    });
    const used = await service.create('COLOR', { code: '#0C0B0A' }, context);
    const product = await db.product.create({
      data: { companyId: company.id, name: 'P' },
    });
    await db.productVariant.create({
      data: {
        companyId: company.id,
        productId: product.id,
        colorValueId: used.id,
      },
    });
    expect(await service.remove(used.id, context)).toMatchObject({
      deleted: false,
      archived: true,
    });
    expect(
      (await service.list('COLOR', context)).some((c) => c.id === used.id),
    ).toBe(false);
    // Archived, so the code is still taken: no duplicate.
    expect(
      await status(service.create('COLOR', { code: '#0c0b0a' }, context)),
    ).toBe(409);
  });

  it('lets the super admin manage system values without changing codes', async () => {
    const created = await service.adminCreate({
      type: 'SIZE',
      code: '5xl',
      group: 'LETTER',
    });
    expect(created).toMatchObject({
      code: '5XL',
      scope: 'system',
      is_default: true,
    });
    expect(
      await status(
        service.adminCreate({ type: 'SIZE', code: 'XXXXXL', group: 'LETTER' }),
      ),
    ).toBe(409);
    expect(await status(service.adminUpdate(created.id, { code: '6XL' }))).toBe(
      400,
    );
    expect(
      await service.adminUpdate(created.id, { is_active: false }),
    ).toMatchObject({ is_active: false });
    await db.attributeValue.delete({ where: { id: created.id } });
  });

  it('enforces one system value per type, group and code in the database', async () => {
    await expect(
      db.$executeRaw`INSERT INTO "AttributeValue" (id, type, code, "group", "isDefault", "updatedAt")
        VALUES (${randomUUID()}, 'SIZE', 'M', 'LETTER', true, now())`,
    ).rejects.toThrow();
    await expect(
      db.attributeValue.create({
        data: {
          type: 'COLOR',
          code: '#010101',
          isDefault: true,
          companyId: (await store('CLOTHING')).company.id,
        },
      }),
    ).rejects.toThrow();
  });
});

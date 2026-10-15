import { Prisma } from '@prisma/client';
import { companyContext as testContext } from '../../test/fixtures/request-context';
import { ProductAttributesService } from './product-attributes.service';

const conflictBody = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error: any) {
    expect(error.getStatus?.()).toBe(409);
    return error.getResponse();
  }
  throw new Error('expected a 409');
};

describe('Colour / size dictionaries', () => {
  function setup(
    colors: Array<Record<string, unknown>> = [],
    sizes: Array<Record<string, unknown>> = [],
  ) {
    const colorCreate = jest.fn(async ({ data }: any) => ({
      id: 'c-1',
      createdAt: new Date(),
      ...data,
    }));
    const sizeCreate = jest.fn(async ({ data }: any) => ({ id: 's-1', createdAt: new Date(), ...data }));
    const prisma: any = {
      company: { findUnique: jest.fn(async () => ({ storeType: 'CLOTHING' })) },
      productColor: { findMany: jest.fn(async () => colors), create: colorCreate },
      productSize: { findMany: jest.fn(async () => sizes), create: sizeCreate },
    };
    return { service: new ProductAttributesService(prisma), prisma, colorCreate, sizeCreate };
  }
  const red = {
    id: 'red',
    code: 'RED',
    name: 'Красный',
    nameRu: 'Красный',
    hex: '#FF0000',
    isActive: true,
    sortOrder: 0,
    createdAt: new Date(),
  };

  it('a store colour is its HEX: no typed name, HEX as name and code', async () => {
    const { service, colorCreate } = setup();
    const color = await service.createColor({ name: 'Тёмно-синий', hex: '#1f2a44' }, testContext());
    expect(colorCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ code: 'D1F2A44', name: '#1F2A44', nameRu: '#1F2A44', nameUz: '#1F2A44', hex: '#1F2A44' }),
    });
    expect(color.hex).toBe('#1F2A44');
  });

  it('accepts the colour picker value the product form used to send as "code", and short HEX', async () => {
    const { service, colorCreate } = setup();
    await service.createColor({ code: '#0f0' }, testContext());
    expect(colorCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ code: 'D00FF00', hex: '#00FF00' }),
    });
  });

  it('the same HEX again is a 409 with the existing colour, nothing is created', async () => {
    const { service, colorCreate } = setup([red]);
    const body = await conflictBody(service.createColor({ hex: '#ff0000' }, testContext()));
    expect(body).toEqual(
      expect.objectContaining({
        message: 'Такой цвет уже есть: Красный (#FF0000)',
        existing: expect.objectContaining({ id: 'red' }),
      }),
    );
    expect(colorCreate).not.toHaveBeenCalled();
  });

  it('a near-identical colour is created with a warning', async () => {
    const { service, colorCreate } = setup([red]);
    const color = await service.createColor({ hex: '#FE0101' }, testContext());
    expect(colorCreate).toHaveBeenCalled();
    expect(color.warning).toBe('Похожий цвет уже есть: Красный (#FF0000)');
  });

  it('rejects a missing or bad colour with clear messages', async () => {
    const { service } = setup();
    await expect(service.createColor({ name: 'Красный' }, testContext())).rejects.toThrow('Выберите цвет');
    await expect(service.createColor({ hex: 'red' }, testContext())).rejects.toThrow('#RRGGBB');
  });

  it('quick-added shoe sizes are shoe sizes and do not clash with clothing 42', async () => {
    const { service, sizeCreate } = setup([], [
      { id: 'c42', code: '42', name: '42', nameRu: '42', kind: 'CLOTHING', type: 'CLOTHING', isActive: true },
    ]);
    await service.createSize({ name: '42', type: 'SHOES' }, testContext());
    expect(sizeCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ kind: 'SHOES', code: 'S42', name: '42' }) });
  });

  it.each(['xl', 'XL ', 'ХЛ'])('%p next to the existing XL is a 409, not a second XL', async (value) => {
    const { service, sizeCreate } = setup([], [
      { id: 'xl', code: 'XL', name: 'XL', nameRu: 'XL', kind: 'CLOTHING', type: 'CLOTHING', isActive: true },
    ]);
    const body = await conflictBody(service.createSize({ name: value, type: 'CLOTHING' }, testContext()));
    expect(body.existing).toEqual(expect.objectContaining({ id: 'xl' }));
    expect(sizeCreate).not.toHaveBeenCalled();
  });

  it.each(['XXL', 'xxl', '2 xl', 'ХХЛ'])('%p is stored as 2XL', async (value) => {
    const { service, sizeCreate } = setup();
    await service.createSize({ name: value, type: 'CLOTHING' }, testContext());
    expect(sizeCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ code: '2XL', name: '2XL' }) });
  });

  it('XXL next to an existing 2XL is a 409', async () => {
    const { service } = setup([], [
      { id: '2xl', code: '2XL', name: '2XL', nameRu: '2XL', kind: 'CLOTHING', type: 'CLOTHING', isActive: true },
    ]);
    const body = await conflictBody(service.createSize({ name: 'XXL' }, testContext()));
    expect(body.existing).toEqual(expect.objectContaining({ id: '2xl' }));
  });
});

describe('Values of the built-in colour / size attributes', () => {
  function setup(legacySource: string | null) {
    const colorCreate = jest.fn(async ({ data }: any) => ({ id: 'color-1', createdAt: new Date(), ...data }));
    const optionCreate = jest.fn(async ({ data }: any) => ({ id: 'opt-9', isActive: true, meta: null, ...data }));
    const colorUpdate = jest.fn(async ({ data }: any) => ({ id: 'color-1', createdAt: new Date(), name: 'Красный', code: 'KRASNYY', ...data }));
    const prisma: any = {
      company: { findUnique: jest.fn(async () => ({ storeType: 'CLOTHING' })) },
      attributeDefinition: {
        findFirst: jest.fn(async () => ({ id: 'def-1', companyId: 'company-1', kind: 'SELECT', legacySource })),
      },
      attributeOption: {
        // The DB trigger mirrors the new colour into an option.
        findFirst: jest.fn(async () => ({
          id: 'opt-1',
          value: 'Бордовый',
          sortOrder: 0,
          isActive: true,
          meta: null,
          legacyColorId: 'color-1',
          legacySizeId: null,
        })),
        findMany: jest.fn(async () => [
          { id: 'opt-2', value: 'Хлопок', sortOrder: 0, isActive: true, meta: null },
        ]),
        create: optionCreate,
      },
      productColor: {
        findFirst: jest.fn(async ({ where }: any) => (where.id ? { id: 'color-1', name: 'Красный', nameRu: 'Красный', code: 'KRASNYY' } : null)),
        findMany: jest.fn(async () => []),
        create: colorCreate,
        update: colorUpdate,
        delete: jest.fn(),
      },
      productVariant: { count: jest.fn(async () => 0) },
    };
    return { service: new ProductAttributesService(prisma), prisma, colorCreate, optionCreate, colorUpdate };
  }

  it('adding a value to "Цвет" creates the colour from its HEX', async () => {
    const { service, colorCreate, optionCreate } = setup('color');
    const option = await service.createOption('def-1', { value: 'Бордовый', meta: { hex: '#7b1e2b' } }, testContext());
    expect(colorCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ name: '#7B1E2B', code: 'D7B1E2B' }) });
    expect(optionCreate).not.toHaveBeenCalled();
    expect(option).toEqual(expect.objectContaining({ id: 'opt-1' }));
  });

  it('a colour value without a picked colour is refused', async () => {
    const { service, colorCreate } = setup('color');
    await expect(service.createOption('def-1', { value: 'Бордовый' }, testContext())).rejects.toThrow('Выберите цвет');
    expect(colorCreate).not.toHaveBeenCalled();
  });

  it.each(['хлопок', 'Хлопок ', 'ХЛОПОК'])('%p next to «Хлопок» is a 409', async (value) => {
    const { service, optionCreate } = setup(null);
    const body = await conflictBody(service.createOption('def-1', { value }, testContext()));
    expect(body.existing).toEqual(expect.objectContaining({ id: 'opt-2' }));
    expect(optionCreate).not.toHaveBeenCalled();
  });

  it('switching a colour value off goes through the colour dictionary', async () => {
    const { service, colorUpdate } = setup('color');
    await service.updateOption('def-1', 'opt-1', { is_active: false }, testContext());
    expect(colorUpdate).toHaveBeenCalledWith({ where: { id: 'color-1' }, data: { isActive: false } });
  });

  it('removing a colour value deletes the unused colour', async () => {
    const { service, prisma } = setup('color');
    await service.removeOption('def-1', 'opt-1', testContext());
    expect(prisma.productColor.delete).toHaveBeenCalledWith({ where: { id: 'color-1' } });
  });

  it('a tenant attribute still stores its own options', async () => {
    const { service, colorCreate, optionCreate } = setup(null);
    await service.createOption('def-1', { value: 'Лён' }, testContext());
    expect(optionCreate).toHaveBeenCalled();
    expect(colorCreate).not.toHaveBeenCalled();
  });
});

describe('Dictionary deletion safety', () => {
  const company = { findUnique: jest.fn(async () => ({ storeType: 'CLOTHING' })) };

  it('does not delete a colour referenced by a product variant', async () => {
    const prisma: any = {
      company,
      productColor: { findFirst: jest.fn(async () => ({ id: 'color-1' })), delete: jest.fn() },
      productVariant: { count: jest.fn(async () => 1) },
    };
    await expect(new ProductAttributesService(prisma).deleteColor('color-1', testContext())).rejects.toThrow(
      'Цвет используется в товарах',
    );
    expect(prisma.productColor.delete).not.toHaveBeenCalled();
  });

  it('does not delete a size referenced by a product variant', async () => {
    const prisma: any = {
      company,
      productSize: { findFirst: jest.fn(async () => ({ id: 'size-1' })), delete: jest.fn() },
      productVariant: { count: jest.fn(async () => 1) },
    };
    await expect(new ProductAttributesService(prisma).deleteSize('size-1', testContext())).rejects.toThrow();
    expect(prisma.productSize.delete).not.toHaveBeenCalled();
  });

  it('a size created from settings gets the clothing/shoe type the grids filter by', async () => {
    const create = jest.fn(async ({ data }: any) => ({ id: 's', createdAt: new Date(), ...data }));
    const prisma: any = { company, productSize: { findMany: jest.fn(async () => []), create } };
    await new ProductAttributesService(prisma).createSize({ name_ru: '44', kind: 'SHOES', code: '' }, testContext());
    expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({ kind: 'SHOES', type: 'SHOES', code: 'S44' }) });
  });
});

describe('Seasons and settings-form sizes', () => {
  const company = { findUnique: jest.fn(async () => ({ storeType: 'CLOTHING' })) };

  it('creates a season without a code', async () => {
    const create = jest.fn(async ({ data }: any) => ({ id: 'se-1', isActive: true, sortOrder: 1, ...data }));
    const prisma: any = {
      company,
      productSeasonOption: { findMany: jest.fn(async () => []), findFirst: jest.fn(async () => null), create },
    };
    const season = await new ProductAttributesService(prisma).createSeason({ name_ru: 'Лето 2026', sort_order: 1 }, testContext());
    expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({ code: 'LETO2026', nameRu: 'Лето 2026', nameUz: 'Лето 2026' }) });
    expect(season.code).toBe('LETO2026');
  });

  it.each([
    ['лето', {}],
    ['Лето ', {}],
    ['Летний', { code: 'summer' }],
  ])('%p next to «Лето» (SUMMER) is a 409', async (name, extra) => {
    const create = jest.fn();
    const summer = { id: 'su', code: 'SUMMER', nameRu: 'Лето', nameUz: 'Yoz', isActive: true, sortOrder: 0 };
    const prisma: any = {
      company,
      productSeasonOption: { findMany: jest.fn(async () => [summer]), create },
    };
    const body = await conflictBody(
      new ProductAttributesService(prisma).createSeason({ name_ru: name, ...extra }, testContext()),
    );
    expect(body.existing).toEqual(expect.objectContaining({ id: 'su' }));
    expect(create).not.toHaveBeenCalled();
  });

  it('creates a clothing size from the settings form payload', async () => {
    const create = jest.fn(async ({ data }: any) => ({ id: 's', createdAt: new Date(), ...data }));
    const prisma: any = { company, productSize: { findMany: jest.fn(async () => []), create } };
    await new ProductAttributesService(prisma).createSize(
      { name_ru: 'XL', name_uz: 'XL', sort_order: 5, is_active: true, kind: 'CLOTHING' },
      testContext(),
    );
    expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({ code: 'XL', type: 'CLOTHING', kind: 'CLOTHING', sortOrder: 5 }) });
  });
});

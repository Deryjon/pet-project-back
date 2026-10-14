import { Prisma } from '@prisma/client';
import { companyContext as testContext } from '../../test/fixtures/request-context';
import { ProductAttributesService } from './product-attributes.service';

describe('Colour / size dictionaries', () => {
  function setup(existingCodes: string[] = []) {
    const colorCreate = jest.fn(async ({ data }: any) => ({
      id: 'c-1',
      createdAt: new Date(),
      ...data,
    }));
    const sizeCreate = jest.fn(async ({ data }: any) => ({ id: 's-1', createdAt: new Date(), ...data }));
    const prisma: any = {
      company: { findUnique: jest.fn(async () => ({ storeType: 'CLOTHING' })) },
      productColor: {
        findFirst: jest.fn(async ({ where }: any) => (existingCodes.includes(where.code) ? { id: 'x' } : null)),
        create: colorCreate,
      },
      productSize: {
        findFirst: jest.fn(async ({ where }: any) => (existingCodes.includes(where.code) ? { id: 'x' } : null)),
        create: sizeCreate,
      },
    };
    return { service: new ProductAttributesService(prisma), prisma, colorCreate, sizeCreate };
  }

  it('creates a colour without a code: the code is built from the name', async () => {
    const { service, colorCreate } = setup();
    const color = await service.createColor({ name: 'Тёмно-синий', hex: '#1f2a44' }, testContext());
    expect(colorCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ code: 'TEMNOSINIY', name: 'Тёмно-синий', nameUz: 'Тёмно-синий', hex: '#1F2A44' }),
    });
    expect(color.code).toBe('TEMNOSINIY');
  });

  it('accepts the colour picker value the product form used to send as "code"', async () => {
    const { service, colorCreate } = setup();
    await service.createColor({ name: 'Красный', code: '#ff0000' }, testContext());
    expect(colorCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ code: 'KRASNYY', hex: '#FF0000' }),
    });
  });

  it('makes an auto code unique', async () => {
    const { service, colorCreate } = setup(['KRASNYY', 'KRASNYY.2']);
    await service.createColor({ name: 'Красный' }, testContext());
    expect(colorCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ code: 'KRASNYY.3' }) });
  });

  it('explains a duplicate name in Russian', async () => {
    const { service, colorCreate } = setup();
    colorCreate.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('Unique', {
        code: 'P2002',
        clientVersion: 'test',
        meta: { target: ['companyId', 'name'] },
      }),
    );
    await expect(service.createColor({ name: 'Красный' }, testContext())).rejects.toThrow('Цвет «Красный» уже есть');
  });

  it('rejects a bad typed code and a bad hex with clear messages', async () => {
    const { service } = setup();
    await expect(service.createColor({ name: 'Красный', code: 'КРС' }, testContext())).rejects.toThrow(
      'Код может содержать только латинские буквы',
    );
    await expect(service.createColor({ name: 'Красный', hex: 'red' }, testContext())).rejects.toThrow('#RRGGBB');
    await expect(service.createColor({ name: '  ' }, testContext())).rejects.toThrow('Укажите название');
  });

  it('quick-added shoe sizes are shoe sizes and do not clash with clothing 42', async () => {
    const { service, sizeCreate } = setup(['42']);
    await service.createSize({ name: '42', type: 'SHOES' }, testContext());
    expect(sizeCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ kind: 'SHOES', code: 'S42', name: '42' }) });
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
        create: optionCreate,
      },
      productColor: {
        findFirst: jest.fn(async ({ where }: any) => (where.id ? { id: 'color-1', name: 'Красный', nameRu: 'Красный', code: 'KRASNYY' } : null)),
        create: colorCreate,
        update: colorUpdate,
        delete: jest.fn(),
      },
      productVariant: { count: jest.fn(async () => 0) },
    };
    return { service: new ProductAttributesService(prisma), prisma, colorCreate, optionCreate, colorUpdate };
  }

  it('adding a value to "Цвет" creates the colour with an automatic code', async () => {
    const { service, colorCreate, optionCreate } = setup('color');
    const option = await service.createOption('def-1', { value: 'Бордовый' }, testContext());
    expect(colorCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ name: 'Бордовый', code: 'BORDOVYY' }) });
    expect(optionCreate).not.toHaveBeenCalled();
    expect(option).toEqual(expect.objectContaining({ id: 'opt-1', value: 'Бордовый' }));
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
    await service.createOption('def-1', { value: 'Хлопок' }, testContext());
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
    const prisma: any = { company, productSize: { findFirst: jest.fn(async () => null), create } };
    await new ProductAttributesService(prisma).createSize({ name_ru: '44', kind: 'SHOES', code: '' }, testContext());
    expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({ kind: 'SHOES', type: 'SHOES', code: 'S44' }) });
  });
});

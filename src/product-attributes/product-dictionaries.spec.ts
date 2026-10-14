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

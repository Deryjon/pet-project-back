import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ReceiptsService } from './receipts.service';

describe('ReceiptsService.getOrCreateForSale', () => {
  const sale = {
    id: 7,
    number: 'S-7',
    branchCode: null,
    user: null,
    client: null,
  };

  function build(createError: unknown) {
    const existing = { id: 'r1', saleId: 7, items: [] };
    const findUnique = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValue(existing);
    const create = jest.fn().mockRejectedValue(createError);
    const service = new ReceiptsService({
      receipt: { findUnique, create },
    } as never);
    const internals = service as unknown as Record<string, unknown>;
    internals.loadSaleForSnapshot = jest.fn().mockResolvedValue(sale);
    internals.buildSnapshot = jest.fn().mockResolvedValue({ items: [] });
    internals.getShopInfo = jest.fn().mockResolvedValue(null);
    internals.getCompanyLegalInfo = jest.fn().mockResolvedValue({});
    const assemble = jest.fn().mockReturnValue({ ok: true });
    internals.assembleResponse = assemble;
    return { service, existing, create, assemble, findUnique };
  }

  it('returns the receipt created by a concurrent request (P2002)', async () => {
    const conflict = new Prisma.PrismaClientKnownRequestError('dup', {
      code: 'P2002',
      clientVersion: 'test',
    });
    const { service, existing, create, assemble, findUnique } = build(conflict);
    await expect(service.getOrCreateForSale(7, 'c1')).resolves.toEqual({
      ok: true,
    });
    expect(assemble.mock.calls[0]).toContain(existing);
    expect(findUnique).toHaveBeenNthCalledWith(2, { where: { saleId: 7 } });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('rethrows other creation errors without re-reading', async () => {
    const logged = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const { service, findUnique } = build(new Error('db down'));
    await expect(service.getOrCreateForSale(7, 'c1')).rejects.toThrow(
      'db down',
    );
    expect(findUnique).toHaveBeenCalledTimes(1);
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });

  it('rethrows other Prisma error codes', async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const { service } = build(
      new Prisma.PrismaClientKnownRequestError('fk', {
        code: 'P2003',
        clientVersion: 'test',
      }),
    );
    await expect(service.getOrCreateForSale(7, 'c1')).rejects.toThrow('fk');
  });
});

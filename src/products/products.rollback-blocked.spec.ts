import { ConflictException } from '@nestjs/common';
import { ProductsService } from './products.service';

function createService() {
  const prisma = {
    stockMovement: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ productId: 1, variantId: null, quantity: 5 }]),
    },
    product: {
      findMany: jest.fn().mockResolvedValue([{ id: 1, name: 'Shirt' }]),
    },
    productStock: {
      findMany: jest.fn().mockResolvedValue([{ productId: 1, quantity: 2 }]),
    },
    $transaction: jest.fn(),
  };
  const service = new ProductsService(prisma as any, {} as any) as any;
  service.resolveImportSessionFromStore = jest.fn().mockResolvedValue({
    id: 'imp-1',
    status: 'completed',
    companyId: 'c1',
    shopId: 's1',
    branchCode: 'b1',
  });
  service.getRequestContext = jest.fn().mockResolvedValue({});
  service.requireCatalogWriteContext = jest.fn().mockReturnValue({});
  service.assertImportSessionAccess = jest.fn();
  return { service, prisma };
}

describe('ProductsService.rollbackImport with consumed stock', () => {
  it('rejects a real rollback with 409 and keeps blocked items in the body', async () => {
    const { service, prisma } = createService();

    const error = await service
      .rollbackImport('imp-1', {} as any)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConflictException);
    const body = (error as ConflictException).getResponse() as any;
    expect(body.statusCode).toBe(409);
    expect(body.can_rollback).toBe(false);
    expect(body.blocked_items).toHaveLength(1);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('keeps the dry-run preview informational (no throw)', async () => {
    const { service } = createService();

    const result = await service.rollbackImport('imp-1', {} as any, {
      dryRun: true,
    });

    expect(result.can_rollback).toBe(false);
    expect(result.blocked_items).toHaveLength(1);
  });
});

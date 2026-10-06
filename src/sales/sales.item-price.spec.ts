import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { companyContext } from '../../test/fixtures/request-context';
import { getPermissionIdsBySlug } from '../roles/roles.permissions';
import { SalesService } from './sales.service';

const MANUAL_DISCOUNT_IDS = getPermissionIdsBySlug('manual-discount');

function createService(options: {
  shopPrice?: number | null;
  grantedPermissionIds?: string[];
}) {
  const prisma = {
    product: {
      findFirst: jest.fn().mockResolvedValue({
        id: 5,
        name: 'Item',
        barcode: null,
        sku: null,
        quantity: 10,
        salePrice: 100,
        metadata: {},
        bundleComponents: [],
      }),
    },
    productVariant: { count: jest.fn().mockResolvedValue(0) },
    productStock: {
      findFirst: jest
        .fn()
        .mockResolvedValue(
          options.shopPrice === undefined
            ? null
            : { salePrice: options.shopPrice, quantity: 10 },
        ),
    },
    productVariantStock: { findFirst: jest.fn().mockResolvedValue(null) },
    role: { findFirst: jest.fn().mockResolvedValue({ isAdmin: false }) },
    rolePermission: {
      findMany: jest.fn().mockResolvedValue(
        (options.grantedPermissionIds ?? []).map((permissionId) => ({
          permissionId,
        })),
      ),
    },
  };
  const service = new SalesService(prisma as any, {} as any, {} as any);
  return { service, prisma };
}

const product = { id: 5, salePrice: 100, metadata: {} };

function check(service: SalesService, salePrice: number, item = product) {
  return (service as any).assertDraftItemSalePrice(
    salePrice,
    item,
    null,
    'B1',
    companyContext(),
  );
}

describe('SalesService draft item price', () => {
  it('accepts the shop retail price without extra rights', async () => {
    const { service } = createService({ shopPrice: 120 });

    await expect(check(service, 120)).resolves.toBeUndefined();
  });

  it('tolerates the POS rounding of fractional prices', async () => {
    const { service } = createService({ shopPrice: 119.6 });

    await expect(check(service, 120)).resolves.toBeUndefined();
  });

  it('rejects a changed price without the manual discount right', async () => {
    const { service } = createService({ shopPrice: 120 });

    await expect(check(service, 1)).rejects.toBeInstanceOf(ForbiddenException);
    // The company-wide price is not valid when the shop has its own price.
    await expect(check(service, 100)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('allows a changed price with the manual discount right', async () => {
    const { service } = createService({
      shopPrice: 120,
      grantedPermissionIds: MANUAL_DISCOUNT_IDS,
    });

    await expect(check(service, 90)).resolves.toBeUndefined();
  });

  it('allows any positive price for free-price products', async () => {
    const { service } = createService({ shopPrice: 120 });

    await expect(
      check(service, 15, { ...product, metadata: { free_price: true } }),
    ).resolves.toBeUndefined();
  });

  it('rejects negative prices even with the manual discount right', async () => {
    const { service } = createService({
      shopPrice: 120,
      grantedPermissionIds: MANUAL_DISCOUNT_IDS,
    });

    await expect(check(service, -50)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects non-positive quantities when adding an item', async () => {
    const { service } = createService({ shopPrice: 120 });

    await expect(
      service.addItem(
        1,
        { product_id: 5, quantity: -3, sale_price: 120 },
        companyContext(),
      ),
    ).rejects.toThrow('quantity must be greater than 0');
  });
});

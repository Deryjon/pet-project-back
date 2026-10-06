import { GUARDS_METADATA } from '@nestjs/common/constants';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { ANY_PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { PERMISSION_ALIASES } from '../auth/role-permissions';
import { getPermissionIdsBySlug } from '../roles/roles.permissions';
import { ReceiptsController } from './receipts.controller';
import { ReceiptsService } from './receipts.service';

const proto = ReceiptsController.prototype as unknown as Record<string, object>;

describe('Receipt access', () => {
  it.each(['getReceiptByNumber', 'getReceipt', 'createReceipt', 'markPrinted'])(
    '%s requires a sale or client right',
    (method) => {
      expect(Reflect.getMetadata(GUARDS_METADATA, proto[method])).toEqual(
        expect.arrayContaining([PermissionsGuard]),
      );
      const slugs = Reflect.getMetadata(ANY_PERMISSIONS_KEY, proto[method]) as
        | string[]
        | undefined;
      expect(slugs?.length).toBeGreaterThan(0);
      for (const slug of slugs ?? []) {
        const ids = (PERMISSION_ALIASES[slug] ?? [slug]).flatMap(
          getPermissionIdsBySlug,
        );
        expect(ids.length).toBeGreaterThan(0);
      }
    },
  );

  it('looks the sale up only in the shops the user may see', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const service = new ReceiptsService({ sale: { findFirst } } as never);
    await expect(
      service.getByNumber('S-1', 'company-1', ['B1']),
    ).rejects.toThrow('Sale not found');
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          number: 'S-1',
          companyId: 'company-1',
          branchCode: { in: ['B1'] },
        },
      }),
    );
  });
});

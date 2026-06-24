import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class WarehouseService {
  constructor(
    private readonly db: PrismaService,
    private readonly usersService: UsersService,
  ) {}

  async listMovements(
    type: string,
    query: Record<string, string>,
    auth?: string,
  ) {
    const context = auth
      ? await this.usersService.getRequestContext(auth)
      : null;
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(Math.max(1, Number(query.limit) || 10), 100);
    const search = query.search?.trim();

    const where: any = { type };
    if (context?.companyId) where.companyId = context.companyId;
    if (search) {
      where.product = {
        name: { contains: search, mode: 'insensitive' },
      };
    }

    const [items, total] = await Promise.all([
      this.db.stockMovement.findMany({
        where,
        include: {
          product: {
            select: { id: true, name: true, sku: true, barcode: true },
          },
          shop: { select: { id: true, name: true } },
          createdBy: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.db.stockMovement.count({ where }),
    ]);

    return {
      items: items.map((item) => ({
        id: item.id,
        name: item.product?.name ?? '',
        sku: item.product?.sku ?? '',
        barcode: item.product?.barcode ?? '',
        store: item.shop?.name ?? '',
        qty: Number(item.quantity),
        amount: Number(item.retailPrice) * Number(item.quantity),
        supplyPrice: Number(item.supplyPrice),
        retailPrice: Number(item.retailPrice),
        type: item.displayTypeLabel || item.type,
        status: 'completed',
        user: item.createdBy
          ? `${item.createdBy.firstName} ${item.createdBy.lastName}`.trim()
          : '',
        createdAt: item.createdAt.toISOString(),
        externalId: item.externalId,
      })),
      total,
      page,
      limit,
    };
  }

  async listRevaluations(query: Record<string, string>, auth?: string) {
    const context = auth
      ? await this.usersService.getRequestContext(auth)
      : null;
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(Math.max(1, Number(query.limit) || 10), 100);

    const where: any = {};
    if (context?.companyId) where.companyId = context.companyId;

    const [items, total] = await Promise.all([
      this.db.stockMovement.findMany({
        where,
        include: {
          product: { select: { id: true, name: true, sku: true } },
          shop: { select: { id: true, name: true } },
          createdBy: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.db.stockMovement.count({ where }),
    ]);

    return {
      items: items
        .filter(
          (item) =>
            Number(item.newRetailPrice) !== Number(item.fromRetailPrice),
        )
        .map((item) => ({
          id: item.id,
          name: item.product?.name ?? '',
          store: item.shop?.name ?? '',
          type: item.displayTypeLabel || 'Переоценка',
          qty: Number(item.quantity),
          oldPrice: Number(item.fromRetailPrice),
          newPrice: Number(item.newRetailPrice),
          status: 'completed',
          user: item.createdBy
            ? `${item.createdBy.firstName} ${item.createdBy.lastName}`.trim()
            : '',
          revaluatedAt: item.createdAt.toISOString(),
        })),
      total,
      page,
      limit,
    };
  }
}

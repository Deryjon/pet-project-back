import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CompanyRequestContext,
  requireCompanyContext,
} from '../../auth/request-context';
import { PrismaService } from '../../prisma/prisma.service';
import { ImportNormalizerService } from './import-normalizer.service';

@Injectable()
export class SupplierDirectoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly normalizer: ImportNormalizerService,
  ) {}
  private async company(requestContext: CompanyRequestContext) {
    const context = requireCompanyContext(requestContext);
    return context.companyId;
  }
  async list(requestContext: CompanyRequestContext) {
    const companyId = await this.company(requestContext);
    const suppliers = await this.prisma.supplier.findMany({
      where: { companyId },
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { products: true } },
      },
    });
    if (!suppliers.length) return [];
    const ids = suppliers.map((supplier) => supplier.id);
    // Purchases from both sources: committed invoices and received orders.
    const [invoices, orders] = await Promise.all([
      this.prisma.supplierInvoice.groupBy({
        by: ['supplierId'],
        where: { companyId, supplierId: { in: ids }, status: 'COMMITTED' },
        _sum: { totalAmount: true },
        _max: { committedAt: true },
      }),
      this.prisma.purchaseOrder.findMany({
        where: { companyId, supplierId: { in: ids }, status: { not: 'CANCELLED' } },
        select: {
          supplierId: true,
          status: true,
          receivedAt: true,
          updatedAt: true,
          items: { select: { receivedQuantity: true, supplyPrice: true } },
        },
      }),
    ]);
    const stats = new Map<number, { purchased: number; lastDelivery: Date | null; openOrders: number }>();
    const entry = (id: number) => {
      let value = stats.get(id);
      if (!value) {
        value = { purchased: 0, lastDelivery: null, openOrders: 0 };
        stats.set(id, value);
      }
      return value;
    };
    const later = (a: Date | null, b: Date | null) => (!a ? b : !b ? a : a > b ? a : b);
    for (const row of invoices) {
      const value = entry(row.supplierId);
      value.purchased += Number(row._sum.totalAmount ?? 0);
      value.lastDelivery = later(value.lastDelivery, row._max.committedAt);
    }
    for (const order of orders) {
      const value = entry(order.supplierId);
      const received = order.items.reduce(
        (sum, item) => sum + Number(item.receivedQuantity) * Number(item.supplyPrice),
        0,
      );
      value.purchased += received;
      if (received > 0) value.lastDelivery = later(value.lastDelivery, order.receivedAt ?? order.updatedAt);
      if (['DRAFT', 'SENT', 'PARTIAL'].includes(order.status)) value.openOrders += 1;
    }
    return suppliers.map(({ _count, ...supplier }) => {
      const value = stats.get(supplier.id);
      return {
        ...supplier,
        products_count: _count.products,
        open_orders_count: value?.openOrders ?? 0,
        purchased_amount: Math.round((value?.purchased ?? 0) * 100) / 100,
        last_delivery_at: value?.lastDelivery?.toISOString() ?? null,
      };
    });
  }
  async get(id: number, requestContext: CompanyRequestContext) {
    const companyId = await this.company(requestContext);
    const supplier = await this.prisma.supplier.findFirst({
      where: { id, companyId },
    });
    if (!supplier) throw new NotFoundException('Supplier not found');
    return supplier;
  }
  async create(body: any, requestContext: CompanyRequestContext) {
    const companyId = await this.company(requestContext);
    const name = String(body.name || '').trim();
    if (!name) throw new BadRequestException('Укажите название поставщика');
    return this.withUniqueName(() =>
      this.prisma.supplier.create({
        data: {
          companyId,
          name,
          phone: this.text(body.phone),
          telegram: this.text(body.telegram),
          comment: this.text(body.comment),
          isActive: body.isActive !== false,
        },
      }),
    );
  }

  private text(value: unknown) {
    const text = String(value ?? '').trim();
    return text || null;
  }

  private async withUniqueName<T>(operation: () => Promise<T>) {
    try {
      return await operation();
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new ConflictException('Поставщик с таким названием уже есть');
      }
      throw error;
    }
  }
  async update(id: number, body: any, requestContext: CompanyRequestContext) {
    await this.get(id, requestContext);
    const data: any = {};
    if (body.name !== undefined) {
      const name = String(body.name || '').trim();
      if (!name) throw new BadRequestException('Укажите название поставщика');
      data.name = name;
    }
    for (const key of ['phone', 'telegram', 'comment'])
      if (body[key] !== undefined) data[key] = this.text(body[key]);
    if (body.isActive !== undefined) data.isActive = body.isActive !== false;
    return this.withUniqueName(() => this.prisma.supplier.update({ where: { id }, data }));
  }
  async aliases(id: number, requestContext: CompanyRequestContext) {
    const companyId = await this.company(requestContext);
    await this.get(id, requestContext);
    return this.prisma.supplierProductAlias.findMany({
      where: { companyId, supplierId: id, product: { companyId } },
      include: { product: true },
      orderBy: { updatedAt: 'desc' },
    });
  }
  async createAlias(
    id: number,
    body: any,
    requestContext: CompanyRequestContext,
  ) {
    const companyId = await this.company(requestContext);
    await this.get(id, requestContext);
    const product = await this.prisma.product.findFirst({
      where: { id: Number(body.productId), companyId },
    });
    if (!product) throw new NotFoundException('Product not found');
    const supplierName = String(body.supplierName || '').trim();
    if (!supplierName)
      throw new BadRequestException('supplierName is required');
    return this.prisma.supplierProductAlias.create({
      data: {
        companyId,
        supplierId: id,
        productId: product.id,
        supplierName,
        normalizedName: this.normalizer.normalize(supplierName),
        supplierSku: body.supplierSku || null,
        supplierBarcode: body.supplierBarcode || null,
      },
    });
  }
  async updateAlias(
    id: number,
    aliasId: string,
    body: any,
    requestContext: CompanyRequestContext,
  ) {
    const companyId = await this.company(requestContext);
    const alias = await this.prisma.supplierProductAlias.findFirst({
      where: { id: aliasId, supplierId: id, companyId },
    });
    if (!alias) throw new NotFoundException('Alias not found');
    if (body.productId !== undefined) {
      const productId = Number(body.productId);
      if (!Number.isInteger(productId) || productId <= 0)
        throw new BadRequestException('productId is invalid');
      const product = await this.prisma.product.findFirst({
        where: { id: productId, companyId },
        select: { id: true },
      });
      if (!product) throw new NotFoundException('Product not found');
    }
    return this.prisma.supplierProductAlias.update({
      where: { id: aliasId },
      data: {
        ...(body.productId !== undefined
          ? { productId: Number(body.productId) }
          : {}),
        ...(body.supplierName !== undefined
          ? {
              supplierName: String(body.supplierName),
              normalizedName: this.normalizer.normalize(body.supplierName),
            }
          : {}),
        ...(body.supplierSku !== undefined
          ? { supplierSku: body.supplierSku || null }
          : {}),
        ...(body.supplierBarcode !== undefined
          ? { supplierBarcode: body.supplierBarcode || null }
          : {}),
      },
    });
  }
  async deleteAlias(
    id: number,
    aliasId: string,
    requestContext: CompanyRequestContext,
  ) {
    const companyId = await this.company(requestContext);
    const result = await this.prisma.supplierProductAlias.deleteMany({
      where: { id: aliasId, supplierId: id, companyId },
    });
    if (!result.count) throw new NotFoundException('Alias not found');
    return { deleted: true };
  }
}

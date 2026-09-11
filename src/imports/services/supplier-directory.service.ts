import {
  BadRequestException,
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
    return this.prisma.supplier.findMany({
      where: { companyId },
      orderBy: { name: 'asc' },
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
    if (!name) throw new BadRequestException('name is required');
    return this.prisma.supplier.create({
      data: {
        companyId,
        name,
        phone: body.phone || null,
        telegram: body.telegram || null,
        comment: body.comment || null,
        isActive: body.isActive !== false,
      },
    });
  }
  async update(id: number, body: any, requestContext: CompanyRequestContext) {
    await this.get(id, requestContext);
    const data: any = {};
    for (const key of ['name', 'phone', 'telegram', 'comment', 'isActive'])
      if (body[key] !== undefined) data[key] = body[key];
    return this.prisma.supplier.update({ where: { id }, data });
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

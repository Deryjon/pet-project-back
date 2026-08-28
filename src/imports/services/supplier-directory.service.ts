import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UsersService } from '../../users/users.service';
import { ImportNormalizerService } from './import-normalizer.service';

@Injectable()
export class SupplierDirectoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly normalizer: ImportNormalizerService,
  ) {}
  private async company(auth?: string) {
    const context = await this.users.getRequestContext(auth);
    if (!context.companyId)
      throw new ForbiddenException('Company context required');
    return context.companyId;
  }
  async list(auth?: string) {
    const companyId = await this.company(auth);
    return this.prisma.supplier.findMany({
      where: { companyId },
      orderBy: { name: 'asc' },
    });
  }
  async get(id: number, auth?: string) {
    const companyId = await this.company(auth);
    const supplier = await this.prisma.supplier.findFirst({
      where: { id, companyId },
    });
    if (!supplier) throw new NotFoundException('Supplier not found');
    return supplier;
  }
  async create(body: any, auth?: string) {
    const companyId = await this.company(auth);
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
  async update(id: number, body: any, auth?: string) {
    await this.get(id, auth);
    const data: any = {};
    for (const key of ['name', 'phone', 'telegram', 'comment', 'isActive'])
      if (body[key] !== undefined) data[key] = body[key];
    return this.prisma.supplier.update({ where: { id }, data });
  }
  async aliases(id: number, auth?: string) {
    const companyId = await this.company(auth);
    await this.get(id, auth);
    return this.prisma.supplierProductAlias.findMany({
      where: { companyId, supplierId: id },
      include: { product: true },
      orderBy: { updatedAt: 'desc' },
    });
  }
  async createAlias(id: number, body: any, auth?: string) {
    const companyId = await this.company(auth);
    await this.get(id, auth);
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
  async updateAlias(id: number, aliasId: string, body: any, auth?: string) {
    const companyId = await this.company(auth);
    const alias = await this.prisma.supplierProductAlias.findFirst({
      where: { id: aliasId, supplierId: id, companyId },
    });
    if (!alias) throw new NotFoundException('Alias not found');
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
  async deleteAlias(id: number, aliasId: string, auth?: string) {
    const companyId = await this.company(auth);
    const result = await this.prisma.supplierProductAlias.deleteMany({
      where: { id: aliasId, supplierId: id, companyId },
    });
    if (!result.count) throw new NotFoundException('Alias not found');
    return { deleted: true };
  }
}

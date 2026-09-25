import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CompanyRequestContext, requireCompanyContext } from '../auth/request-context';
import { runSerializableTransaction } from '../common/serializable-transaction';
import { PrismaService } from '../prisma/prisma.service';

const MANAGERS = ['админ', 'admin', 'управляющий магазина', 'store manager', 'manager'];
const ACTIVE = ['COUNTING', 'REVIEW', 'RECOUNT_REQUIRED'];

@Injectable()
export class WarehouseService {
  constructor(private readonly db: PrismaService) {}
  private ctx(value: CompanyRequestContext) { return requireCompanyContext(value); }
  private scope(c: { companyId: string; allowedShopIds: string[] }) { return { companyId: c.companyId, shopId: { in: c.allowedShopIds } }; }
  private isManager(c: CompanyRequestContext) { return [c.role, c.crmRoleName, c.crmRoleId].some((v) => MANAGERS.includes(String(v || '').trim().toLowerCase())); }
  private manager(c: CompanyRequestContext) { if (!this.isManager(c)) throw new ForbiddenException('Only Admin or Store Manager can perform this action'); }
  private responsibleIds(session: { responsibleUserIds?: unknown }) { return Array.isArray(session.responsibleUserIds) ? session.responsibleUserIds.map(Number).filter(Number.isInteger) : []; }
  private assigned(c: CompanyRequestContext, session: { responsibleUserIds?: unknown }) { if (!this.isManager(c) && !this.responsibleIds(session).includes(c.userId)) throw new ForbiddenException('You are not assigned to this inventory'); }
  private status(d: number) { return d < 0 ? 'SHORTAGE' : d > 0 ? 'SURPLUS' : 'MATCHED'; }
  private async canonicalInventoryItems(client: any, items: any[]) {
    const variantIds = items.map((item) => item.variantId).filter(Boolean);
    if (!variantIds.length) return items;
    const variants = await client.productVariant.findMany({ where: { id: { in: variantIds } }, select: { id: true, productId: true, isDefault: true } });
    const productsWithRealVariants = new Set(variants.filter((variant: any) => !variant.isDefault).map((variant: any) => variant.productId));
    const ignoredDefaultIds = new Set(variants.filter((variant: any) => variant.isDefault && productsWithRealVariants.has(variant.productId)).map((variant: any) => variant.id));
    const productsWithVariantRows = new Set(items.filter((item) => item.variantId && !ignoredDefaultIds.has(item.variantId)).map((item) => item.productId));
    return items.filter((item) => !ignoredDefaultIds.has(item.variantId) && (item.variantId || !productsWithVariantRows.has(item.productId)));
  }
  private version(current: number, supplied: unknown) { if (supplied !== undefined && Number(supplied) !== current) throw new ConflictException('Document was changed by another user'); }
  private audit(tx: any, c: CompanyRequestContext, action: string, id: string, meta?: object) { return tx.auditLog.create({ data: { companyId: c.companyId, userId: c.userId, action, entity: 'InventorySession', entityId: id, meta } }); }

  async listMovements(type: string, query: Record<string, string>, requestContext: CompanyRequestContext) {
    const c = this.ctx(requestContext), page = Math.max(1, +query.page || 1), limit = Math.min(100, Math.max(1, +query.limit || 10));
    const where: any = { type, ...this.scope(c) };
    if (query.search?.trim()) where.product = { name: { contains: query.search.trim(), mode: 'insensitive' } };
    const [items, total] = await Promise.all([this.db.stockMovement.findMany({ where, include: { product: true, shop: true, createdBy: true }, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }), this.db.stockMovement.count({ where })]);
    return { items: items.map((i) => ({ id: i.id, name: i.product.name, sku: i.product.sku || '', barcode: i.product.barcode || '', store: i.shop.name, qty: Number(i.quantity), amount: Number(i.retailPrice) * Number(i.quantity), supplyPrice: Number(i.supplyPrice), retailPrice: Number(i.retailPrice), type: i.displayTypeLabel || i.type, status: 'completed', user: `${i.createdBy.firstName} ${i.createdBy.lastName}`.trim(), createdAt: i.createdAt.toISOString(), externalId: i.externalId })), total, page, limit };
  }

  async listRevaluations(query: Record<string, string>, requestContext: CompanyRequestContext) {
    const c = this.ctx(requestContext), page = Math.max(1, +query.page || 1), limit = Math.min(100, Math.max(1, +query.limit || 10));
    const where: any = { ...this.scope(c), newRetailPrice: { not: this.db.stockMovement.fields.fromRetailPrice } };
    const [items, total] = await Promise.all([this.db.stockMovement.findMany({ where, include: { product: true, shop: true, createdBy: true }, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }), this.db.stockMovement.count({ where })]);
    return { items: items.map((i) => ({ id: i.id, name: i.product.name, store: i.shop.name, type: i.displayTypeLabel || 'Переоценка', qty: Number(i.quantity), oldPrice: Number(i.fromRetailPrice), newPrice: Number(i.newRetailPrice), status: 'completed', user: `${i.createdBy.firstName} ${i.createdBy.lastName}`.trim(), revaluatedAt: i.createdAt.toISOString() })), total, page, limit };
  }

  async listInventorySessions(query: Record<string, string>, requestContext: CompanyRequestContext) {
    const c = this.ctx(requestContext), page = Math.max(1, +query.page || 1), limit = Math.min(100, Math.max(1, +query.limit || 10));
    const where: any = { ...this.scope(c), ...(!this.isManager(c) ? { responsibleUserIds: { array_contains: c.userId } } : {}) };
    if (query.status) where.status = query.status.toUpperCase(); if (query.type) where.type = query.type.toUpperCase();
    if (query.shop_id) where.shopId = c.allowedShopIds.includes(query.shop_id) ? query.shop_id : '__denied__';
    const [rows, total] = await Promise.all([this.db.inventorySession.findMany({ where, include: { shop: true, createdBy: true, closedBy: true, items: { select: { status: true, differenceAmount: true } } }, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }), this.db.inventorySession.count({ where })]);
    return { items: rows.map((s) => ({ id: s.id, number: s.number, name: s.name, store: s.shop.name, shopId: s.shopId, type: s.type, status: s.status, comment: s.comment, progress: s.items.length ? Math.round(s.items.filter((i) => i.status !== 'NOT_COUNTED').length * 100 / s.items.length) : 0, itemsCount: s.items.length, differencesCount: s.items.filter((i) => ['SHORTAGE', 'SURPLUS', 'RECOUNT_REQUIRED'].includes(i.status)).length, differenceAmount: s.items.reduce((n, i) => n + Number(i.differenceAmount || 0), 0), createdBy: `${s.createdBy.firstName} ${s.createdBy.lastName}`.trim(), closedBy: s.closedBy ? `${s.closedBy.firstName} ${s.closedBy.lastName}`.trim() : '', createdAt: s.createdAt, startedAt: s.startedAt, closedAt: s.closedAt })), total, page, limit };
  }

  private emptyMovementSummary() { return { purchaseUnits: 0, purchaseAmount: 0, saleUnits: 0, saleAmount: 0, returnUnits: 0, returnAmount: 0, writeOffUnits: 0, transferInUnits: 0, transferOutUnits: 0, adjustmentUnits: 0, netUnits: 0 }; }
  private movementKey(productId: number, variantId?: string | null) { return `${productId}:${variantId || ''}`; }
  private movementSummaries(movements: any[], shopId: string) {
    const result = new Map<string, ReturnType<WarehouseService['emptyMovementSummary']>>();
    for (const movement of movements) {
      const key = this.movementKey(movement.productId, movement.variantId), summary = result.get(key) || this.emptyMovementSummary();
      const raw = Number(movement.quantity), units = Math.abs(raw), supplyAmount = units * Number(movement.supplyPrice || 0), retailAmount = units * Number(movement.retailPrice || 0);
      if (movement.type === 'PURCHASE') { summary.purchaseUnits += units; summary.purchaseAmount += supplyAmount; summary.netUnits += units; }
      else if (movement.type === 'SALE') { summary.saleUnits += units; summary.saleAmount += retailAmount; summary.netUnits -= units; }
      else if (movement.type === 'RETURN') { summary.returnUnits += units; summary.returnAmount += retailAmount; summary.netUnits += units; }
      else if (movement.type === 'WRITE_OFF') { summary.writeOffUnits += units; summary.netUnits -= units; }
      else if (movement.type === 'TRANSFER') { if (movement.toShopId === shopId) { summary.transferInUnits += units; summary.netUnits += units; } else { summary.transferOutUnits += units; summary.netUnits -= units; } }
      else if (movement.type !== 'INVENTORY_ADJUSTMENT') { summary.adjustmentUnits += raw; summary.netUnits += raw; }
      result.set(key, summary);
    }
    return result;
  }

  private mapItem(i: any, blind = false, movementSummary?: ReturnType<WarehouseService['emptyMovementSummary']>) {
    const variant = [i.variant?.color?.name, i.variant?.size?.name].filter(Boolean).join(' / ');
    const out: any = { id: i.id, productId: i.productId, variantId: i.variantId, isDefaultVariant: Boolean(i.variant?.isDefault), productName: `${i.product?.name || ''}${variant ? ` — ${variant}` : ''}`, sku: i.sku || '', barcode: i.barcode || '', countedQuantity: i.countedQuantity, actualQuantity: i.countedQuantity, status: i.status, note: i.note, reasonCode: i.reasonCode, countedAt: i.countedAt, countedBy: i.countedBy, version: i.version, attemptsCount: i._count?.attempts ?? i.attempts?.length ?? 0 };
    if (!blind) Object.assign(out, { systemQuantitySnapshot: i.systemQuantitySnapshot, expectedQuantity: i.expectedQuantityAtCount ?? i.systemQuantitySnapshot, expectedQuantityAtCount: i.expectedQuantityAtCount, difference: i.differenceQuantity, differenceQuantity: i.differenceQuantity, adjustmentDelta: i.adjustmentDelta, costPriceSnapshot: i.costPriceSnapshot, differenceAmount: i.differenceAmount, movementSummary: movementSummary || this.emptyMovementSummary() });
    return out;
  }

  async getInventorySession(id: string, requestContext: CompanyRequestContext) {
    const c = this.ctx(requestContext), s: any = await this.db.inventorySession.findFirst({ where: { id, ...this.scope(c) }, include: { shop: true, createdBy: true, items: { include: { product: true, variant: { include: { color: true, size: true } }, countedBy: { select: { id: true, firstName: true, lastName: true } }, _count: { select: { attempts: true } } }, orderBy: { createdAt: 'asc' } } } });
    if (!s) throw new NotFoundException('Inventory session not found');
    this.assigned(c, s);
    const blind = s.countMode === 'BLIND' && !this.isManager(c) && ['COUNTING', 'RECOUNT_REQUIRED'].includes(s.status);
    const movements = blind || !s.snapshotAt ? [] : await this.db.stockMovement.findMany({ where: { companyId: c.companyId, shopId: s.shopId, createdAt: { gt: s.snapshotAt, lte: s.closedAt || new Date() }, type: { not: 'INVENTORY_ADJUSTMENT' } }, select: { productId: true, variantId: true, type: true, quantity: true, fromShopId: true, toShopId: true, supplyPrice: true, retailPrice: true } });
    const summaries = this.movementSummaries(movements, s.shopId);
    const inventoryKeys = new Set<string>(s.items.map((i: any) => this.movementKey(i.productId, i.variantId)));
    const movementTotals = this.emptyMovementSummary();
    for (const key of inventoryKeys) { const row = summaries.get(key); if (row) for (const field of Object.keys(movementTotals) as Array<keyof typeof movementTotals>) movementTotals[field] += row[field]; }
    return { ...s, blind, movementTotals, items: s.items.map((i: any) => this.mapItem(i, blind, summaries.get(this.movementKey(i.productId, i.variantId)))) };
  }

  async createInventorySession(body: Record<string, unknown>, requestContext: CompanyRequestContext) {
    const c = this.ctx(requestContext), shopId = String(body.shop_id || '').trim(); this.manager(c); if (!shopId) throw new BadRequestException('shop_id required');
    if (!c.allowedShopIds.includes(shopId)) throw new ForbiddenException('Shop is not available');
    const shop = await this.db.shop.findFirst({ where: { id: shopId, companyId: c.companyId } }); if (!shop) throw new NotFoundException('Shop not found');
    const type = String(body.type || 'FULL').toUpperCase(), countMode = String(body.count_mode || 'BLIND').toUpperCase();
    if (!['FULL', 'PARTIAL'].includes(type) || !['BLIND', 'VISIBLE'].includes(countMode)) throw new BadRequestException('Invalid inventory type or count mode');
    const responsibleIds = Array.isArray(body.responsible_user_ids) ? [...new Set(body.responsible_user_ids.map(Number).filter(Number.isInteger))] : [];
    if (responsibleIds.length) { const valid = await this.db.user.count({ where: { id: { in: responsibleIds }, companyId: c.companyId, isActive: true, OR: [{ currentShopId: shopId }, { shopAccesses: { some: { shopId } } }] } }); if (valid !== responsibleIds.length) throw new BadRequestException('One or more responsible users cannot access this shop'); }
    const prefix = `INV-${shop.branchCode}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-`; let s: any;
    for (let attempt = 0; attempt < 3; attempt++) { const seq = await this.db.inventorySession.count({ where: { companyId: c.companyId, number: { startsWith: prefix } } }), number = `${prefix}${String(seq + 1).padStart(4, '0')}`; try { s = await this.db.inventorySession.create({ data: { companyId: c.companyId, shopId, number, name: String(body.name || number).trim(), type, countMode, lockStockOperations: Boolean(body.lock_stock_operations), scopeJson: body.scope as Prisma.InputJsonValue | undefined, responsibleUserIds: responsibleIds as Prisma.InputJsonValue, comment: String(body.comment || '').trim(), createdById: c.userId }, include: { shop: true } }); break; } catch (error) { if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002' || attempt === 2) throw error; } }
    const number = s.number;
    await this.audit(this.db, c, 'inventory.created', s.id, { number, shopId, type }); return { id: s.id, number, name: s.name, store: s.shop.name, status: s.status, version: s.version };
  }

  async updateInventorySession(id: string, body: Record<string, unknown>, requestContext: CompanyRequestContext) {
    const c = this.ctx(requestContext), s = await this.db.inventorySession.findFirst({ where: { id, ...this.scope(c) } }); this.manager(c); if (!s) throw new NotFoundException('Session not found'); if (s.status !== 'DRAFT') throw new BadRequestException('Only draft inventory can be edited'); this.version(s.version, body.version);
    const result = await this.db.inventorySession.updateMany({ where: { id, version: s.version }, data: { name: body.name === undefined ? undefined : String(body.name).trim(), type: body.type === undefined ? undefined : String(body.type).toUpperCase(), countMode: body.count_mode === undefined ? undefined : String(body.count_mode).toUpperCase(), lockStockOperations: body.lock_stock_operations === undefined ? undefined : Boolean(body.lock_stock_operations), scopeJson: body.scope === undefined ? undefined : body.scope as Prisma.InputJsonValue, responsibleUserIds: body.responsible_user_ids === undefined ? undefined : body.responsible_user_ids as Prisma.InputJsonValue, comment: body.comment === undefined ? undefined : String(body.comment).trim(), version: { increment: 1 } } });
    if (result.count !== 1) throw new ConflictException('Document was changed by another user'); return this.getInventorySession(id, c);
  }

  private productScope(s: any) {
    if (s.type !== 'PARTIAL') return {}; const scope: any = s.scopeJson || {}, OR: any[] = [];
    if (scope.product_ids?.length) OR.push({ id: { in: scope.product_ids.map(Number) } }); if (scope.variant_ids?.length) OR.push({ variants: { some: { id: { in: scope.variant_ids.map(String) }, isActive: true } } }); if (scope.category_ids?.length) OR.push({ categoryId: { in: scope.category_ids.map(Number) } }); if (scope.brand_ids?.length) OR.push({ brandId: { in: scope.brand_ids.map(Number) } }); return OR.length ? { OR } : { id: -1 };
  }

  async startInventory(id: string, body: Record<string, unknown>, requestContext: CompanyRequestContext) {
    const c = this.ctx(requestContext); this.manager(c);
    return runSerializableTransaction(this.db, async (tx) => {
      const s: any = await tx.inventorySession.findFirst({ where: { id, ...this.scope(c) }, include: { shop: true } }); if (!s) throw new NotFoundException('Session not found'); if (s.status !== 'DRAFT') throw new BadRequestException('Only draft inventory can be started'); this.version(s.version, body.version);
      if (await tx.inventorySession.findFirst({ where: { shopId: s.shopId, status: { in: ACTIVE }, ...(s.type === 'FULL' ? {} : { type: 'FULL' }) } })) throw new ConflictException('This shop already has an active inventory');
      const scope = s.scopeJson || {}; const onlyVariants = Array.isArray(scope.variant_ids) && scope.variant_ids.length && !scope.product_ids?.length && !scope.category_ids?.length && !scope.brand_ids?.length;
      const variantIds = s.type === 'PARTIAL' && onlyVariants ? scope.variant_ids.map(String) : undefined;
      const products = await tx.product.findMany({ where: { companyId: c.companyId, archivedAt: null, ...this.productScope(s) }, include: { variants: { where: { isActive: true, ...(variantIds ? { id: { in: variantIds } } : {}) }, include: { stocks: { where: { shopId: s.shopId } } } }, stocks: { where: { shopId: s.shopId } } } });
      const rows: any[] = [];
      for (const p of products) { const inventoryVariants = p.variants.some((v: any) => !v.isDefault) ? p.variants.filter((v: any) => !v.isDefault) : p.variants; if (inventoryVariants.length) for (const v of inventoryVariants) { const stock = v.stocks[0]; if (+stock?.quantity || s.type === 'PARTIAL') rows.push({ inventorySessionId: id, productId: p.id, variantId: v.id, sku: v.sku || p.sku, barcode: v.barcode || p.barcode, systemQuantitySnapshot: +(stock?.quantity || 0), costPriceSnapshot: +(stock?.purchasePrice ?? v.purchasePrice ?? p.purchasePrice ?? 0) }); } else { const stock = p.stocks[0]; if (+stock?.quantity || s.type === 'PARTIAL') rows.push({ inventorySessionId: id, productId: p.id, sku: p.sku, barcode: p.barcode, systemQuantitySnapshot: +(stock?.quantity || 0), costPriceSnapshot: +(stock?.purchasePrice ?? p.purchasePrice ?? 0) }); } }
      if (s.type === 'PARTIAL' && rows.length && await tx.inventoryItem.findFirst({ where: { session: { shopId: s.shopId, status: { in: ACTIVE } }, OR: rows.map((r) => ({ productId: r.productId, variantId: r.variantId ?? null })) } })) throw new ConflictException('Partial inventory overlaps an active inventory');
      if (rows.length) await tx.inventoryItem.createMany({ data: rows, skipDuplicates: true }); const now = new Date();
      const claim = await tx.inventorySession.updateMany({ where: { id, status: 'DRAFT', version: s.version }, data: { status: 'COUNTING', snapshotAt: now, startedAt: now, startedById: c.userId, version: { increment: 1 } } }); if (claim.count !== 1) throw new ConflictException('Inventory status changed'); await this.audit(tx, c, 'inventory.started', id, { positions: rows.length }); return { id, status: 'COUNTING', positions: rows.length };
    });
  }

  async addInventoryItem(sessionId: string, body: Record<string, unknown>, requestContext: CompanyRequestContext) {
    const c = this.ctx(requestContext), s: any = await this.db.inventorySession.findFirst({ where: { id: sessionId, ...this.scope(c), status: { in: ['COUNTING', 'RECOUNT_REQUIRED'] } }, include: { shop: true } }); if (!s) throw new NotFoundException('Active inventory not found'); this.assigned(c, s);
    const productId = Number(body.product_id); let variantId = String(body.variant_id || '').trim() || null; if (!Number.isInteger(productId) || productId <= 0) throw new BadRequestException('product_id is invalid');
    const product: any = await this.db.product.findFirst({ where: { id: productId, companyId: c.companyId, archivedAt: null }, include: { variants: { where: { companyId: c.companyId, isActive: true } } } });
    if (!product) throw new NotFoundException('Product not found');
    if (!variantId && product.variants.length === 1) variantId = product.variants[0].id;
    if (!variantId && product.variants.length > 1) throw new BadRequestException('Выберите вариант товара');
    const variant = variantId ? product.variants.find((entry: any) => entry.id === variantId) : null; if (variantId && !variant) throw new NotFoundException('Product variant not found');
    const stock: any = variantId ? await this.db.productVariantStock.findUnique({ where: { variantId_shopId: { variantId, shopId: s.shopId } } }) : await this.db.productStock.findUnique({ where: { productId_shopId: { productId, shopId: s.shopId } } });
    const include = { product: true, variant: { include: { color: true, size: true } }, _count: { select: { attempts: true } } } as const;
    let item: any = await this.db.inventoryItem.findFirst({ where: { inventorySessionId: sessionId, productId, variantId }, include });
    if (!item) { this.manager(c); item = await this.db.inventoryItem.create({ data: { inventorySessionId: sessionId, productId, variantId, sku: variant?.sku || product.sku, barcode: variant?.barcode || product.barcode, systemQuantitySnapshot: +(stock?.quantity || 0), costPriceSnapshot: +(stock?.purchasePrice ?? variant?.purchasePrice ?? product.purchasePrice ?? 0) }, include }); }
    if (body.actual_quantity !== undefined || body.counted_quantity !== undefined) return this.countInventoryItem(sessionId, item.id, body, c); return this.mapItem(item, s.countMode === 'BLIND' && !this.isManager(c));
  }

  async countInventoryItem(sessionId: string, itemId: string, body: Record<string, unknown>, requestContext: CompanyRequestContext) {
    const c = this.ctx(requestContext), quantity = Number(body.counted_quantity ?? body.actual_quantity); if (!Number.isFinite(quantity) || quantity < 0) throw new BadRequestException('counted_quantity is invalid');
    return runSerializableTransaction(this.db, async (tx) => {
      const s: any = await tx.inventorySession.findFirst({ where: { id: sessionId, ...this.scope(c), status: { in: ['COUNTING', 'RECOUNT_REQUIRED'] } } }); if (!s) throw new NotFoundException('Active inventory not found'); this.assigned(c, s);
      const i: any = await tx.inventoryItem.findFirst({ where: { id: itemId, inventorySessionId: sessionId }, include: { attempts: { orderBy: { attemptNumber: 'desc' }, take: 1 } } }); if (!i) throw new NotFoundException('Inventory item not found'); this.version(i.version, body.version); const now = new Date();
      const movements = await tx.stockMovement.findMany({ where: { companyId: c.companyId, shopId: s.shopId, productId: i.productId, variantId: i.variantId, createdAt: { gt: s.snapshotAt, lte: now } }, select: { type: true, quantity: true, fromShopId: true, toShopId: true } });
      const movementDelta = movements.reduce((sum: number, m: any) => { const q = Math.abs(Number(m.quantity)); if (['SALE', 'WRITE_OFF'].includes(m.type)) return sum - q; if (['RETURN', 'PURCHASE'].includes(m.type)) return sum + q; if (m.type === 'TRANSFER') return sum + (m.toShopId === s.shopId ? q : -q); return sum + Number(m.quantity); }, 0);
      const expected = i.systemQuantitySnapshot + movementDelta, difference = quantity - expected, attempt = (i.attempts[0]?.attemptNumber || 0) + 1;
      await tx.inventoryCountAttempt.updateMany({ where: { inventoryItemId: itemId, isFinal: true }, data: { isFinal: false } }); await tx.inventoryCountAttempt.create({ data: { inventoryItemId: itemId, attemptNumber: attempt, countedQuantity: quantity, countedById: c.userId, countedAt: now, note: String(body.note || '').trim() || null } });
      const updated = await tx.inventoryItem.update({ where: { id: itemId }, data: { countedQuantity: quantity, expectedQuantityAtCount: expected, differenceQuantity: difference, adjustmentDelta: difference, differenceAmount: difference * i.costPriceSnapshot, status: this.status(difference), note: String(body.note || '').trim() || null, countedById: c.userId, countedAt: now, version: { increment: 1 } }, include: { product: true, variant: { include: { color: true, size: true } }, _count: { select: { attempts: true } } } }); await this.audit(tx, c, 'inventory.item_counted', sessionId, { itemId, quantity, attempt }); return this.mapItem(updated, s.countMode === 'BLIND' && !this.isManager(c));
    });
  }

  async scanInventory(id: string, body: Record<string, unknown>, requestContext: CompanyRequestContext) {
    const c = this.ctx(requestContext), code = String(body.barcode || body.code || '').trim(); if (!code) throw new BadRequestException('Barcode is required');
    const session = await this.db.inventorySession.findFirst({ where: { id, ...this.scope(c), status: { in: ['COUNTING', 'RECOUNT_REQUIRED'] } } }); if (!session) throw new NotFoundException('Active inventory not found'); this.assigned(c, session);
    const [variants, products] = await Promise.all([this.db.productVariant.findMany({ where: { companyId: c.companyId, isActive: true, OR: [{ barcode: code }, { sku: code }] }, include: { product: true, color: true, size: true }, take: 20 }), this.db.product.findMany({ where: { companyId: c.companyId, archivedAt: null, variants: { none: { isActive: true } }, OR: [{ barcode: code }, { sku: code }, { article: code }] }, take: 20 })]);
    const matches = [...variants.map((v) => ({ product_id: v.productId, variant_id: v.id, name: `${v.product.name} — ${[v.color?.name, v.size?.name].filter(Boolean).join(' / ')}`, barcode: v.barcode, sku: v.sku })), ...products.map((p) => ({ product_id: p.id, variant_id: null, name: p.name, barcode: p.barcode, sku: p.sku }))]; if (!matches.length) throw new NotFoundException('Barcode not found'); if (matches.length > 1) return { multiple: true, matches }; return { multiple: false, item: await this.addInventoryItem(id, matches[0], c) };
  }

  async listInventoryItems(id: string, query: Record<string, string>, requestContext: CompanyRequestContext) {
    const c = this.ctx(requestContext), s = await this.db.inventorySession.findFirst({ where: { id, ...this.scope(c) } }); if (!s) throw new NotFoundException('Session not found'); this.assigned(c, s); const page = Math.max(1, +query.page || 1), limit = Math.min(100, Math.max(1, +query.limit || 50)), where: any = { inventorySessionId: id };
    if (query.status) where.status = query.status; if (query.uncounted === 'true') where.status = 'NOT_COUNTED'; if (query.discrepancies === 'true') where.status = { in: ['SHORTAGE', 'SURPLUS', 'RECOUNT_REQUIRED'] }; if (query.search) where.OR = [{ sku: { contains: query.search, mode: 'insensitive' } }, { barcode: { contains: query.search, mode: 'insensitive' } }, { product: { name: { contains: query.search, mode: 'insensitive' } } }];
    const [items, total] = await Promise.all([this.db.inventoryItem.findMany({ where, include: { product: true, variant: { include: { color: true, size: true } }, countedBy: { select: { id: true, firstName: true, lastName: true } }, _count: { select: { attempts: true } } }, orderBy: { createdAt: 'asc' }, skip: (page - 1) * limit, take: limit }), this.db.inventoryItem.count({ where })]); return { items: items.map((i) => this.mapItem(i, s.countMode === 'BLIND' && !this.isManager(c) && ACTIVE.includes(s.status))), total, page, limit };
  }

  async summary(id: string, requestContext: CompanyRequestContext) {
    const c = this.ctx(requestContext), session = await this.db.inventorySession.findFirst({ where: { id, ...this.scope(c) } }); if (!session) throw new NotFoundException('Session not found'); this.assigned(c, session); const items = await this.db.inventoryItem.findMany({ where: { inventorySessionId: id }, select: { status: true, differenceAmount: true } }), count = (s: string) => items.filter((i) => i.status === s).length, shortageAmount = items.filter((i) => +(i.differenceAmount || 0) < 0).reduce((n, i) => n + Math.abs(+(i.differenceAmount || 0)), 0), surplusAmount = items.filter((i) => +(i.differenceAmount || 0) > 0).reduce((n, i) => n + +(i.differenceAmount || 0), 0); return { total: items.length, counted: items.length - count('NOT_COUNTED'), uncounted: count('NOT_COUNTED'), matched: count('MATCHED') + count('APPROVED'), shortage: count('SHORTAGE'), surplus: count('SURPLUS'), recountRequired: count('RECOUNT_REQUIRED'), shortageAmount, surplusAmount, netAmount: surplusAmount - shortageAmount };
  }

  async submitInventory(id: string, requestContext: CompanyRequestContext) { const c = this.ctx(requestContext), s = await this.db.inventorySession.findFirst({ where: { id, ...this.scope(c), status: { in: ['COUNTING', 'RECOUNT_REQUIRED'] } }, include: { items: true } }); if (!s) throw new NotFoundException('Counting inventory not found'); this.assigned(c, s); if (!Array.isArray(s.items) && await this.db.inventoryItem.count({ where: { inventorySessionId: id, status: { in: ['NOT_COUNTED', 'RECOUNT_REQUIRED'] } } })) throw new BadRequestException('All positions must be counted before review'); const items = await this.canonicalInventoryItems(this.db, s.items || []); if (!items.length) throw new BadRequestException('Inventory has no positions'); if (items.some((i: any) => ['NOT_COUNTED', 'RECOUNT_REQUIRED'].includes(i.status))) throw new BadRequestException('All positions must be counted before review'); await this.db.inventorySession.update({ where: { id }, data: { status: 'REVIEW', submittedAt: new Date(), submittedById: c.userId, version: { increment: 1 } } }); await this.audit(this.db, c, 'inventory.submitted', id); return { id, status: 'REVIEW' }; }
  async markUncountedAsZero(id: string, requestContext: CompanyRequestContext) { const c = this.ctx(requestContext); this.manager(c); const items = await this.db.inventoryItem.findMany({ where: { inventorySessionId: id, session: { ...this.scope(c), status: 'COUNTING' }, status: 'NOT_COUNTED' }, select: { id: true } }); for (const i of items) await this.countInventoryItem(id, i.id, { counted_quantity: 0, note: 'Непосчитанная позиция отмечена нулём' }, c); return { updated: items.length }; }
  async requestRecount(id: string, itemId: string, body: Record<string, unknown>, requestContext: CompanyRequestContext) { const c = this.ctx(requestContext); this.manager(c); const reason = String(body.reason_code || '').trim(); if (!reason) throw new BadRequestException('reason_code required'); const i = await this.db.inventoryItem.findFirst({ where: { id: itemId, inventorySessionId: id, session: { ...this.scope(c), status: 'REVIEW' } } }); if (!i) throw new NotFoundException('Review item not found'); await this.db.$transaction([this.db.inventoryItem.update({ where: { id: itemId }, data: { status: 'RECOUNT_REQUIRED', reasonCode: reason, note: String(body.note || '').trim() || i.note, countedQuantity: null, differenceQuantity: null, adjustmentDelta: null, differenceAmount: null, version: { increment: 1 } } }), this.db.inventorySession.update({ where: { id }, data: { status: 'RECOUNT_REQUIRED', version: { increment: 1 } } }), this.audit(this.db, c, 'inventory.recount_requested', id, { itemId, reason })]); return { id: itemId, status: 'RECOUNT_REQUIRED' }; }
  async approveItem(id: string, itemId: string, body: Record<string, unknown>, requestContext: CompanyRequestContext) { const c = this.ctx(requestContext); this.manager(c); const i = await this.db.inventoryItem.findFirst({ where: { id: itemId, inventorySessionId: id, session: { ...this.scope(c), status: 'REVIEW' } } }); if (!i) throw new NotFoundException('Review item not found'); const u = await this.db.inventoryItem.update({ where: { id: itemId }, data: { status: 'APPROVED', reasonCode: String(body.reason_code || '').trim() || i.reasonCode, note: String(body.note || '').trim() || i.note, approvedById: c.userId, approvedAt: new Date(), version: { increment: 1 } } }); return { id: u.id, status: u.status }; }
  async getCountAttempts(id: string, itemId: string, requestContext: CompanyRequestContext) { const c = this.ctx(requestContext), item: any = await this.db.inventoryItem.findFirst({ where: { id: itemId, inventorySessionId: id, session: this.scope(c) }, include: { session: true } }); if (!item) throw new NotFoundException('Item not found'); this.assigned(c, item.session); return this.db.inventoryCountAttempt.findMany({ where: { inventoryItemId: itemId }, include: { countedBy: { select: { id: true, firstName: true, lastName: true } } }, orderBy: { attemptNumber: 'desc' } }); }
  async cancelInventory(id: string, body: Record<string, unknown>, requestContext: CompanyRequestContext) { const c = this.ctx(requestContext), reason = String(body.reason || '').trim(); this.manager(c); if (!reason) throw new BadRequestException('Cancellation reason required'); const result = await this.db.inventorySession.updateMany({ where: { id, ...this.scope(c), status: { in: ['DRAFT', ...ACTIVE] } }, data: { status: 'CANCELED', cancelReason: reason, canceledAt: new Date(), canceledById: c.userId, version: { increment: 1 } } }); if (!result.count) throw new BadRequestException('Inventory cannot be canceled'); await this.audit(this.db, c, 'inventory.canceled', id, { reason }); return { id, status: 'CANCELED' }; }

  async approveInventory(id: string, requestContext: CompanyRequestContext) {
    const c = this.ctx(requestContext); this.manager(c);
    return runSerializableTransaction(this.db, async (tx) => {
      const s: any = await tx.inventorySession.findFirst({ where: { id, ...this.scope(c) }, include: { items: true, shop: true } }); if (!s) throw new NotFoundException('Session not found'); if (s.status === 'COMPLETED') return { success: true, id, status: 'COMPLETED', idempotent: true }; if (s.status !== 'REVIEW') throw new BadRequestException('Инвентаризация ещё не готова к подтверждению'); const applicableItems = await this.canonicalInventoryItems(tx, s.items); if (!applicableItems.length) throw new BadRequestException('В инвентаризации нет товаров'); if (applicableItems.some((i: any) => ['NOT_COUNTED', 'RECOUNT_REQUIRED'].includes(i.status) || i.countedQuantity === null)) throw new BadRequestException('Сначала посчитайте все товары и завершите назначенные пересчёты');
      if ((await tx.inventorySession.updateMany({ where: { id, status: 'REVIEW', version: s.version }, data: { status: 'APPLYING', version: { increment: 1 } } })).count !== 1) throw new ConflictException('Inventory is already being approved');
      for (const i of applicableItems) { const delta = +(i.adjustmentDelta || 0); if (!delta) continue; let before = 0, after = 0;
        if (i.variantId) { const stock = await tx.productVariantStock.findUnique({ where: { variantId_shopId: { variantId: i.variantId, shopId: s.shopId } } }); before = +(stock?.quantity || 0); after = before + delta; if (after < 0) throw new ConflictException('Inventory adjustment would make variant stock negative'); await tx.productVariantStock.upsert({ where: { variantId_shopId: { variantId: i.variantId, shopId: s.shopId } }, create: { companyId: c.companyId, variantId: i.variantId, shopId: s.shopId, branchCode: s.shop.branchCode, quantity: after }, update: { quantity: after } }); const aggregate = await tx.productVariantStock.aggregate({ where: { companyId: c.companyId, shopId: s.shopId, variant: { productId: i.productId } }, _sum: { quantity: true } }); await tx.productStock.upsert({ where: { productId_shopId: { productId: i.productId, shopId: s.shopId } }, create: { productId: i.productId, shopId: s.shopId, branchCode: s.shop.branchCode, quantity: +(aggregate._sum.quantity || 0) }, update: { quantity: +(aggregate._sum.quantity || 0) } }); }
        else { const stock = await tx.productStock.findUnique({ where: { productId_shopId: { productId: i.productId, shopId: s.shopId } } }); before = +(stock?.quantity || 0); after = before + delta; if (after < 0) throw new ConflictException('Inventory adjustment would make stock negative'); await tx.productStock.upsert({ where: { productId_shopId: { productId: i.productId, shopId: s.shopId } }, create: { productId: i.productId, shopId: s.shopId, branchCode: s.shop.branchCode, quantity: after }, update: { quantity: after } }); }
        await tx.stockMovement.create({ data: { companyId: c.companyId, shopId: s.shopId, productId: i.productId, variantId: i.variantId, type: 'INVENTORY_ADJUSTMENT', displayTypeCode: 'inventory', displayTypeLabel: 'Инвентаризация', externalId: s.id, referenceType: 'INVENTORY', referenceId: s.id, quantity: new Prisma.Decimal(delta), loadedMeasurementValue: new Prisma.Decimal(i.countedQuantity), beforeQuantity: new Prisma.Decimal(before), afterQuantity: new Prisma.Decimal(after), fromShopId: s.shopId, toShopId: s.shopId, supplyPrice: new Prisma.Decimal(i.costPriceSnapshot), createdById: c.userId } }); const total = await tx.productStock.aggregate({ where: { productId: i.productId }, _sum: { quantity: true } }); await tx.product.update({ where: { id: i.productId }, data: { quantity: +(total._sum.quantity || 0) } }); }
      const now = new Date(); await tx.inventorySession.update({ where: { id }, data: { status: 'COMPLETED', approvedById: c.userId, approvedAt: now, closedById: c.userId, closedAt: now, version: { increment: 1 } } }); await this.audit(tx, c, 'inventory.completed', id); return { success: true, id, status: 'COMPLETED' };
    });
  }
  applyInventory(id: string, c: CompanyRequestContext) { return this.approveInventory(id, c); }
}

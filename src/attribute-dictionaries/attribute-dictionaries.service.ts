import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AttributeValue,
  AttributeValueType,
  Prisma,
  StoreType,
} from '@prisma/client';
import {
  CompanyRequestContext,
  requireCompanyContext,
} from '../auth/request-context';
import { loadRoleAccess } from '../auth/role-permissions';
import { PrismaService } from '../prisma/prisma.service';
import {
  AttributeCodeError,
  SIMILAR_COLOR_DISTANCE,
  colorDistance,
  isCollectionCode,
  normalizeAttributeCode,
} from './normalize-attribute-code';
import { ensureLegacyLink } from './legacy-link';
import {
  SEASON_GROUPS,
  SIZE_GROUPS,
  SizeGroup,
  sizeGroupsFor,
} from './system-values';

const TYPE_BY_PATH: Record<string, AttributeValueType> = {
  colors: 'COLOR',
  color: 'COLOR',
  sizes: 'SIZE',
  size: 'SIZE',
  seasons: 'SEASON',
  season: 'SEASON',
};

type ValueWithSetting = AttributeValue & {
  settings?: Array<{ isHidden: boolean; sortOrder: number | null }>;
};

export type AttributeValueDto = ReturnType<
  AttributeDictionariesService['toDto']
>;

type Store = {
  companyId: string;
  storeType: StoreType;
  sizeGroups: SizeGroup[];
};

/**
 * Colour/size/season dictionaries of apparel stores. System values
 * (companyId NULL) are changed only through the platform admin API; a store
 * hides or reorders them via StoreAttributeSetting and owns its own values.
 * Both rules are checked here, on the server.
 */
@Injectable()
export class AttributeDictionariesService {
  constructor(private readonly prisma: PrismaService) {}

  parseType(value: unknown): AttributeValueType {
    const type = TYPE_BY_PATH[String(value ?? '').toLowerCase()];
    if (!type)
      throw new NotFoundException('Справочник: colors, sizes или seasons');
    return type;
  }

  // ---- Store API -----------------------------------------------------------

  async list(
    type: AttributeValueType,
    requestContext: CompanyRequestContext,
    all = false,
  ) {
    const store = await this.store(requestContext);
    const rows: ValueWithSetting[] = await this.prisma.attributeValue.findMany({
      where: {
        type,
        OR: [
          { companyId: null, ...this.systemGroupFilter(type, store) },
          { companyId: store.companyId, ...(all ? {} : { archivedAt: null }) },
        ],
        ...(all ? {} : { isActive: true }),
      },
      include: {
        settings: {
          where: { companyId: store.companyId },
          select: { isHidden: true, sortOrder: true },
        },
      },
    });
    return rows
      .map((row) => this.toDto(row))
      .filter((row) => all || !row.is_hidden)
      .sort(
        (a, b) =>
          Number(b.is_default) - Number(a.is_default) ||
          a.sort_order - b.sort_order ||
          a.code.localeCompare(b.code, 'en', { numeric: true }),
      );
  }

  async create(
    type: AttributeValueType,
    body: Record<string, unknown>,
    requestContext: CompanyRequestContext,
  ) {
    const store = await this.store(requestContext);
    await this.requireStoreAdmin(requestContext);
    const code = this.code(
      type,
      type === 'COLOR' ? (body.code ?? body.hex) : body.code,
    );
    const group = this.group(type, code, body.group, store);
    const name = this.name(body.name);

    const existing = await this.findExisting(type, code, group, store);
    if (existing) throw this.duplicate(existing);
    const warnings =
      type === 'COLOR' ? await this.similarColors(code, store) : [];

    try {
      const created = await this.prisma.attributeValue.create({
        data: {
          type,
          companyId: store.companyId,
          code,
          name,
          group,
          isDefault: false,
          sortOrder: this.int(body.sort_order) ?? 1000,
        },
      });
      return { ...this.toDto(created), warnings };
    } catch (error) {
      // A concurrent request created the same code.
      if (this.isUniqueViolation(error)) {
        const again = await this.findExisting(type, code, group, store);
        if (again) throw this.duplicate(again);
      }
      throw error;
    }
  }

  async update(
    id: string,
    body: Record<string, unknown>,
    requestContext: CompanyRequestContext,
  ) {
    const store = await this.store(requestContext);
    await this.requireStoreAdmin(requestContext);
    const value = await this.visibleValue(id, store);

    if (value.companyId === null) {
      // A system value: the store may only hide it or move it.
      const forbidden = Object.keys(body).filter(
        (key) => !['is_hidden', 'sort_order'].includes(key),
      );
      if (forbidden.length) {
        throw new ForbiddenException(
          'Системное значение магазин может только скрыть или переставить',
        );
      }
      const isHidden =
        body.is_hidden === undefined
          ? undefined
          : this.bool(body.is_hidden, 'is_hidden');
      const sortOrder =
        body.sort_order === undefined
          ? undefined
          : (this.int(body.sort_order) ?? null);
      await this.prisma.storeAttributeSetting.upsert({
        where: {
          companyId_attributeId: {
            companyId: store.companyId,
            attributeId: id,
          },
        },
        create: {
          companyId: store.companyId,
          attributeId: id,
          isHidden: isHidden ?? false,
          sortOrder: sortOrder ?? null,
        },
        update: {
          ...(isHidden === undefined ? {} : { isHidden }),
          ...(sortOrder === undefined ? {} : { sortOrder }),
        },
      });
      return this.toDto(await this.withSetting(id, store.companyId));
    }

    if (body.is_hidden !== undefined) {
      throw new BadRequestException(
        'Своё значение отключается через is_active или удаляется',
      );
    }
    const data: Prisma.AttributeValueUpdateInput = {};
    // A store's own colour may be recoloured: its HEX is its code, and a code
    // that never changed made a mis-picked colour unfixable. Another value
    // with that HEX is a 409 with it, as on create. Sizes/seasons keep codes.
    const newHex = value.type === 'COLOR' ? (body.code ?? body.hex) : undefined;
    let recolor: string | null = null;
    if (newHex !== undefined) {
      const hex = this.code('COLOR', newHex);
      if (hex !== value.code) {
        const existing = await this.findExisting('COLOR', hex, null, store);
        if (existing && existing.id !== value.id) throw this.duplicate(existing);
        data.code = hex;
        recolor = hex;
      }
    } else {
      this.assertCodeUnchanged(value, body);
    }
    if (body.name !== undefined) data.name = this.name(body.name);
    if (body.sort_order !== undefined)
      data.sortOrder = this.int(body.sort_order) ?? 0;
    if (body.is_active !== undefined)
      data.isActive = this.bool(body.is_active, 'is_active');
    if (body.is_archived !== undefined) {
      const archived = this.bool(body.is_archived, 'is_archived');
      data.archivedAt = archived ? (value.archivedAt ?? new Date()) : null;
      if (!archived) data.isActive = true;
    }
    if (body.group !== undefined) {
      throw new BadRequestException('Группу значения изменить нельзя');
    }
    const updated = recolor
      ? await this.prisma.$transaction(async (tx) => {
          const row = await tx.attributeValue.update({ where: { id }, data });
          // The legacy colour standing for it (the grid, receipts, import
          // codes) takes the new shade; one named by its old HEX is renamed.
          await tx.productColor.updateMany({
            where: { companyId: store.companyId, attributeValueId: id, name: value.code },
            data: { name: recolor!, nameRu: recolor!, nameUz: recolor! },
          });
          await tx.productColor.updateMany({
            where: { companyId: store.companyId, attributeValueId: id },
            data: { hex: recolor },
          });
          return row;
        })
      : await this.prisma.attributeValue.update({ where: { id }, data });
    return this.toDto(updated);
  }

  async remove(id: string, requestContext: CompanyRequestContext) {
    const store = await this.store(requestContext);
    await this.requireStoreAdmin(requestContext);
    const value = await this.visibleValue(id, store);
    if (value.companyId === null) {
      throw new ForbiddenException(
        'Системное значение нельзя удалить — его можно скрыть',
      );
    }
    if (await this.isUsed(id)) {
      const archived = await this.prisma.attributeValue.update({
        where: { id },
        data: { archivedAt: value.archivedAt ?? new Date(), isActive: false },
      });
      return { deleted: false, archived: true, value: this.toDto(archived) };
    }
    await this.prisma.attributeValue.delete({ where: { id } });
    return { deleted: true, archived: false };
  }

  /**
   * Product form: the legacy rows to save for picked dictionary values (see
   * ensureLegacyLink), one transaction for a whole size grid.
   */
  async linkLegacy(ids: unknown, requestContext: CompanyRequestContext) {
    const list = (Array.isArray(ids) ? ids : [ids]).map(String).filter(Boolean);
    if (!list.length || list.length > 100) {
      throw new BadRequestException('Укажите от 1 до 100 значений');
    }
    const store = await this.store(requestContext);
    await this.requireDictionariesOn(store.companyId);
    const values: AttributeValue[] = [];
    for (const id of new Set(list)) {
      const value = await this.visibleValue(id, store);
      if (value.archivedAt)
        throw new BadRequestException(`Значение ${value.code} в архиве`);
      values.push(value);
    }
    return this.prisma.$transaction(async (tx) => {
      const links: Array<Record<string, string | null>> = [];
      for (const value of values) {
        const link = await ensureLegacyLink(tx, store, value, { write: true });
        links.push(
          link.kind === 'collection'
            ? { id: value.id, kind: link.kind, collection: link.collection }
            : {
                id: value.id,
                kind: link.kind,
                legacy_id: 'legacyId' in link ? link.legacyId : null,
                legacy_code: 'legacyCode' in link ? link.legacyCode : null,
              },
        );
      }
      return links;
    });
  }

  private async requireDictionariesOn(companyId: string) {
    const company = await this.prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      select: { useAttributeDictionaries: true },
    });
    if (!company.useAttributeDictionaries) {
      throw new ForbiddenException(
        'Справочники атрибутов для магазина ещё не включены',
      );
    }
  }

  // ---- Platform admin API (system values) ----------------------------------

  async adminList(type?: unknown) {
    const rows = await this.prisma.attributeValue.findMany({
      where: {
        companyId: null,
        ...(type ? { type: this.parseType(type) } : {}),
      },
      orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }, { code: 'asc' }],
    });
    return rows.map((row) => this.toDto(row));
  }

  async adminCreate(body: Record<string, unknown>) {
    const type = this.parseType(body.type);
    const code = this.code(type, body.code);
    const group = this.systemGroup(type, code, body.group);
    const existing = await this.prisma.attributeValue.findFirst({
      where: { type, companyId: null, code, group },
    });
    if (existing) {
      throw new ConflictException({
        statusCode: 409,
        message: `Системное значение ${code} уже есть`,
        existing: this.toDto(existing),
      });
    }
    try {
      const created = await this.prisma.attributeValue.create({
        data: {
          type,
          companyId: null,
          code,
          name: this.name(body.name),
          group,
          isDefault: true,
          isActive:
            body.is_active === undefined
              ? true
              : this.bool(body.is_active, 'is_active'),
          sortOrder: this.int(body.sort_order) ?? 1000,
        },
      });
      return this.toDto(created);
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException(`Системное значение ${code} уже есть`);
      }
      throw error;
    }
  }

  async adminUpdate(id: string, body: Record<string, unknown>) {
    const value = await this.prisma.attributeValue.findUnique({
      where: { id },
    });
    if (!value) throw new NotFoundException('Значение не найдено');
    if (value.companyId !== null) {
      // Managing system values never touches what a store created.
      throw new ForbiddenException(
        'Пользовательские значения магазина здесь не меняются',
      );
    }
    this.assertCodeUnchanged(value, body);
    if (body.group !== undefined || body.type !== undefined) {
      throw new BadRequestException('Тип и группу значения изменить нельзя');
    }
    const data: Prisma.AttributeValueUpdateInput = {};
    if (body.name !== undefined) data.name = this.name(body.name);
    if (body.sort_order !== undefined)
      data.sortOrder = this.int(body.sort_order) ?? 0;
    if (body.is_active !== undefined)
      data.isActive = this.bool(body.is_active, 'is_active');
    return this.toDto(
      await this.prisma.attributeValue.update({ where: { id }, data }),
    );
  }

  // ---- Helpers ---------------------------------------------------------------

  toDto(row: ValueWithSetting) {
    const setting = row.settings?.[0];
    return {
      id: row.id,
      type: row.type,
      code: row.code,
      name: row.name,
      group: row.group,
      scope: row.companyId === null ? ('system' as const) : ('store' as const),
      is_default: row.isDefault,
      is_active: row.isActive,
      is_hidden: setting?.isHidden ?? false,
      is_archived: Boolean(row.archivedAt),
      sort_order: setting?.sortOrder ?? row.sortOrder,
    };
  }

  private async store(requestContext: CompanyRequestContext): Promise<Store> {
    const { companyId } = requireCompanyContext(requestContext);
    return this.storeById(companyId);
  }

  private async storeById(companyId: string): Promise<Store> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { storeType: true },
    });
    if (!company) throw new NotFoundException('Company not found');
    const sizeGroups = sizeGroupsFor(company.storeType);
    if (!sizeGroups) {
      throw new ForbiddenException(
        'Справочники атрибутов доступны только магазинам одежды и обуви',
      );
    }
    return { companyId, storeType: company.storeType, sizeGroups };
  }

  /** Owner or admin of the store (an admin CRM role). */
  private async requireStoreAdmin(requestContext: CompanyRequestContext) {
    const access = requestContext.crmRoleId
      ? await loadRoleAccess(
          this.prisma,
          requestContext.crmRoleId,
          requestContext.companyId,
        )
      : null;
    if (!access?.isAdmin) {
      throw new ForbiddenException(
        'Справочники меняет владелец или администратор магазина',
      );
    }
  }

  private systemGroupFilter(
    type: AttributeValueType,
    store: Store,
  ): Prisma.AttributeValueWhereInput {
    return type === 'SIZE' ? { group: { in: store.sizeGroups } } : {};
  }

  /** A value of this store or a system value it can see; anything else is not found. */
  private async visibleValue(id: string, store: Store) {
    const value = await this.prisma.attributeValue.findUnique({
      where: { id },
    });
    const visible =
      value &&
      (value.companyId === store.companyId ||
        (value.companyId === null &&
          (value.type !== 'SIZE' ||
            store.sizeGroups.includes(value.group as SizeGroup))));
    if (!visible) throw new NotFoundException('Значение не найдено');
    return value;
  }

  private async withSetting(id: string, companyId: string) {
    return this.prisma.attributeValue.findUniqueOrThrow({
      where: { id },
      include: {
        settings: {
          where: { companyId },
          select: { isHidden: true, sortOrder: true },
        },
      },
    });
  }

  /**
   * The value with this code the store already has: a system one it sees
   * (also hidden or inactive) or its own (also archived). A requested size
   * group narrows the match, so a CLOTHING_SHOES store resolves "42" to the
   * shoe size or the trousers size it asked for.
   */
  private async findExisting(
    type: AttributeValueType,
    code: string,
    group: string | null,
    store: Store,
  ) {
    const rows = await this.prisma.attributeValue.findMany({
      where: {
        type,
        code,
        OR: [
          { companyId: null, ...this.systemGroupFilter(type, store) },
          { companyId: store.companyId },
        ],
      },
      include: {
        settings: {
          where: { companyId: store.companyId },
          select: { isHidden: true, sortOrder: true },
        },
      },
      orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }],
    });
    if (!group) return rows[0] ?? null;
    return (
      rows.find((row) => row.group === group || row.group === null) ?? null
    );
  }

  private duplicate(existing: ValueWithSetting) {
    const dto = this.toDto(existing);
    const where =
      dto.scope === 'system'
        ? dto.is_hidden
          ? 'среди скрытых системных значений'
          : 'среди системных значений'
        : dto.is_archived
          ? 'в архиве магазина'
          : 'в значениях магазина';
    return new ConflictException({
      statusCode: 409,
      message: `Значение ${dto.code} уже есть ${where} — выберите его`,
      existing: dto,
    });
  }

  private async similarColors(code: string, store: Store) {
    const colors = await this.prisma.attributeValue.findMany({
      where: {
        type: 'COLOR',
        isActive: true,
        OR: [
          { companyId: null },
          { companyId: store.companyId, archivedAt: null },
        ],
      },
    });
    return colors
      .map((color) => ({ color, distance: colorDistance(code, color.code) }))
      .filter(({ distance }) => distance < SIMILAR_COLOR_DISTANCE)
      .sort((a, b) => a.distance - b.distance)
      .map(({ color }) => ({
        code: 'SIMILAR_COLOR',
        message: `Похожий цвет уже есть: ${color.name ?? color.code} (${color.code})`,
        similar: this.toDto(color),
      }));
  }

  private async isUsed(id: string) {
    const [variants, products] = await Promise.all([
      this.prisma.productVariant.count({
        where: { OR: [{ colorValueId: id }, { sizeValueId: id }] },
      }),
      this.prisma.product.count({
        where: { OR: [{ seasonValueId: id }, { collectionValueId: id }] },
      }),
    ]);
    return variants + products > 0;
  }

  private code(type: AttributeValueType, raw: unknown) {
    try {
      return normalizeAttributeCode(type, raw);
    } catch (error) {
      if (error instanceof AttributeCodeError)
        throw new BadRequestException(error.message);
      throw error;
    }
  }

  private assertCodeUnchanged(
    value: AttributeValue,
    body: Record<string, unknown>,
  ) {
    if (body.code === undefined) return;
    let next: string | undefined;
    try {
      next = normalizeAttributeCode(value.type, body.code);
    } catch {
      next = undefined;
    }
    if (next !== value.code) {
      throw new BadRequestException('Код значения после создания не меняется');
    }
  }

  /** Group of a store value: as requested (must be visible) or implied by the code. */
  private group(
    type: AttributeValueType,
    code: string,
    raw: unknown,
    store: Store,
  ) {
    if (type === 'COLOR') return null;
    if (type === 'SEASON') return this.seasonGroup(code, raw);
    const requested = this.optionalText(raw)?.toUpperCase();
    if (requested) {
      if (!store.sizeGroups.includes(requested as SizeGroup)) {
        throw new BadRequestException(
          `Группа размеров: ${store.sizeGroups.join(', ')}`,
        );
      }
      return requested;
    }
    if (store.sizeGroups.length === 1) return store.sizeGroups[0];
    if (/^\d+(\.\d+)?$/.test(code)) {
      const number = Number(code);
      // Clothing-only stores: trousers up to 42, jackets from 44.
      if (store.storeType === 'CLOTHING' && Number.isFinite(number)) {
        return number <= 42 ? 'NUM_BOTTOM' : 'NUM_TOP';
      }
      return null;
    }
    return 'LETTER';
  }

  private systemGroup(type: AttributeValueType, code: string, raw: unknown) {
    if (type === 'COLOR') return null;
    if (type === 'SEASON') return this.seasonGroup(code, raw);
    const group = this.optionalText(raw)?.toUpperCase();
    if (!group || !(SIZE_GROUPS as readonly string[]).includes(group)) {
      throw new BadRequestException(
        `Группа размеров: ${SIZE_GROUPS.join(', ')}`,
      );
    }
    return group;
  }

  private seasonGroup(code: string, raw: unknown) {
    const requested = this.optionalText(raw)?.toUpperCase();
    const implied = isCollectionCode(code) ? 'COLLECTION' : 'TIME_OF_YEAR';
    if (
      requested &&
      !(SEASON_GROUPS as readonly string[]).includes(requested)
    ) {
      throw new BadRequestException(
        `Группа сезона: ${SEASON_GROUPS.join(', ')}`,
      );
    }
    if (requested === 'COLLECTION' && implied !== 'COLLECTION') {
      throw new BadRequestException(
        'Код сезона коллекции: SS или FW и год, например SS26',
      );
    }
    return requested ?? implied;
  }

  private name(value: unknown) {
    const name = this.optionalText(value);
    if (name && name.length > 60)
      throw new BadRequestException('Название не длиннее 60 символов');
    return name ?? null;
  }

  private optionalText(value: unknown) {
    if (value === undefined || value === null) return undefined;
    const text = String(value).trim();
    return text || undefined;
  }

  private int(value: unknown) {
    if (value === undefined || value === null || value === '') return undefined;
    const number = Number(value);
    if (!Number.isInteger(number))
      throw new BadRequestException('sort_order must be an integer');
    return number;
  }

  private bool(value: unknown, field: string) {
    if (typeof value !== 'boolean')
      throw new BadRequestException(`${field} must be a boolean`);
    return value;
  }

  private isUniqueViolation(error: unknown) {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }
}

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AttributeKind, Prisma } from '@prisma/client';
import {
  CompanyRequestContext,
  requireCompanyContext,
} from '../auth/request-context';
import { PrismaService } from '../prisma/prisma.service';

const KINDS: AttributeKind[] = ['SELECT', 'TEXT', 'NUMBER'];

type ValueInput = {
  definition_id?: unknown;
  option_id?: unknown;
  value?: unknown;
};

// Tenant-defined attributes. Colour and size definitions are mirrored from
// ProductColor/ProductSize by DB triggers (legacySource): editing one of their
// values here goes through the colour/size dictionary, and the trigger keeps
// the attribute option in step.
@Injectable()
export class ProductAttributesService {
  constructor(private readonly prisma: PrismaService) {}

  /** The company's product categories, for the product form. */
  async listCategories(requestContext: CompanyRequestContext) {
    const { companyId } = requireCompanyContext(requestContext);
    return this.prisma.category.findMany({
      where: { companyId },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  async list(requestContext: CompanyRequestContext, includeInactive = false) {
    const { companyId } = requireCompanyContext(requestContext);
    const definitions = await this.prisma.attributeDefinition.findMany({
      where: { companyId, ...(includeInactive ? {} : { isActive: true }) },
      include: {
        options: {
          where: includeInactive ? {} : { isActive: true },
          orderBy: [{ sortOrder: 'asc' }, { value: 'asc' }],
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return definitions.map((definition) => this.toDefinition(definition));
  }

  async create(
    body: Record<string, unknown>,
    requestContext: CompanyRequestContext,
  ) {
    const { companyId } = requireCompanyContext(requestContext);
    const name = this.requireText(body.name, 'name');
    const code = this.optionalText(body.code) ?? this.codeFromName(name);
    if (!/^[a-z0-9_]{1,40}$/.test(code)) {
      throw new BadRequestException(
        'Код атрибута: только латинские буквы, цифры и _',
      );
    }
    const kind = this.parseKind(body.kind);
    try {
      const created = await this.prisma.attributeDefinition.create({
        data: {
          companyId,
          code,
          name,
          kind,
          isVariantAxis:
            kind === 'SELECT' ? body.is_variant_axis !== false : false,
          sortOrder: this.optionalInt(body.sort_order) ?? 100,
        },
        include: { options: true },
      });
      return this.toDefinition(created);
    } catch (error) {
      throw this.uniqueConflict(error, 'Атрибут с таким кодом уже существует');
    }
  }

  async update(
    id: string,
    body: Record<string, unknown>,
    requestContext: CompanyRequestContext,
  ) {
    const definition = await this.findDefinition(id, requestContext);
    const data: Prisma.AttributeDefinitionUpdateInput = {};
    if (body.name !== undefined)
      data.name = this.requireText(body.name, 'name');
    if (body.sort_order !== undefined)
      data.sortOrder = this.optionalInt(body.sort_order) ?? 0;
    if (body.is_active !== undefined) data.isActive = body.is_active === true;
    if (body.is_variant_axis !== undefined) {
      if (definition.legacySource) {
        throw new BadRequestException('Цвет и размер всегда задают варианты');
      }
      if (await this.isUsed(definition.id)) {
        throw new ConflictException(
          'Атрибут уже используется в товарах — его роль изменить нельзя',
        );
      }
      data.isVariantAxis =
        definition.kind === 'SELECT' && body.is_variant_axis === true;
    }
    const updated = await this.prisma.attributeDefinition.update({
      where: { id: definition.id },
      data,
      include: { options: true },
    });
    return this.toDefinition(updated);
  }

  async remove(id: string, requestContext: CompanyRequestContext) {
    const definition = await this.findDefinition(id, requestContext);
    if (definition.legacySource) {
      throw new BadRequestException(
        'Цвет и размер удаляются вместе со справочниками цветов и размеров',
      );
    }
    if (await this.isUsed(definition.id)) {
      throw new ConflictException(
        'Атрибут используется в товарах — сначала уберите его из них или отключите',
      );
    }
    await this.prisma.attributeDefinition.delete({
      where: { id: definition.id },
    });
    return { success: true };
  }

  async createOption(
    definitionId: string,
    body: Record<string, unknown>,
    requestContext: CompanyRequestContext,
  ) {
    const legacy = await this.findLegacyDefinition(definitionId, requestContext);
    if (legacy) {
      const value = this.requiredName(body.value);
      const meta = (body.meta ?? {}) as Record<string, unknown>;
      const created =
        legacy.legacySource === 'color'
          ? await this.createColor({ name: value, hex: meta?.hex, sort_order: body.sort_order }, requestContext)
          : await this.createSize({ name: value, kind: meta?.kind, sort_order: body.sort_order }, requestContext);
      return this.legacyOption(legacy.legacySource!, created.id, value);
    }
    const definition = await this.findEditableSelect(
      definitionId,
      requestContext,
    );
    try {
      return this.toOption(
        await this.prisma.attributeOption.create({
          data: {
            companyId: definition.companyId,
            definitionId: definition.id,
            value: this.requireText(body.value, 'value'),
            sortOrder: this.optionalInt(body.sort_order) ?? 0,
            meta: this.optionalJson(body.meta),
          },
        }),
      );
    } catch (error) {
      throw this.uniqueConflict(error, 'Такое значение уже есть');
    }
  }

  async updateOption(
    definitionId: string,
    optionId: string,
    body: Record<string, unknown>,
    requestContext: CompanyRequestContext,
  ) {
    const legacy = await this.findLegacyDefinition(definitionId, requestContext);
    if (legacy) {
      const option = await this.findOption(legacy.id, optionId);
      const sourceId = option.legacyColorId ?? option.legacySizeId;
      if (!sourceId) throw new NotFoundException('Значение не связано со справочником');
      const patch = {
        ...(body.value !== undefined ? { name: body.value } : {}),
        ...(body.sort_order !== undefined ? { sort_order: body.sort_order } : {}),
        ...(body.is_active !== undefined ? { is_active: body.is_active } : {}),
      };
      if (legacy.legacySource === 'color') await this.updateColor(sourceId, patch, requestContext);
      else await this.updateSize(sourceId, patch, requestContext);
      return this.toOption(await this.findOption(legacy.id, optionId));
    }
    const definition = await this.findEditableSelect(
      definitionId,
      requestContext,
    );
    const option = await this.findOption(definition.id, optionId);
    try {
      return this.toOption(
        await this.prisma.attributeOption.update({
          where: { id: option.id },
          data: {
            ...(body.value !== undefined
              ? { value: this.requireText(body.value, 'value') }
              : {}),
            ...(body.sort_order !== undefined
              ? { sortOrder: this.optionalInt(body.sort_order) ?? 0 }
              : {}),
            ...(body.is_active !== undefined
              ? { isActive: body.is_active === true }
              : {}),
            ...(body.meta !== undefined
              ? { meta: this.optionalJson(body.meta) }
              : {}),
          },
        }),
      );
    } catch (error) {
      throw this.uniqueConflict(error, 'Такое значение уже есть');
    }
  }

  async removeOption(
    definitionId: string,
    optionId: string,
    requestContext: CompanyRequestContext,
  ) {
    const legacy = await this.findLegacyDefinition(definitionId, requestContext);
    if (legacy) {
      const option = await this.findOption(legacy.id, optionId);
      if (option.legacyColorId) return this.deleteColor(option.legacyColorId, requestContext);
      if (option.legacySizeId) return this.deleteSize(option.legacySizeId, requestContext);
      throw new NotFoundException('Значение не связано со справочником');
    }
    const definition = await this.findEditableSelect(
      definitionId,
      requestContext,
    );
    const option = await this.findOption(definition.id, optionId);
    const used =
      (await this.prisma.variantAttributeValue.count({
        where: { optionId: option.id },
      })) +
      (await this.prisma.productAttributeValue.count({
        where: { optionId: option.id },
      }));
    if (used) {
      throw new ConflictException(
        'Значение используется в товарах — отключите его вместо удаления',
      );
    }
    await this.prisma.attributeOption.delete({ where: { id: option.id } });
    return { success: true };
  }

  /**
   * Sets the custom (non colour/size) axis values of a variant. Colour/size
   * stay on color_id/size_id of the variant form. A combination already used
   * by another active variant of the product is rejected.
   */
  async setVariantValues(
    variantId: string,
    body: Record<string, unknown>,
    requestContext: CompanyRequestContext,
  ) {
    const { companyId } = requireCompanyContext(requestContext);
    const variant = await this.prisma.productVariant.findFirst({
      where: { id: variantId, companyId },
      select: { id: true, productId: true },
    });
    if (!variant) throw new NotFoundException('Product variant not found');
    const values = await this.resolveValues(companyId, body.values, true);

    return this.prisma.$transaction(async (tx) => {
      await tx.variantAttributeValue.deleteMany({
        where: {
          variantId: variant.id,
          definition: { legacySource: null },
          definitionId: { notIn: values.map((value) => value.definitionId) },
        },
      });
      for (const value of values) {
        await tx.variantAttributeValue.upsert({
          where: {
            variantId_definitionId: {
              variantId: variant.id,
              definitionId: value.definitionId,
            },
          },
          create: { companyId, variantId: variant.id, ...value },
          update: { optionId: value.optionId, valueText: value.valueText },
        });
      }
      // optionsKey is recomputed by the DB trigger on the writes above.
      const updated = await tx.productVariant.findUniqueOrThrow({
        where: { id: variant.id },
        select: { optionsKey: true },
      });
      if (
        updated.optionsKey &&
        (await tx.productVariant.findFirst({
          where: {
            productId: variant.productId,
            optionsKey: updated.optionsKey,
            isActive: true,
            id: { not: variant.id },
          },
          select: { id: true },
        }))
      ) {
        throw new ConflictException(
          'Вариант с такими значениями атрибутов уже есть у этого товара',
        );
      }
      return { success: true, options_key: updated.optionsKey };
    });
  }

  /** Product-level (non-axis) attribute values such as material. */
  async setProductValues(
    productRef: string,
    body: Record<string, unknown>,
    requestContext: CompanyRequestContext,
  ) {
    const { companyId } = requireCompanyContext(requestContext);
    const product = await this.findProduct(companyId, productRef);
    const values = await this.resolveValues(companyId, body.values, false);

    await this.prisma.$transaction([
      this.prisma.productAttributeValue.deleteMany({
        where: {
          productId: product.id,
          definitionId: { notIn: values.map((value) => value.definitionId) },
        },
      }),
      ...values.map((value) =>
        this.prisma.productAttributeValue.upsert({
          where: {
            productId_definitionId: {
              productId: product.id,
              definitionId: value.definitionId,
            },
          },
          create: { companyId, productId: product.id, ...value },
          update: { optionId: value.optionId, valueText: value.valueText },
        }),
      ),
    ]);
    return this.getProductValues(String(product.id), requestContext);
  }

  async getProductValues(
    productRef: string,
    requestContext: CompanyRequestContext,
  ) {
    const { companyId } = requireCompanyContext(requestContext);
    const product = await this.findProduct(companyId, productRef);
    const rows = await this.prisma.productAttributeValue.findMany({
      where: { productId: product.id, companyId },
      include: { definition: true, option: true },
      orderBy: { definition: { sortOrder: 'asc' } },
    });
    return rows.map((row) => ({
      definition_id: row.definitionId,
      code: row.definition.code,
      name: row.definition.name,
      option_id: row.optionId,
      value: row.option?.value ?? row.valueText ?? '',
    }));
  }

  // ---- helpers ------------------------------------------------------------

  // Products are addressed by publicId in the API, by numeric id internally.
  private async findProduct(companyId: string, ref: string) {
    const numericId = /^[0-9]+$/.test(ref) ? Number(ref) : undefined;
    const product = await this.prisma.product.findFirst({
      where: {
        companyId,
        OR: [{ publicId: ref }, ...(numericId ? [{ id: numericId }] : [])],
      },
      select: { id: true },
    });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  private async resolveValues(
    companyId: string,
    raw: unknown,
    variantAxes: boolean,
  ) {
    if (!Array.isArray(raw)) {
      throw new BadRequestException('values must be an array');
    }
    const resolved: Array<{
      definitionId: string;
      optionId: string | null;
      valueText: string | null;
    }> = [];
    for (const entry of raw as ValueInput[]) {
      const definitionId = this.requireText(
        entry?.definition_id,
        'definition_id',
      );
      const definition = await this.prisma.attributeDefinition.findFirst({
        where: { id: definitionId, companyId },
      });
      if (!definition) throw new NotFoundException('Attribute not found');
      if (definition.legacySource) {
        throw new BadRequestException(
          'Цвет и размер задаются полями color_id / size_id варианта',
        );
      }
      if (definition.isVariantAxis !== variantAxes) {
        throw new BadRequestException(
          variantAxes
            ? `Атрибут «${definition.name}» описывает товар, а не вариант`
            : `Атрибут «${definition.name}» задаёт варианты товара`,
        );
      }
      if (resolved.some((value) => value.definitionId === definition.id)) {
        throw new BadRequestException('Атрибут указан дважды');
      }
      if (definition.kind === 'SELECT') {
        const optionId = this.requireText(entry?.option_id, 'option_id');
        const option = await this.prisma.attributeOption.findFirst({
          where: { id: optionId, definitionId: definition.id },
          select: { id: true },
        });
        if (!option) throw new NotFoundException('Attribute value not found');
        resolved.push({
          definitionId: definition.id,
          optionId: option.id,
          valueText: null,
        });
        continue;
      }
      const text = this.requireText(entry?.value, 'value');
      if (
        definition.kind === 'NUMBER' &&
        !Number.isFinite(Number(text.replace(',', '.')))
      ) {
        throw new BadRequestException(
          `«${definition.name}» должно быть числом`,
        );
      }
      resolved.push({
        definitionId: definition.id,
        optionId: null,
        valueText: text,
      });
    }
    return resolved;
  }

  private async findDefinition(
    id: string,
    requestContext: CompanyRequestContext,
  ) {
    const { companyId } = requireCompanyContext(requestContext);
    const definition = await this.prisma.attributeDefinition.findFirst({
      where: { id, companyId },
    });
    if (!definition) throw new NotFoundException('Attribute not found');
    return definition;
  }

  /** The built-in colour / size attribute, or null for a tenant one. */
  private async findLegacyDefinition(id: string, requestContext: CompanyRequestContext) {
    const definition = await this.findDefinition(id, requestContext);
    return definition.legacySource === 'color' || definition.legacySource === 'size' ? definition : null;
  }

  /** The option the DB trigger mirrored from a new colour / size. */
  private async legacyOption(source: string, sourceId: string, value: string) {
    const option = await this.prisma.attributeOption.findFirst({
      where: source === 'color' ? { legacyColorId: sourceId } : { legacySizeId: sourceId },
    });
    // Without the trigger (e.g. not migrated yet) the dictionary row still exists.
    return option
      ? this.toOption(option)
      : { id: sourceId, value, sort_order: 0, is_active: true, meta: null };
  }

  private async findEditableSelect(
    id: string,
    requestContext: CompanyRequestContext,
  ) {
    const definition = await this.findDefinition(id, requestContext);
    if (definition.legacySource) {
      throw new BadRequestException(
        definition.legacySource === 'color'
          ? 'Цвета редактируются в справочнике цветов'
          : 'Размеры редактируются в справочнике размеров',
      );
    }
    if (definition.kind !== 'SELECT') {
      throw new BadRequestException('Значения есть только у атрибутов-списков');
    }
    return definition;
  }

  private async findOption(definitionId: string, optionId: string) {
    const option = await this.prisma.attributeOption.findFirst({
      where: { id: optionId, definitionId },
    });
    if (!option) throw new NotFoundException('Attribute value not found');
    return option;
  }

  private async isUsed(definitionId: string) {
    const used =
      (await this.prisma.variantAttributeValue.count({
        where: { definitionId },
      })) +
      (await this.prisma.productAttributeValue.count({
        where: { definitionId },
      }));
    return used > 0;
  }

  private toDefinition(
    definition: Prisma.AttributeDefinitionGetPayload<{
      include: { options: true };
    }>,
  ) {
    return {
      id: definition.id,
      code: definition.code,
      name: definition.name,
      kind: definition.kind,
      is_variant_axis: definition.isVariantAxis,
      sort_order: definition.sortOrder,
      is_active: definition.isActive,
      // Colour/size: options come from the colour/size dictionaries.
      legacy_source: definition.legacySource,
      options: definition.options.map((option) => this.toOption(option)),
    };
  }

  private toOption(option: {
    id: string;
    value: string;
    sortOrder: number;
    isActive: boolean;
    meta: Prisma.JsonValue;
  }) {
    return {
      id: option.id,
      value: option.value,
      sort_order: option.sortOrder,
      is_active: option.isActive,
      meta: option.meta ?? null,
    };
  }

  private uniqueConflict(error: unknown, message: string) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return new ConflictException(message);
    }
    return error;
  }

  private parseKind(value: unknown): AttributeKind {
    if (value === undefined || value === null || value === '') return 'SELECT';
    const kind = String(value).toUpperCase() as AttributeKind;
    if (!KINDS.includes(kind)) {
      throw new BadRequestException('kind must be SELECT, TEXT or NUMBER');
    }
    return kind;
  }

  private codeFromName(name: string) {
    const code = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    return code || `attr_${Date.now().toString(36)}`;
  }

  private requiredName(value: unknown) {
    const name = this.optionalText(value);
    if (!name) throw new BadRequestException('Укажите название');
    if (name.length > 60) throw new BadRequestException('Название не длиннее 60 символов');
    return name;
  }

  private requireText(value: unknown, field: string) {
    const text = this.optionalText(value);
    if (!text) throw new BadRequestException(`${field} is required`);
    return text;
  }

  private optionalText(value: unknown) {
    if (value === undefined || value === null) return undefined;
    const text = String(value).trim();
    return text ? text : undefined;
  }

  private optionalInt(value: unknown) {
    if (value === undefined || value === null || value === '') return undefined;
    const number = Number(value);
    if (!Number.isInteger(number)) {
      throw new BadRequestException('sort_order must be an integer');
    }
    return number;
  }

  private optionalJson(value: unknown): Prisma.InputJsonValue | undefined {
    if (value === undefined || value === null) return undefined;
    if (typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException('meta must be an object');
    }
    return value as Prisma.InputJsonValue;
  }

  // ---- Color management (for clothing/shoe stores) --------------------------

  private async requireApparelCompany(requestContext: CompanyRequestContext) {
    const { companyId } = requireCompanyContext(requestContext);
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { storeType: true },
    });
    if (!company) throw new NotFoundException('Company not found');
    // Keep the legacy colour/size API available for accessory tenants. The
    // apparel settings UI and import columns are gated by storeType instead.
    return { companyId, storeType: company.storeType };
  }

  private dictionaryCode(value: unknown) {
    const code = String(value ?? '').trim().toUpperCase();
    if (!/^[A-Z0-9.]{1,20}$/.test(code)) {
      throw new BadRequestException(
        'Код может содержать только латинские буквы, цифры и точку (до 20 символов)',
      );
    }
    return code;
  }

  /**
   * The code the user typed, or one built from the name ("Тёмно-синий" →
   * "TEMNOSINIY", "42" → "42") and made unique with a number. Quick adds from
   * the product form send no code at all.
   */
  private async resolveDictionaryCode(
    value: unknown,
    name: string,
    taken: (code: string) => Promise<boolean>,
  ) {
    const typed = String(value ?? '').trim();
    if (typed && !typed.startsWith('#')) return this.dictionaryCode(typed);
    const map: Record<string, string> = {
      а: 'A', б: 'B', в: 'V', г: 'G', д: 'D', е: 'E', ё: 'E', ж: 'ZH', з: 'Z', и: 'I',
      й: 'Y', к: 'K', л: 'L', м: 'M', н: 'N', о: 'O', п: 'P', р: 'R', с: 'S', т: 'T',
      у: 'U', ф: 'F', х: 'H', ц: 'TS', ч: 'CH', ш: 'SH', щ: 'SCH', ы: 'Y', э: 'E',
      ю: 'YU', я: 'YA', ў: 'O', қ: 'Q', ғ: 'G', ҳ: 'H',
    };
    const base =
      [...name.toLowerCase()]
        .map((char) => map[char] ?? char)
        .join('')
        .toUpperCase()
        .replace(/[^A-Z0-9.]/g, '')
        .slice(0, 16) || 'X';
    for (let index = 1; index < 1000; index += 1) {
      const candidate = index === 1 ? base : `${base}.${index}`;
      if (!(await taken(candidate))) return candidate;
    }
    throw new ConflictException('Не удалось подобрать код — укажите его вручную');
  }

  /** P2002 on a dictionary: say which field collides, the name or the code. */
  private dictionaryConflict(error: unknown, what: string, name: string, code: string) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      const target = String((error.meta as any)?.target ?? '');
      return new ConflictException(
        target.includes('code')
          ? `${what} с кодом ${code} уже есть`
          : `${what} «${name}» уже есть`,
      );
    }
    return error;
  }

  private sizeSystem(value: unknown): 'EU' | 'US' | 'UK' | 'OTHER' | undefined {
    const system = String(value ?? '').trim().toUpperCase();
    if (!system) return undefined;
    if (!['EU', 'US', 'UK', 'OTHER'].includes(system)) {
      throw new BadRequestException('Система размеров: EU, US, UK или OTHER');
    }
    return system as 'EU' | 'US' | 'UK' | 'OTHER';
  }

  private hexColor(value: unknown) {
    const hex = String(value ?? '').trim();
    if (!hex) return undefined;
    if (!/^#[0-9a-f]{6}$/i.test(hex)) {
      throw new BadRequestException('Цвет должен быть в формате #RRGGBB');
    }
    return hex.toUpperCase();
  }

  async listColors(requestContext: CompanyRequestContext) {
    const { companyId } = await this.requireApparelCompany(requestContext);
    return this.prisma.productColor.findMany({
      where: { companyId },
      orderBy: [{ isActive: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        code: true,
        name: true,
        nameRu: true,
        nameUz: true,
        hex: true,
        sortOrder: true,
        isActive: true,
        createdAt: true,
      },
    });
  }

  async createColor(
    body: Record<string, unknown>,
    requestContext: CompanyRequestContext,
  ) {
    const { companyId } = await this.requireApparelCompany(requestContext);
    const nameRu = this.requiredName(body.name_ru ?? body.name);
    const nameUz = this.optionalText(body.name_uz) || nameRu;
    const code = await this.resolveDictionaryCode(body.code, nameRu, async (candidate) =>
      Boolean(await this.prisma.productColor.findFirst({ where: { companyId, code: candidate }, select: { id: true } })),
    );
    // Older clients sent the colour picker value as "code".
    const hex = this.hexColor(body.hex ?? (String(body.code ?? '').startsWith('#') ? body.code : undefined));

    try {
      const created = await this.prisma.productColor.create({
        data: {
          companyId,
          code,
          name: nameRu,
          nameRu,
          nameUz,
          hex: hex ?? null,
          sortOrder: this.optionalInt(body.sort_order) ?? 100,
          isActive: body.is_active !== false,
        },
      });
      return this.toColor(created);
    } catch (error) {
      throw this.dictionaryConflict(error, 'Цвет', nameRu, code);
    }
  }

  async updateColor(
    id: string,
    body: Record<string, unknown>,
    requestContext: CompanyRequestContext,
  ) {
    const { companyId } = await this.requireApparelCompany(requestContext);
    const color = await this.prisma.productColor.findFirst({
      where: { id, companyId },
    });
    if (!color) throw new NotFoundException('Color not found');

    const data: Prisma.ProductColorUpdateInput = {};
    if (body.name !== undefined || body.name_ru !== undefined) {
      const nameRu = this.requiredName(body.name_ru ?? body.name);
      data.name = nameRu;
      data.nameRu = nameRu;
    }
    if (body.name_uz !== undefined)
      data.nameUz = this.optionalText(body.name_uz) || (data.nameRu as string) || color.nameRu;
    if (body.code !== undefined && String(body.code).trim())
      data.code = this.dictionaryCode(body.code);
    if (body.hex !== undefined) data.hex = this.hexColor(body.hex) ?? null;
    if (body.sort_order !== undefined)
      data.sortOrder = this.optionalInt(body.sort_order) ?? 0;
    if (body.is_active !== undefined) data.isActive = body.is_active === true;

    try {
      const updated = await this.prisma.productColor.update({
        where: { id },
        data,
      });
      return this.toColor(updated);
    } catch (error) {
      throw this.dictionaryConflict(error, 'Цвет', String(data.nameRu ?? color.name), String(data.code ?? color.code));
    }
  }

  async deleteColor(id: string, requestContext: CompanyRequestContext) {
    const { companyId } = await this.requireApparelCompany(requestContext);
    const color = await this.prisma.productColor.findFirst({
      where: { id, companyId },
    });
    if (!color) throw new NotFoundException('Color not found');

    const used = await this.prisma.productVariant.count({
      where: { colorId: id },
    });
    if (used) {
      throw new ConflictException(
        'Цвет используется в товарах — отключите его вместо удаления',
      );
    }
    await this.prisma.productColor.delete({ where: { id } });
    return { success: true };
  }

  // ---- Size management (for clothing/shoe stores) ---------------------------

  async listSizes(requestContext: CompanyRequestContext) {
    const { companyId } = await this.requireApparelCompany(requestContext);
    return this.prisma.productSize.findMany({
      where: { companyId },
      orderBy: [{ isActive: 'desc' }, { sortOrder: 'asc' }],
      select: {
        id: true,
        code: true,
        name: true,
        nameRu: true,
        nameUz: true,
        kind: true,
        sortOrder: true,
        isActive: true,
        createdAt: true,
      },
    });
  }

  async createSize(
    body: Record<string, unknown>,
    requestContext: CompanyRequestContext,
  ) {
    const { companyId } = await this.requireApparelCompany(requestContext);
    const nameRu = this.requiredName(body.name_ru ?? body.name);
    const nameUz = this.optionalText(body.name_uz) || nameRu;
    // The product form's quick add sends the grid as "type".
    const kind = (body.kind ?? body.type) === 'SHOES' ? 'SHOES' : 'CLOTHING';
    const code = await this.resolveDictionaryCode(
      body.code,
      // Shoe 42 and clothing 42 share the company's code space.
      kind === 'SHOES' && /^\d/.test(nameRu) ? `S${nameRu}` : nameRu,
      async (candidate) =>
        Boolean(await this.prisma.productSize.findFirst({ where: { companyId, code: candidate }, select: { id: true } })),
    );

    try {
      const created = await this.prisma.productSize.create({
        data: {
          companyId,
          code,
          name: nameRu,
          nameRu,
          nameUz,
          kind,
          // The size grids and the GET filter work by type.
          type: kind,
          system: this.sizeSystem(body.system),
          sortOrder: this.optionalInt(body.sort_order) ?? 100,
          isActive: body.is_active !== false,
        },
      });
      return this.toSize(created);
    } catch (error) {
      throw this.dictionaryConflict(error, 'Размер', nameRu, code);
    }
  }

  async updateSize(
    id: string,
    body: Record<string, unknown>,
    requestContext: CompanyRequestContext,
  ) {
    const { companyId } = await this.requireApparelCompany(requestContext);
    const size = await this.prisma.productSize.findFirst({
      where: { id, companyId },
    });
    if (!size) throw new NotFoundException('Size not found');

    const data: Prisma.ProductSizeUpdateInput = {};
    if (body.name !== undefined || body.name_ru !== undefined) {
      const nameRu = this.requiredName(body.name_ru ?? body.name);
      data.name = nameRu;
      data.nameRu = nameRu;
    }
    if (body.name_uz !== undefined)
      data.nameUz = this.optionalText(body.name_uz) || (data.nameRu as string) || size.nameRu;
    if (body.code !== undefined && String(body.code).trim())
      data.code = this.dictionaryCode(body.code);
    if (body.kind !== undefined || body.type !== undefined) {
      const kind = (body.kind ?? body.type) === 'SHOES' ? 'SHOES' : 'CLOTHING';
      data.kind = kind;
      data.type = kind;
    }
    if (body.system !== undefined) data.system = this.sizeSystem(body.system) ?? null;
    if (body.sort_order !== undefined)
      data.sortOrder = this.optionalInt(body.sort_order) ?? 0;
    if (body.is_active !== undefined) data.isActive = body.is_active === true;

    try {
      const updated = await this.prisma.productSize.update({
        where: { id },
        data,
      });
      return this.toSize(updated);
    } catch (error) {
      throw this.dictionaryConflict(error, 'Размер', String(data.nameRu ?? size.name), String(data.code ?? size.code));
    }
  }

  async deleteSize(id: string, requestContext: CompanyRequestContext) {
    const { companyId } = await this.requireApparelCompany(requestContext);
    const size = await this.prisma.productSize.findFirst({
      where: { id, companyId },
    });
    if (!size) throw new NotFoundException('Size not found');

    const used = await this.prisma.productVariant.count({
      where: { sizeId: id },
    });
    if (used) {
      throw new ConflictException(
        'Размер используется в товарах — отключите его вместо удаления',
      );
    }
    await this.prisma.productSize.delete({ where: { id } });
    return { success: true };
  }

  private toColor(color: Prisma.ProductColorGetPayload<true>) {
    return {
      id: color.id,
      code: color.code,
      name: color.name,
      name_ru: color.nameRu ?? color.name,
      name_uz: color.nameUz ?? color.name,
      hex: color.hex,
      sort_order: color.sortOrder,
      is_active: color.isActive,
      created_at: color.createdAt,
    };
  }

  private toSize(size: Prisma.ProductSizeGetPayload<true>) {
    return {
      id: size.id,
      code: size.code,
      name: size.name,
      name_ru: size.nameRu ?? size.name,
      name_uz: size.nameUz ?? size.name,
      kind: size.kind,
      sort_order: size.sortOrder,
      is_active: size.isActive,
      created_at: size.createdAt,
    };
  }

  async listSeasons(requestContext: CompanyRequestContext) {
    const { companyId } = await this.requireApparelCompany(requestContext);
    const rows = await this.prisma.productSeasonOption.findMany({
      where: { companyId },
      orderBy: [{ isActive: 'desc' }, { sortOrder: 'asc' }],
    });
    return rows.map((row) => this.toSeason(row));
  }

  async createSeason(
    body: Record<string, unknown>,
    requestContext: CompanyRequestContext,
  ) {
    const { companyId } = await this.requireApparelCompany(requestContext);
    const nameRu = this.requiredName(body.name_ru ?? body.name);
    const code = await this.resolveDictionaryCode(body.code, nameRu, async (candidate) =>
      Boolean(
        await this.prisma.productSeasonOption.findFirst({ where: { companyId, code: candidate }, select: { id: true } }),
      ),
    );
    try {
      const row = await this.prisma.productSeasonOption.create({
        data: {
          companyId,
          code,
          nameRu,
          nameUz: this.optionalText(body.name_uz) || nameRu,
          sortOrder: this.optionalInt(body.sort_order) ?? 100,
          isActive: body.is_active !== false,
        },
      });
      return this.toSeason(row);
    } catch (error) {
      throw this.dictionaryConflict(error, 'Сезон', nameRu, code);
    }
  }

  async updateSeason(
    id: string,
    body: Record<string, unknown>,
    requestContext: CompanyRequestContext,
  ) {
    const { companyId } = await this.requireApparelCompany(requestContext);
    const current = await this.prisma.productSeasonOption.findFirst({
      where: { id, companyId },
    });
    if (!current) throw new NotFoundException('Season not found');
    const data: Prisma.ProductSeasonOptionUpdateInput = {};
    if (body.name_ru !== undefined || body.name !== undefined)
      data.nameRu = this.requiredName(body.name_ru ?? body.name);
    if (body.name_uz !== undefined)
      data.nameUz = this.optionalText(body.name_uz) || (data.nameRu as string) || current.nameRu;
    if (body.sort_order !== undefined)
      data.sortOrder = this.optionalInt(body.sort_order) ?? 0;
    if (body.is_active !== undefined) data.isActive = body.is_active === true;
    return this.toSeason(
      await this.prisma.productSeasonOption.update({ where: { id }, data }),
    );
  }

  async deleteSeason(id: string, requestContext: CompanyRequestContext) {
    const { companyId } = await this.requireApparelCompany(requestContext);
    const current = await this.prisma.productSeasonOption.findFirst({
      where: { id, companyId },
    });
    if (!current) throw new NotFoundException('Season not found');
    if (
      await this.prisma.product.count({
        where: { companyId, seasonOptionId: id },
      })
    ) {
      throw new ConflictException(
        'Сезон используется в товарах — отключите его вместо удаления',
      );
    }
    await this.prisma.productSeasonOption.delete({ where: { id } });
    return { success: true };
  }

  private toSeason(season: Prisma.ProductSeasonOptionGetPayload<true>) {
    return {
      id: season.id,
      code: season.code,
      name_ru: season.nameRu,
      name_uz: season.nameUz,
      sort_order: season.sortOrder,
      is_active: season.isActive,
      created_at: season.createdAt,
    };
  }
}

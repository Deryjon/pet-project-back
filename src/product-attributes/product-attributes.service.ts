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
// ProductColor/ProductSize by DB triggers (legacySource), so their options
// are edited through the product-colors / product-sizes endpoints only.
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
        'code must contain only latin letters, digits and _',
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

  private dictionaryCode(value: unknown, field = 'code') {
    const code = this.requireText(value, field).toUpperCase();
    if (!/^[A-Z0-9.]{1,20}$/.test(code)) {
      throw new BadRequestException(
        `${field} must contain only latin letters, digits and .`,
      );
    }
    return code;
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
    const nameRu = this.requireText(body.name_ru ?? body.name, 'name_ru');
    const nameUz = this.requireText(
      body.name_uz ?? body.name ?? nameRu,
      'name_uz',
    );
    const code = this.dictionaryCode(body.code);

    try {
      const created = await this.prisma.productColor.create({
        data: {
          companyId,
          code,
          name: nameRu,
          nameRu,
          nameUz,
          hex: this.optionalText(body.hex),
          sortOrder: this.optionalInt(body.sort_order) ?? 100,
          isActive: body.is_active !== false,
        },
      });
      return this.toColor(created);
    } catch (error) {
      throw this.uniqueConflict(error, `Цвет с кодом ${code} уже существует`);
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
      const nameRu = this.requireText(body.name_ru ?? body.name, 'name_ru');
      data.name = nameRu;
      data.nameRu = nameRu;
    }
    if (body.name_uz !== undefined)
      data.nameUz = this.requireText(body.name_uz, 'name_uz');
    if (body.hex !== undefined) data.hex = this.optionalText(body.hex);
    if (body.sort_order !== undefined)
      data.sortOrder = this.optionalInt(body.sort_order) ?? 0;
    if (body.is_active !== undefined) data.isActive = body.is_active === true;

    const updated = await this.prisma.productColor.update({
      where: { id },
      data,
    });
    return this.toColor(updated);
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
    const nameRu = this.requireText(body.name_ru ?? body.name, 'name_ru');
    const nameUz = this.requireText(
      body.name_uz ?? body.name ?? nameRu,
      'name_uz',
    );
    const code = this.dictionaryCode(body.code);

    const kind = body.kind === 'SHOES' ? 'SHOES' : 'CLOTHING';

    try {
      const created = await this.prisma.productSize.create({
        data: {
          companyId,
          code,
          name: nameRu,
          nameRu,
          nameUz,
          kind,
          type: 'OTHER',
          sortOrder: this.optionalInt(body.sort_order) ?? 100,
          isActive: body.is_active !== false,
        },
      });
      return this.toSize(created);
    } catch (error) {
      throw this.uniqueConflict(error, `Размер с кодом ${code} уже существует`);
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
      const nameRu = this.requireText(body.name_ru ?? body.name, 'name_ru');
      data.name = nameRu;
      data.nameRu = nameRu;
    }
    if (body.name_uz !== undefined)
      data.nameUz = this.requireText(body.name_uz, 'name_uz');
    if (body.sort_order !== undefined)
      data.sortOrder = this.optionalInt(body.sort_order) ?? 0;
    if (body.is_active !== undefined) data.isActive = body.is_active === true;

    const updated = await this.prisma.productSize.update({
      where: { id },
      data,
    });
    return this.toSize(updated);
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
    const code = this.dictionaryCode(body.code);
    try {
      const row = await this.prisma.productSeasonOption.create({
        data: {
          companyId,
          code,
          nameRu: this.requireText(body.name_ru ?? body.name, 'name_ru'),
          nameUz: this.requireText(body.name_uz ?? body.name, 'name_uz'),
          sortOrder: this.optionalInt(body.sort_order) ?? 100,
          isActive: body.is_active !== false,
        },
      });
      return this.toSeason(row);
    } catch (error) {
      throw this.uniqueConflict(error, `Сезон с кодом ${code} уже существует`);
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
      data.nameRu = this.requireText(body.name_ru ?? body.name, 'name_ru');
    if (body.name_uz !== undefined)
      data.nameUz = this.requireText(body.name_uz, 'name_uz');
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

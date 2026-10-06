import { AttributeKind, Prisma } from '@prisma/client';
import { BusinessType } from './product-feature-settings';

// Starting attributes per business type. A preset only adds what is missing:
// it never removes or renames attributes the tenant already has, so it is
// safe to apply again when the business type changes.

type PresetAttribute = {
  code: string;
  name: string;
  kind: AttributeKind;
  isVariantAxis: boolean;
  sortOrder: number;
  options?: string[];
};

type BusinessPreset = {
  // Colour/size definitions mirrored from the ProductColor/ProductSize dictionaries.
  legacyCodes: Array<'color' | 'size_clothing' | 'size_shoes'>;
  attributes: PresetAttribute[];
};

export const BUSINESS_PRESETS: Record<BusinessType, BusinessPreset> = {
  clothing_store: {
    legacyCodes: ['color', 'size_clothing', 'size_shoes'],
    attributes: [
      {
        code: 'material',
        name: 'Материал',
        kind: 'TEXT',
        isVariantAxis: false,
        sortOrder: 20,
      },
    ],
  },
  accessories_store: {
    legacyCodes: ['color'],
    attributes: [
      {
        code: 'device_model',
        name: 'Модель устройства',
        kind: 'SELECT',
        isVariantAxis: true,
        sortOrder: 10,
      },
      {
        code: 'connector',
        name: 'Разъём',
        kind: 'SELECT',
        isVariantAxis: false,
        sortOrder: 20,
        options: ['USB-C', 'Lightning', 'Micro-USB', 'AUX 3.5'],
      },
      {
        code: 'power',
        name: 'Мощность, Вт',
        kind: 'NUMBER',
        isVariantAxis: false,
        sortOrder: 30,
      },
    ],
  },
  general_store: { legacyCodes: [], attributes: [] },
};

type PresetClient = Pick<
  Prisma.TransactionClient,
  'attributeDefinition' | 'attributeOption' | '$queryRaw'
>;

export async function applyBusinessPreset(
  db: PresetClient,
  companyId: string,
  type: BusinessType,
) {
  const preset = BUSINESS_PRESETS[type];
  for (const code of preset.legacyCodes) {
    // Same function the colour/size mirror triggers use.
    await db.$queryRaw`SELECT attr_legacy_definition(${companyId}, ${code})`;
  }
  for (const attribute of preset.attributes) {
    const definition = await db.attributeDefinition.upsert({
      where: { companyId_code: { companyId, code: attribute.code } },
      create: {
        companyId,
        code: attribute.code,
        name: attribute.name,
        kind: attribute.kind,
        isVariantAxis: attribute.isVariantAxis,
        sortOrder: attribute.sortOrder,
      },
      update: {},
      select: { id: true },
    });
    if (attribute.options?.length) {
      await db.attributeOption.createMany({
        data: attribute.options.map((value, index) => ({
          companyId,
          definitionId: definition.id,
          value,
          sortOrder: index,
        })),
        skipDuplicates: true,
      });
    }
  }
}

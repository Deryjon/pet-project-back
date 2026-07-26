import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateChequeSettingsDto } from './dto/update-cheque-settings.dto';
import {
  ChequeBlockDefinition,
  DEFAULT_CHEQUE_BLOCKS,
  reconcileChequeBlocks,
} from './cheque-blocks.constant';

interface ReceiptItemSnapshot {
  name: string;
  sku: string;
  quantity: number;
  price: number;
  total: number;
  discount: number;
}

function firstPhoneNumber(raw: unknown): string {
  if (!Array.isArray(raw) || raw.length === 0) return '';
  const first = raw[0] as unknown;
  if (typeof first === 'string') return first;
  if (first && typeof first === 'object') {
    const obj = first as Record<string, unknown>;
    const val = obj.number ?? obj.phone ?? obj.value;
    if (typeof val === 'string') return val;
  }
  return '';
}

function formatWorkingHours(raw: unknown): string {
  if (typeof raw === 'string') return raw;
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    const from = obj.from ?? obj.open ?? obj.start;
    const to = obj.to ?? obj.close ?? obj.end;
    if (typeof from === 'string' && typeof to === 'string') return `${from} – ${to}`;
  }
  return '';
}

@Injectable()
export class ReceiptsService {
  constructor(private readonly prisma: PrismaService) {}

  private async resolveShop(shopIdOrCode: string, companyId: string) {
    return this.prisma.shop.findFirst({
      where: {
        companyId,
        OR: [{ id: shopIdOrCode }, { branchCode: shopIdOrCode }],
      },
    });
  }

  private async getShopInfo(shopId: string | null) {
    if (!shopId) return null;
    const shop = await this.prisma.shop.findUnique({ where: { id: shopId } });
    if (!shop) return null;
    return {
      name: shop.name,
      address: shop.address ?? '',
      phone: firstPhoneNumber(shop.phoneNumbers),
      working_hours: formatWorkingHours(shop.workingHours),
      facebook: shop.facebook ?? '',
      instagram: shop.instagram ?? '',
      telegram: shop.telegram ?? '',
      website: shop.website ?? '',
    };
  }

  private async getCompanyLegalInfo(companyId: string) {
    const profile = await this.prisma.companyProfileSetting.findUnique({
      where: { companyId },
    });
    const data = (profile?.data ?? {}) as Record<string, unknown>;
    return {
      legal_name: typeof data.legal_name === 'string' ? data.legal_name : '',
      tax_id: typeof data.inn === 'string' ? data.inn : '',
    };
  }

  private async loadSaleForSnapshot(saleId: number, companyId: string) {
    const sale = await this.prisma.sale.findFirst({
      where: { id: saleId, companyId },
      include: {
        items: true,
        user: true,
        client: true,
        clientDebts: true,
      },
    });

    if (!sale) {
      throw new NotFoundException('Sale not found');
    }

    return sale;
  }

  private async buildSnapshot(
    sale: Awaited<ReturnType<ReceiptsService['loadSaleForSnapshot']>>,
    companyId: string,
  ) {
    const paymentTypes = await this.prisma.companyPaymentType.findMany({
      where: { companyId },
    });
    const isCash = (paymentMethodId: string | null) =>
      paymentMethodId
        ? (paymentTypes.find((pt) => pt.id === paymentMethodId)?.isCashPaymentType ?? false)
        : false;

    const payments: Array<{ payment_method: string; amount: number }> =
      Array.isArray(sale.extraPayments) && (sale.extraPayments as unknown[]).length > 1
        ? (sale.extraPayments as Array<{ payment_method: string; amount: number }>)
        : sale.paymentMethod
          ? [{ payment_method: sale.paymentMethod, amount: sale.payableTotal }]
          : [];

    let paidCash = 0;
    let paidCard = 0;
    for (const p of payments) {
      if (isCash(p.payment_method)) {
        paidCash += p.amount;
      } else {
        paidCard += p.amount;
      }
    }

    const debt = sale.clientDebts.reduce(
      (sum, d) => sum + Number(d.remainingAmountUzs ?? 0),
      0,
    );

    const subtotal = sale.items.reduce((sum, item) => sum + item.lineTotal, 0);

    const loyalty = await this.prisma.loyaltyProgramSetting.findUnique({
      where: { companyId },
    });
    const cashbackEarned =
      loyalty?.isActive && loyalty.cashbackPercent > 0
        ? (sale.payableTotal * loyalty.cashbackPercent) / 100
        : 0;

    const items: ReceiptItemSnapshot[] = sale.items.map((item) => ({
      name: item.name,
      sku: item.sku ?? item.barcode ?? '',
      quantity: item.quantity,
      price: item.salePrice,
      total: item.finalPrice || item.lineTotal,
      discount: item.discountAmount ?? 0,
    }));

    // Balance/debt breakdown for this sale, derived from the client's current
    // (post-sale) totals minus the delta this sale caused — so it's exact at
    // the moment the receipt is first created, then frozen forever after.
    const paidCashback = 0;
    let balanceAfter = 0;
    let balanceAdded = 0;
    let balanceDeducted = 0;
    let balanceBefore = 0;
    let debtAfter = 0;
    let debtAdded = 0;
    const debtPaid = 0;
    let debtBefore = 0;

    if (sale.client) {
      balanceAfter = Number(sale.client.balanceUzs);
      balanceAdded = cashbackEarned;
      balanceDeducted = paidCashback;
      balanceBefore = balanceAfter - balanceAdded + balanceDeducted;

      debtAfter = Number(sale.client.debtUzs);
      debtAdded = debt;
      debtBefore = debtAfter - debtAdded + debtPaid;
    }

    return {
      items,
      subtotal,
      discount: sale.discountAmount,
      totalDue: sale.payableTotal,
      paidCash,
      paidCard,
      paidCashback,
      debt,
      cashbackEarned,
      balanceBefore,
      balanceAdded,
      balanceDeducted,
      balanceAfter,
      debtBefore,
      debtAdded,
      debtPaid,
      debtAfter,
    };
  }

  async getOrCreateForSale(saleId: number, companyId: string) {
    const sale = await this.loadSaleForSnapshot(saleId, companyId);

    let receipt = await this.prisma.receipt.findUnique({
      where: { saleId: sale.id },
    });

    if (!receipt) {
      const shop = sale.branchCode
        ? await this.resolveShop(sale.branchCode, companyId)
        : null;
      const snapshot = await this.buildSnapshot(sale, companyId);

      receipt = await this.prisma.receipt.create({
        data: {
          saleId: sale.id,
          companyId,
          shopId: shop?.id ?? null,
          branchCode: sale.branchCode ?? null,
          number: sale.number,
          managerName: sale.user
            ? `${sale.user.firstName} ${sale.user.lastName}`.trim()
            : null,
          managerPhone: sale.user?.phoneNumber ?? null,
          clientName: sale.client
            ? `${sale.client.firstName} ${sale.client.lastName ?? ''}`.trim()
            : (sale.clientName ?? null),
          clientPhone: sale.client?.phone ?? null,
          cashbackEarned: snapshot.cashbackEarned,
          qrPayload: `${process.env.FRONTEND_URL ?? ''}/order/all?receipt=${encodeURIComponent(sale.number)}`,
          items: snapshot.items as any,
          subtotal: snapshot.subtotal,
          discount: snapshot.discount,
          totalDue: snapshot.totalDue,
          paidCash: snapshot.paidCash,
          paidCard: snapshot.paidCard,
          paidCashback: snapshot.paidCashback,
          debt: snapshot.debt,
          balanceBefore: snapshot.balanceBefore,
          balanceAdded: snapshot.balanceAdded,
          balanceDeducted: snapshot.balanceDeducted,
          balanceAfter: snapshot.balanceAfter,
          debtBefore: snapshot.debtBefore,
          debtAdded: snapshot.debtAdded,
          debtPaid: snapshot.debtPaid,
          debtAfter: snapshot.debtAfter,
        },
      });
    } else if (receipt.items === null) {
      // legacy row created before the snapshot columns existed — backfill once,
      // from the same sale data it would have been created from originally,
      // then never touch it again.
      const snapshot = await this.buildSnapshot(sale, companyId);
      receipt = await this.prisma.receipt.update({
        where: { saleId: sale.id },
        data: {
          items: snapshot.items as any,
          subtotal: snapshot.subtotal,
          discount: snapshot.discount,
          totalDue: snapshot.totalDue,
          paidCash: snapshot.paidCash,
          paidCard: snapshot.paidCard,
          paidCashback: snapshot.paidCashback,
          debt: snapshot.debt,
          balanceBefore: snapshot.balanceBefore,
          balanceAdded: snapshot.balanceAdded,
          balanceDeducted: snapshot.balanceDeducted,
          balanceAfter: snapshot.balanceAfter,
          debtBefore: snapshot.debtBefore,
          debtAdded: snapshot.debtAdded,
          debtPaid: snapshot.debtPaid,
          debtAfter: snapshot.debtAfter,
        },
      });
    }

    const [shopInfo, companyInfo] = await Promise.all([
      this.getShopInfo(receipt.shopId),
      this.getCompanyLegalInfo(companyId),
    ]);

    return this.assembleResponse(sale, receipt, shopInfo, companyInfo);
  }

  async getByNumber(number: string, companyId: string) {
    const sale = await this.prisma.sale.findFirst({
      where: { number, companyId },
      select: { id: true },
    });

    if (!sale) {
      throw new NotFoundException('Sale not found');
    }

    return this.getOrCreateForSale(sale.id, companyId);
  }

  async markPrinted(saleId: number, companyId: string) {
    await this.getOrCreateForSale(saleId, companyId);
    const updated = await this.prisma.receipt.update({
      where: { saleId },
      data: { status: 'PRINTED', printedAt: new Date() },
    });

    return { id: updated.id, status: updated.status, printed_at: updated.printedAt };
  }

  private async getOrCreateChequeSettings(companyId: string) {
    const existing = await this.prisma.chequeSettings.findUnique({
      where: { companyId },
    });

    if (!existing) {
      return this.prisma.chequeSettings.create({
        data: { companyId, blocks: DEFAULT_CHEQUE_BLOCKS as any },
      });
    }

    const reconciled = reconcileChequeBlocks(existing.blocks);
    const changed = JSON.stringify(reconciled) !== JSON.stringify(existing.blocks);
    if (!changed) {
      return existing;
    }

    return this.prisma.chequeSettings.update({
      where: { companyId },
      data: { blocks: reconciled as any },
    });
  }

  async getChequeSettings(companyId: string) {
    const settings = await this.getOrCreateChequeSettings(companyId);
    return this.toSettingsResponse(settings);
  }

  async updateChequeSettings(companyId: string, dto: UpdateChequeSettingsDto) {
    const current = await this.getOrCreateChequeSettings(companyId);
    const patch = this.toPatch(dto);

    if (dto.blocks) {
      const blocks = reconcileChequeBlocks(current.blocks);
      const byKey = new Map(blocks.map((b) => [b.key, b]));
      for (const item of dto.blocks) {
        const existing = byKey.get(item.key);
        if (!existing) continue;
        if (item.is_active !== undefined) existing.isActive = item.is_active;
        if (item.sequence_number !== undefined) existing.sequenceNumber = item.sequence_number;
      }
      patch.blocks = Array.from(byKey.values());
    }

    const updated = await this.prisma.chequeSettings.update({
      where: { companyId },
      data: patch,
    });

    return this.toSettingsResponse(updated);
  }

  private toPatch(dto: UpdateChequeSettingsDto) {
    const patch: Record<string, unknown> = {};
    if (dto.has_information_block !== undefined) patch.hasInformationBlock = dto.has_information_block;
    if (dto.has_lower_block !== undefined) patch.hasLowerBlock = dto.has_lower_block;
    if (dto.paper_width !== undefined) patch.paperWidth = dto.paper_width;
    if (dto.font_size !== undefined) patch.fontSize = dto.font_size;
    if (dto.divider_style !== undefined) patch.dividerStyle = dto.divider_style;
    if (dto.divider_gap !== undefined) patch.dividerGap = dto.divider_gap;
    if (dto.section_gap !== undefined) patch.sectionGap = dto.section_gap;
    if (dto.item_dividers !== undefined) patch.itemDividers = dto.item_dividers;
    if (dto.has_logo !== undefined) patch.hasLogo = dto.has_logo;
    if (dto.logo_url !== undefined) patch.logoUrl = dto.logo_url;
    if (dto.footer_message !== undefined) patch.footerMessage = dto.footer_message;
    if (dto.footer_note !== undefined) patch.footerNote = dto.footer_note;
    if (dto.qr_code_url !== undefined) patch.qrCodeUrl = dto.qr_code_url;
    if (dto.element_styles !== undefined) patch.elementStyles = dto.element_styles;
    return patch;
  }

  private toSettingsResponse(settings: {
    hasInformationBlock: boolean;
    hasLowerBlock: boolean;
    paperWidth: number;
    fontSize: number;
    dividerStyle: string;
    dividerGap: number;
    sectionGap: number;
    itemDividers: boolean;
    hasLogo: boolean;
    logoUrl: string;
    footerMessage: string;
    footerNote: string;
    qrCodeUrl: string;
    elementStyles: unknown;
    blocks: unknown;
  }) {
    const blocks = reconcileChequeBlocks(settings.blocks)
      .sort((a, b) => a.sequenceNumber - b.sequenceNumber)
      .map((b: ChequeBlockDefinition) => ({
        key: b.key,
        block_type: b.blockType,
        name: b.name,
        sequence_number: b.sequenceNumber,
        is_active: b.isActive,
      }));

    return {
      has_information_block: settings.hasInformationBlock,
      has_lower_block: settings.hasLowerBlock,
      paper_width: settings.paperWidth,
      font_size: settings.fontSize,
      divider_style: settings.dividerStyle,
      divider_gap: settings.dividerGap,
      section_gap: settings.sectionGap,
      item_dividers: settings.itemDividers,
      has_logo: settings.hasLogo,
      logo_url: settings.logoUrl,
      footer_message: settings.footerMessage,
      footer_note: settings.footerNote,
      qr_code_url: settings.qrCodeUrl,
      element_styles: settings.elementStyles ?? null,
      blocks,
    };
  }

  private assembleResponse(
    sale: { id: number; createdAt: Date },
    receipt: {
      id: string;
      number: string;
      status: string;
      shopId: string | null;
      branchCode: string | null;
      managerName: string | null;
      managerPhone: string | null;
      clientName: string | null;
      clientPhone: string | null;
      items: unknown;
      subtotal: number;
      discount: number;
      cashbackEarned: number;
      totalDue: number;
      paidCash: number;
      paidCard: number;
      paidCashback: number;
      debt: number;
      balanceBefore: number;
      balanceAdded: number;
      balanceDeducted: number;
      balanceAfter: number;
      debtBefore: number;
      debtAdded: number;
      debtPaid: number;
      debtAfter: number;
      qrPayload: string | null;
      printedAt: Date | null;
      sentAt: Date | null;
    },
    shopInfo: Awaited<ReturnType<ReceiptsService['getShopInfo']>>,
    companyInfo: Awaited<ReturnType<ReceiptsService['getCompanyLegalInfo']>>,
  ) {
    return {
      id: receipt.id,
      sale_id: sale.id,
      number: receipt.number,
      status: receipt.status,
      created_at: sale.createdAt,
      shop_id: receipt.shopId,
      branch_code: receipt.branchCode,
      manager_name: receipt.managerName,
      manager_phone: receipt.managerPhone,
      client_name: receipt.clientName,
      client_phone: receipt.clientPhone,
      items: Array.isArray(receipt.items) ? receipt.items : [],
      subtotal: receipt.subtotal,
      discount: receipt.discount,
      cashback_earned: receipt.cashbackEarned,
      total_due: receipt.totalDue,
      paid_cash: receipt.paidCash,
      paid_card: receipt.paidCard,
      paid_cashback: receipt.paidCashback,
      debt: receipt.debt,
      balance_before: receipt.balanceBefore,
      balance_added: receipt.balanceAdded,
      balance_deducted: receipt.balanceDeducted,
      balance_after: receipt.balanceAfter,
      debt_before: receipt.debtBefore,
      debt_added: receipt.debtAdded,
      debt_paid: receipt.debtPaid,
      debt_after: receipt.debtAfter,
      qr_payload: receipt.qrPayload,
      printed_at: receipt.printedAt,
      sent_at: receipt.sentAt,
      shop: shopInfo,
      company: companyInfo,
    };
  }
}

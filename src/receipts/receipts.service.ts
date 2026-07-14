import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateReceiptSettingsDto } from './dto/update-receipt-settings.dto';

interface ReceiptItemSnapshot {
  name: string;
  sku: string;
  quantity: number;
  price: number;
  total: number;
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
    }));

    return {
      items,
      subtotal,
      discount: sale.discountAmount,
      totalDue: sale.payableTotal,
      paidCash,
      paidCard,
      paidCashback: 0,
      debt,
      cashbackEarned,
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
        },
      });
    }

    return this.assembleResponse(sale, receipt);
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

  async getReceiptSettings(shopIdOrCode: string, companyId: string) {
    const shop = await this.resolveShop(shopIdOrCode, companyId);
    const settings = shop
      ? await this.prisma.receiptSettings.findUnique({
          where: { shopId: shop.id },
        })
      : null;

    return this.toSettingsResponse(settings, shop?.id ?? shopIdOrCode);
  }

  async updateReceiptSettings(
    shopIdOrCode: string,
    dto: UpdateReceiptSettingsDto,
    companyId: string,
  ) {
    const shop = await this.resolveShop(shopIdOrCode, companyId);
    if (!shop) {
      throw new NotFoundException('Shop not found');
    }

    const patch = this.toPatch(dto);
    const settings = await this.prisma.receiptSettings.upsert({
      where: { shopId: shop.id },
      create: { companyId, shopId: shop.id, ...patch },
      update: patch,
    });

    return this.toSettingsResponse(settings, shop.id);
  }

  private toPatch(dto: UpdateReceiptSettingsDto) {
    const patch: Record<string, unknown> = {};
    if (dto.show_client_info !== undefined) patch.showClientInfo = dto.show_client_info;
    if (dto.show_manager_name !== undefined) patch.showManagerName = dto.show_manager_name;
    if (dto.show_manager_phone !== undefined) patch.showManagerPhone = dto.show_manager_phone;
    if (dto.show_cashback !== undefined) patch.showCashback = dto.show_cashback;
    if (dto.show_debt_line !== undefined) patch.showDebtLine = dto.show_debt_line;
    if (dto.show_qr_code !== undefined) patch.showQrCode = dto.show_qr_code;
    if (dto.show_item_index !== undefined) patch.showItemIndex = dto.show_item_index;
    if (dto.paper_width !== undefined) patch.paperWidth = dto.paper_width;
    if (dto.font_size !== undefined) patch.fontSize = dto.font_size;
    if (dto.divider_style !== undefined) patch.dividerStyle = dto.divider_style;
    if (dto.divider_gap !== undefined) patch.dividerGap = dto.divider_gap;
    if (dto.section_gap !== undefined) patch.sectionGap = dto.section_gap;
    if (dto.item_dividers !== undefined) patch.itemDividers = dto.item_dividers;
    if (dto.footer_message !== undefined) patch.footerMessage = dto.footer_message;
    if (dto.footer_note !== undefined) patch.footerNote = dto.footer_note;
    if (dto.has_logo !== undefined) patch.hasLogo = dto.has_logo;
    if (dto.logo_url !== undefined) patch.logoUrl = dto.logo_url;
    if (dto.has_bar_code !== undefined) patch.hasBarCode = dto.has_bar_code;
    if (dto.branch_name !== undefined) patch.branchName = dto.branch_name;
    if (dto.has_branch_name !== undefined) patch.hasBranchName = dto.has_branch_name;
    if (dto.address !== undefined) patch.address = dto.address;
    if (dto.has_address !== undefined) patch.hasAddress = dto.has_address;
    if (dto.phone !== undefined) patch.phone = dto.phone;
    if (dto.has_phone !== undefined) patch.hasPhone = dto.has_phone;
    if (dto.working_hours !== undefined) patch.workingHours = dto.working_hours;
    if (dto.has_working_hours !== undefined) patch.hasWorkingHours = dto.has_working_hours;
    if (dto.website !== undefined) patch.website = dto.website;
    if (dto.has_website !== undefined) patch.hasWebsite = dto.has_website;
    if (dto.tax_id !== undefined) patch.taxId = dto.tax_id;
    if (dto.has_tax_id !== undefined) patch.hasTaxId = dto.has_tax_id;
    if (dto.qr_code_url !== undefined) patch.qrCodeUrl = dto.qr_code_url;
    if (dto.has_customer_debt !== undefined) patch.hasCustomerDebt = dto.has_customer_debt;
    if (dto.has_customer_balance !== undefined) patch.hasCustomerBalance = dto.has_customer_balance;
    if (dto.element_styles !== undefined) patch.elementStyles = dto.element_styles;
    return patch;
  }

  private toSettingsResponse(settings: any, shopId: string) {
    const s = settings ?? {
      showClientInfo: true,
      showManagerName: true,
      showManagerPhone: false,
      showCashback: true,
      showDebtLine: true,
      showQrCode: false,
      showItemIndex: true,
      paperWidth: 80,
      fontSize: 13,
      dividerStyle: 'single',
      dividerGap: 8,
      sectionGap: 12,
      itemDividers: false,
      footerMessage: '',
      footerNote: '',
      hasLogo: false,
      logoUrl: '',
      hasBarCode: false,
      branchName: '',
      hasBranchName: false,
      address: '',
      hasAddress: false,
      phone: '',
      hasPhone: false,
      workingHours: '',
      hasWorkingHours: false,
      website: '',
      hasWebsite: false,
      taxId: '',
      hasTaxId: false,
      qrCodeUrl: '',
      hasCustomerDebt: false,
      hasCustomerBalance: false,
      elementStyles: null,
    };

    return {
      shop_id: shopId,
      show_client_info: s.showClientInfo,
      show_manager_name: s.showManagerName,
      show_manager_phone: s.showManagerPhone,
      show_cashback: s.showCashback,
      show_debt_line: s.showDebtLine,
      show_qr_code: s.showQrCode,
      show_item_index: s.showItemIndex,
      paper_width: s.paperWidth,
      font_size: s.fontSize,
      divider_style: s.dividerStyle,
      divider_gap: s.dividerGap,
      section_gap: s.sectionGap,
      item_dividers: s.itemDividers,
      footer_message: s.footerMessage,
      footer_note: s.footerNote,
      has_logo: s.hasLogo,
      logo_url: s.logoUrl,
      has_bar_code: s.hasBarCode,
      branch_name: s.branchName,
      has_branch_name: s.hasBranchName,
      address: s.address,
      has_address: s.hasAddress,
      phone: s.phone,
      has_phone: s.hasPhone,
      working_hours: s.workingHours,
      has_working_hours: s.hasWorkingHours,
      website: s.website,
      has_website: s.hasWebsite,
      tax_id: s.taxId,
      has_tax_id: s.hasTaxId,
      qr_code_url: s.qrCodeUrl,
      has_customer_debt: s.hasCustomerDebt,
      has_customer_balance: s.hasCustomerBalance,
      element_styles: s.elementStyles ?? null,
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
      qrPayload: string | null;
      printedAt: Date | null;
      sentAt: Date | null;
    },
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
      qr_payload: receipt.qrPayload,
      printed_at: receipt.printedAt,
      sent_at: receipt.sentAt,
    };
  }
}

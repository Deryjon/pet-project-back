import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UsersService } from '../../users/users.service';
import { AddOrderItemDto } from './dto/add-order-item.dto';
import { AddPaymentDto } from './dto/add-payment.dto';
import { ApplyDiscountDto } from './dto/apply-discount.dto';
import { AttachCustomerDto } from './dto/attach-customer.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderCommentDto } from './dto/update-order-comment.dto';
import { UpdateOrderItemDto } from './dto/update-order-item.dto';

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
  ) {}

  async createDraft(dto: CreateOrderDto, authorization?: string) {
    const context = await this.getCompanyContext(authorization);
    const shop = await this.findAccessibleShop(dto.shopId, context);
    const cashbox = dto.cashboxId
      ? await this.findCashboxOrThrow(dto.cashboxId, shop.id, context.companyId)
      : null;

    const order = await this.prisma.$transaction(async (tx) => {
      const orderNumber = await this.generateOrderNumber(context.companyId, tx);

      const createdOrder = await tx.order.create({
        data: {
          companyId: context.companyId,
          shopId: shop.id,
          cashboxId: cashbox?.id,
          userId: context.userId,
          orderNumber,
        },
        include: this.orderInclude(),
      });

      await this.createAuditLog(
        tx,
        context,
        'order.created',
        'Order',
        createdOrder.id,
        {
          orderNumber: createdOrder.orderNumber,
          shopId: createdOrder.shopId,
          cashboxId: createdOrder.cashboxId,
        },
      );

      return createdOrder;
    });

    return this.toOrderResponse(order);
  }

  async findOne(id: string, authorization?: string) {
    const context = await this.getCompanyContext(authorization);
    const order = await this.prisma.order.findFirst({
      where: {
        id,
        companyId: context.companyId,
      },
      include: this.orderInclude(),
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (!context.allowedShopIds.includes(order.shopId)) {
      throw new NotFoundException('Order not found');
    }

    return this.toOrderResponse(order);
  }

  async addItem(id: string, dto: AddOrderItemDto, authorization?: string) {
    const context = await this.getCompanyContext(authorization);
    const order = await this.findEditableOrderOrThrow(id, context);
    const product = await this.findProductForOrderOrThrow(
      dto.productId,
      context.companyId,
    );
    const quantity = this.toPositiveDecimal(dto.quantity, 'quantity');
    const price = this.resolveProductSalePrice(product);

    const updatedOrder = await this.prisma.$transaction(async (tx) => {
      const existingItem = await tx.orderItem.findUnique({
        where: {
          orderId_productId: {
            orderId: order.id,
            productId: product.id,
          },
        },
      });

      if (existingItem) {
        const nextQuantity = existingItem.quantity.plus(quantity);
        await tx.orderItem.update({
          where: {
            id: existingItem.id,
          },
          data: {
            quantity: nextQuantity,
            price,
            totalPrice: this.calculateItemTotal(
              nextQuantity,
              price,
              existingItem.discountAmount,
            ),
          },
        });
      } else {
        await tx.orderItem.create({
          data: {
            orderId: order.id,
            productId: product.id,
            quantity,
            price,
            totalPrice: this.calculateItemTotal(quantity, price),
          },
        });
      }

      await this.recalculateOrderTotals(order.id, tx);
      await this.createAuditLog(
        tx,
        context,
        'order.item_added',
        'Order',
        order.id,
        {
          productId: product.id,
          quantity: quantity.toString(),
        },
      );
      return this.findOrderByIdForResponse(order.id, context, tx);
    });

    return this.toOrderResponse(updatedOrder);
  }

  async updateItemQuantity(
    id: string,
    itemId: string,
    dto: UpdateOrderItemDto,
    authorization?: string,
  ) {
    const context = await this.getCompanyContext(authorization);
    const order = await this.findEditableOrderOrThrow(id, context);
    const quantity = new Prisma.Decimal(dto.quantity);

    const updatedOrder = await this.prisma.$transaction(async (tx) => {
      const item = await tx.orderItem.findFirst({
        where: {
          id: itemId,
          orderId: order.id,
        },
      });

      if (!item) {
        throw new NotFoundException('Order item not found');
      }

      if (quantity.lte(0)) {
        await tx.orderItem.delete({
          where: {
            id: item.id,
          },
        });
      } else {
        await tx.orderItem.update({
          where: {
            id: item.id,
          },
          data: {
            quantity,
            totalPrice: this.calculateItemTotal(
              quantity,
              item.price,
              item.discountAmount,
            ),
          },
        });
      }

      await this.recalculateOrderTotals(order.id, tx);
      return this.findOrderByIdForResponse(order.id, context, tx);
    });

    return this.toOrderResponse(updatedOrder);
  }

  async removeItem(id: string, itemId: string, authorization?: string) {
    const context = await this.getCompanyContext(authorization);
    const order = await this.findEditableOrderOrThrow(id, context);

    const updatedOrder = await this.prisma.$transaction(async (tx) => {
      const item = await tx.orderItem.findFirst({
        where: {
          id: itemId,
          orderId: order.id,
        },
      });

      if (!item) {
        throw new NotFoundException('Order item not found');
      }

      await tx.orderItem.delete({
        where: {
          id: item.id,
        },
      });

      await this.recalculateOrderTotals(order.id, tx);
      return this.findOrderByIdForResponse(order.id, context, tx);
    });

    return this.toOrderResponse(updatedOrder);
  }

  async addPayment(id: string, dto: AddPaymentDto, authorization?: string) {
    const context = await this.getCompanyContext(authorization);
    const order = await this.findEditableOrderOrThrow(id, context);
    const paymentType = await this.findPaymentTypeOrThrow(
      dto.paymentTypeId,
      context.companyId,
    );
    const amount = this.toPositiveDecimal(dto.amount, 'amount');

    const updatedOrder = await this.prisma.$transaction(async (tx) => {
      await tx.orderPayment.create({
        data: {
          orderId: order.id,
          paymentTypeId: paymentType.id,
          amount,
        },
      });

      await this.recalculateOrderPaidAmount(order.id, tx);
      await this.createAuditLog(
        tx,
        context,
        'order.payment_added',
        'Order',
        order.id,
        {
          paymentTypeId: paymentType.id,
          amount: amount.toString(),
        },
      );
      return this.findOrderByIdForResponse(order.id, context, tx);
    });

    return this.toOrderResponse(updatedOrder);
  }

  async removePayment(id: string, paymentId: string, authorization?: string) {
    const context = await this.getCompanyContext(authorization);
    const order = await this.findEditableOrderOrThrow(id, context);

    const updatedOrder = await this.prisma.$transaction(async (tx) => {
      const payment = await tx.orderPayment.findFirst({
        where: {
          id: paymentId,
          orderId: order.id,
        },
      });

      if (!payment) {
        throw new NotFoundException('Order payment not found');
      }

      await tx.orderPayment.delete({
        where: {
          id: payment.id,
        },
      });

      await this.recalculateOrderPaidAmount(order.id, tx);
      return this.findOrderByIdForResponse(order.id, context, tx);
    });

    return this.toOrderResponse(updatedOrder);
  }

  async applyDiscount(
    id: string,
    dto: ApplyDiscountDto,
    authorization?: string,
  ) {
    const context = await this.getCompanyContext(authorization);
    const order = await this.findEditableOrderWithItemsOrThrow(id, context);
    const discountAmount = new Prisma.Decimal(dto.discountAmount);
    const itemsTotal = this.sumOrderItemsTotal(order.items);

    if (discountAmount.gt(itemsTotal)) {
      throw new BadRequestException(
        'discountAmount cannot be greater than totalPrice',
      );
    }

    const updatedOrder = await this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: {
          id: order.id,
        },
        data: {
          discountAmount,
          totalPrice: itemsTotal.minus(discountAmount),
          versionNumber: {
            increment: 1,
          },
        },
      });

      return this.findOrderByIdForResponse(order.id, context, tx);
    });

    return this.toOrderResponse(updatedOrder);
  }

  async attachCustomer(
    id: string,
    dto: AttachCustomerDto,
    authorization?: string,
  ) {
    const context = await this.getCompanyContext(authorization);
    const order = await this.findEditableOrderOrThrow(id, context);
    const customerId = dto.customerId.trim();

    if (!customerId) {
      throw new BadRequestException('customerId is required');
    }

    const updatedOrder = await this.prisma.order.update({
      where: {
        id: order.id,
      },
      data: {
        customerId,
        versionNumber: {
          increment: 1,
        },
      },
      include: this.orderInclude(),
    });

    return this.toOrderResponse(updatedOrder);
  }

  async updateComment(
    id: string,
    dto: UpdateOrderCommentDto,
    authorization?: string,
  ) {
    const context = await this.getCompanyContext(authorization);
    const order = await this.findEditableOrderOrThrow(id, context);

    const updatedOrder = await this.prisma.order.update({
      where: {
        id: order.id,
      },
      data: {
        comment: dto.comment?.trim() || null,
        versionNumber: {
          increment: 1,
        },
      },
      include: this.orderInclude(),
    });

    return this.toOrderResponse(updatedOrder);
  }

  async complete(id: string, authorization?: string) {
    const context = await this.getCompanyContext(authorization);

    const completedOrder = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: {
          id,
          companyId: context.companyId,
        },
        include: {
          items: true,
          payments: true,
          shop: true,
        },
      });

      if (!order || !context.allowedShopIds.includes(order.shopId)) {
        throw new NotFoundException('Order not found');
      }

      if (order.status !== 'DRAFT') {
        throw new BadRequestException('Only draft orders can be completed');
      }

      if (!order.items.length) {
        throw new BadRequestException('Order must contain at least one item');
      }

      const paidAmount = this.sumOrderPayments(order.payments);
      if (paidAmount.lt(order.totalPrice)) {
        throw new BadRequestException('Order is not fully paid');
      }

      for (const item of order.items) {
        const quantity = this.toStockQuantity(item.quantity);
        const stock = await tx.productStock.findFirst({
          where: {
            productId: item.productId,
            branchCode: order.shop.branchCode,
          },
        });

        if (!stock || stock.quantity < quantity) {
          throw new BadRequestException('Недостаточно товара на складе');
        }

        const beforeQuantity = new Prisma.Decimal(stock.quantity);
        const afterQuantity = beforeQuantity.minus(quantity);
        const supplyPrice = stock.purchasePrice ?? 0;
        const retailPrice = Number(item.price ?? stock.salePrice ?? 0);
        const fromRetailPrice = stock.salePrice ?? 0;

        await tx.productStock.update({
          where: {
            id: stock.id,
          },
          data: {
            quantity: {
              decrement: quantity,
            },
          },
        });

        const stockMovement = await tx.stockMovement.create({
          data: {
            companyId: order.companyId,
            shopId: order.shopId,
            productId: item.productId,
            orderId: order.id,
            type: 'SALE',
            displayTypeCode: 'sale',
            displayTypeLabel: 'Продажа',
            externalId: order.orderNumber,
            quantity: item.quantity,
            loadedMeasurementValue: afterQuantity,
            beforeQuantity,
            afterQuantity,
            fromShopId: order.shopId,
            toShopId: order.shopId,
            supplyPrice,
            retailPrice,
            newRetailPrice: retailPrice,
            fromRetailPrice,
            fromSupplyPrice: supplyPrice,
            createdById: context.userId,
          },
        });

        await this.createAuditLog(
          tx,
          context,
          'stock.movement_created',
          'StockMovement',
          stockMovement.id,
          {
            orderId: order.id,
            productId: item.productId,
            type: 'SALE',
            quantity: item.quantity.toString(),
            beforeQuantity: beforeQuantity.toString(),
            afterQuantity: afterQuantity.toString(),
          },
        );

        const totalStock = await tx.productStock.aggregate({
          where: {
            productId: item.productId,
          },
          _sum: {
            quantity: true,
          },
        });

        await tx.product.update({
          where: {
            id: item.productId,
          },
          data: {
            quantity: totalStock._sum.quantity ?? 0,
          },
        });
      }

      await tx.order.update({
        where: {
          id: order.id,
        },
        data: {
          paidAmount,
          status: 'COMPLETED',
          completedAt: new Date(),
          versionNumber: {
            increment: 1,
          },
        },
      });

      await this.createAuditLog(
        tx,
        context,
        'order.completed',
        'Order',
        order.id,
        {
          paidAmount: paidAmount.toString(),
          totalPrice: order.totalPrice.toString(),
        },
      );

      return this.findOrderByIdForResponse(order.id, context, tx);
    });

    return this.toOrderResponse(completedOrder);
  }

  async cancel(id: string, authorization?: string) {
    const context = await this.getCompanyContext(authorization);
    const updatedOrder = await this.prisma.$transaction(async (tx) => {
      const order = await this.findOrderForStatusChangeOrThrow(id, context, tx);

      if (!['DRAFT', 'PARKED'].includes(order.status)) {
        throw new BadRequestException(
          'Only draft or parked orders can be cancelled',
        );
      }

      await tx.order.update({
        where: { id: order.id },
        data: {
          status: 'CANCELLED',
          versionNumber: {
            increment: 1,
          },
        },
      });

      await this.createAuditLog(
        tx,
        context,
        'order.cancelled',
        'Order',
        order.id,
        {
          previousStatus: order.status,
        },
      );

      return this.findOrderByIdForResponse(order.id, context, tx);
    });

    return this.toOrderResponse(updatedOrder);
  }

  async park(id: string, authorization?: string) {
    const context = await this.getCompanyContext(authorization);
    const updatedOrder = await this.prisma.$transaction(async (tx) => {
      const order = await this.findOrderForStatusChangeOrThrow(id, context, tx);

      if (order.status !== 'DRAFT') {
        throw new BadRequestException('Only draft orders can be parked');
      }

      await tx.order.update({
        where: { id: order.id },
        data: {
          status: 'PARKED',
          versionNumber: {
            increment: 1,
          },
        },
      });

      return this.findOrderByIdForResponse(order.id, context, tx);
    });

    return this.toOrderResponse(updatedOrder);
  }

  async resume(id: string, authorization?: string) {
    const context = await this.getCompanyContext(authorization);
    const updatedOrder = await this.prisma.$transaction(async (tx) => {
      const order = await this.findOrderForStatusChangeOrThrow(id, context, tx);

      if (order.status !== 'PARKED') {
        throw new BadRequestException('Only parked orders can be resumed');
      }

      await tx.order.update({
        where: { id: order.id },
        data: {
          status: 'DRAFT',
          versionNumber: {
            increment: 1,
          },
        },
      });

      return this.findOrderByIdForResponse(order.id, context, tx);
    });

    return this.toOrderResponse(updatedOrder);
  }

  private async getCompanyContext(authorization?: string) {
    const context = await this.usersService.getRequestContext(authorization);
    if (context.userType !== 'company' || !context.companyId) {
      throw new ForbiddenException('Only company users can manage orders');
    }

    if (!context.allowedShopIds.length) {
      throw new ForbiddenException('No available shops for this user');
    }

    return {
      companyId: context.companyId,
      userId: context.userId,
      allowedShopIds: context.allowedShopIds,
    };
  }

  private async findAccessibleShop(
    shopId: string,
    context: { companyId: string; allowedShopIds: string[] },
  ) {
    const normalizedShopId = shopId.trim();
    if (!normalizedShopId) {
      throw new BadRequestException('shopId is required');
    }

    const shop = await this.prisma.shop.findFirst({
      where: {
        companyId: context.companyId,
        OR: [{ id: normalizedShopId }, { branchCode: normalizedShopId }],
        isActive: true,
      },
    });

    if (!shop) {
      throw new NotFoundException('Shop not found');
    }

    if (!context.allowedShopIds.includes(shop.id)) {
      throw new ForbiddenException('Shop is not available for this user');
    }

    return shop;
  }

  private async findCashboxOrThrow(
    cashboxId: string,
    shopId: string,
    companyId: string,
  ) {
    const normalizedCashboxId = cashboxId.trim();
    if (!normalizedCashboxId) {
      throw new BadRequestException('cashboxId is required');
    }

    const cashbox = await this.prisma.cashbox.findFirst({
      where: {
        id: normalizedCashboxId,
        companyId,
        shopId,
        isActive: true,
      },
    });

    if (!cashbox) {
      throw new NotFoundException('Cashbox not found');
    }

    return cashbox;
  }

  private async findEditableOrderOrThrow(
    id: string,
    context: { companyId: string; allowedShopIds: string[] },
  ) {
    const order = await this.prisma.order.findFirst({
      where: {
        id,
        companyId: context.companyId,
      },
    });

    if (!order || !context.allowedShopIds.includes(order.shopId)) {
      throw new NotFoundException('Order not found');
    }

    if (order.status !== 'DRAFT') {
      throw new BadRequestException('Only draft orders can be edited');
    }

    return order;
  }

  private async findProductForOrderOrThrow(
    productId: string,
    companyId: string,
  ) {
    const normalizedProductId = productId.trim();
    if (!normalizedProductId) {
      throw new BadRequestException('productId is required');
    }

    const numericProductId = Number(normalizedProductId);
    const product = await this.prisma.product.findFirst({
      where: {
        companyId,
        archivedAt: null,
        OR: [
          ...(Number.isInteger(numericProductId)
            ? [{ id: numericProductId }]
            : []),
          { publicId: normalizedProductId },
        ],
      },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return product;
  }

  private async findPaymentTypeOrThrow(
    paymentTypeId: string,
    companyId: string,
  ) {
    const normalizedPaymentTypeId = paymentTypeId.trim();
    if (!normalizedPaymentTypeId) {
      throw new BadRequestException('paymentTypeId is required');
    }

    const paymentType = await this.prisma.paymentType.findFirst({
      where: {
        id: normalizedPaymentTypeId,
        companyId,
        isActive: true,
      },
    });

    if (!paymentType) {
      throw new NotFoundException('Payment type not found');
    }

    return paymentType;
  }

  private resolveProductSalePrice(product: {
    salePrice: number | null;
    discountPrice: number | null;
  }) {
    const price = product.discountPrice ?? product.salePrice;
    if (price === null || price === undefined || price < 0) {
      throw new BadRequestException('Product sale price is not configured');
    }

    return new Prisma.Decimal(price);
  }

  private calculateItemTotal(
    quantity: Prisma.Decimal,
    price: Prisma.Decimal,
    discountAmount = new Prisma.Decimal(0),
  ) {
    const total = quantity.mul(price).minus(discountAmount);
    return total.gt(0) ? total : new Prisma.Decimal(0);
  }

  private async recalculateOrderTotals(orderId: string, tx: any) {
    const order = await tx.order.findUnique({
      where: {
        id: orderId,
      },
      include: {
        items: true,
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const itemsTotal = this.sumOrderItemsTotal(order.items);

    if (order.discountAmount.gt(itemsTotal)) {
      throw new BadRequestException(
        'discountAmount cannot be greater than totalPrice',
      );
    }

    await tx.order.update({
      where: {
        id: orderId,
      },
      data: {
        totalPrice: itemsTotal.minus(order.discountAmount),
        versionNumber: {
          increment: 1,
        },
      },
    });
  }

  private async recalculateOrderPaidAmount(orderId: string, tx: any) {
    const paymentsTotal = await tx.orderPayment.aggregate({
      where: {
        orderId,
      },
      _sum: {
        amount: true,
      },
    });

    await tx.order.update({
      where: {
        id: orderId,
      },
      data: {
        paidAmount: paymentsTotal._sum.amount ?? new Prisma.Decimal(0),
        versionNumber: {
          increment: 1,
        },
      },
    });
  }

  private async findEditableOrderWithItemsOrThrow(
    id: string,
    context: { companyId: string; allowedShopIds: string[] },
  ) {
    const order = await this.prisma.order.findFirst({
      where: {
        id,
        companyId: context.companyId,
      },
      include: {
        items: true,
      },
    });

    if (!order || !context.allowedShopIds.includes(order.shopId)) {
      throw new NotFoundException('Order not found');
    }

    if (order.status !== 'DRAFT') {
      throw new BadRequestException('Only draft orders can be edited');
    }

    return order;
  }

  private sumOrderItemsTotal(items: { totalPrice: Prisma.Decimal }[]) {
    return items.reduce(
      (sum: Prisma.Decimal, item: { totalPrice: Prisma.Decimal }) =>
        sum.plus(item.totalPrice),
      new Prisma.Decimal(0),
    );
  }

  private sumOrderPayments(payments: { amount: Prisma.Decimal }[]) {
    return payments.reduce(
      (sum: Prisma.Decimal, payment: { amount: Prisma.Decimal }) =>
        sum.plus(payment.amount),
      new Prisma.Decimal(0),
    );
  }

  private async findOrderForStatusChangeOrThrow(
    id: string,
    context: { companyId: string; allowedShopIds: string[] },
    tx: any = this.prisma,
  ) {
    const order = await tx.order.findFirst({
      where: {
        id,
        companyId: context.companyId,
      },
    });

    if (!order || !context.allowedShopIds.includes(order.shopId)) {
      throw new NotFoundException('Order not found');
    }

    return order;
  }

  private async createAuditLog(
    tx: any,
    context: { companyId: string; userId: number },
    action: string,
    entity: string,
    entityId: string,
    meta?: Record<string, unknown>,
  ) {
    await tx.auditLog.create({
      data: {
        companyId: context.companyId,
        userId: context.userId,
        action,
        entity,
        entityId,
        meta: meta ?? undefined,
      },
    });
  }

  private toStockQuantity(quantity: Prisma.Decimal) {
    if (!quantity.isInteger()) {
      throw new BadRequestException(
        'Order item quantity must be an integer for stock write-off',
      );
    }

    const numberValue = quantity.toNumber();
    if (!Number.isSafeInteger(numberValue) || numberValue <= 0) {
      throw new BadRequestException('Order item quantity is invalid');
    }

    return numberValue;
  }

  private async findOrderByIdForResponse(
    id: string,
    context: { companyId: string; allowedShopIds: string[] },
    tx: any = this.prisma,
  ) {
    const order = await tx.order.findFirst({
      where: {
        id,
        companyId: context.companyId,
      },
      include: this.orderInclude(),
    });

    if (!order || !context.allowedShopIds.includes(order.shopId)) {
      throw new NotFoundException('Order not found');
    }

    return order;
  }

  private toPositiveDecimal(value: number, fieldName: string) {
    const decimal = new Prisma.Decimal(value);
    if (decimal.lte(0)) {
      throw new BadRequestException(`${fieldName} must be greater than 0`);
    }

    return decimal;
  }

  private async generateOrderNumber(companyId: string, tx: any) {
    const latestOrder = await tx.order.findFirst({
      where: {
        companyId,
      },
      orderBy: {
        orderNumber: 'desc',
      },
      select: {
        orderNumber: true,
      },
    });

    const latestNumericValue = latestOrder?.orderNumber
      ? Number(latestOrder.orderNumber)
      : 0;
    const nextNumber = Number.isFinite(latestNumericValue)
      ? latestNumericValue + 1
      : 1;

    return String(nextNumber).padStart(9, '0');
  }

  private orderInclude() {
    return {
      items: {
        include: {
          product: true,
        },
        orderBy: {
          createdAt: 'asc' as const,
        },
      },
      payments: {
        include: {
          paymentType: true,
        },
        orderBy: {
          createdAt: 'asc' as const,
        },
      },
      shop: true,
      cashbox: true,
      user: true,
    };
  }

  private toOrderResponse(order: any) {
    return {
      id: order.id,
      companyId: order.companyId,
      shopId: order.shopId,
      cashboxId: order.cashboxId,
      userId: order.userId,
      orderNumber: order.orderNumber,
      orderType: order.orderType,
      status: order.status,
      customerId: order.customerId,
      customer: null,
      totalPrice: this.decimalToNumber(order.totalPrice),
      discountAmount: this.decimalToNumber(order.discountAmount),
      paidAmount: this.decimalToNumber(order.paidAmount),
      comment: order.comment,
      versionNumber: order.versionNumber,
      completedAt: order.completedAt,
      items: order.items.map((item: any) => ({
        id: item.id,
        productId: item.productId,
        quantity: this.decimalToNumber(item.quantity),
        price: this.decimalToNumber(item.price),
        discountAmount: this.decimalToNumber(item.discountAmount),
        totalPrice: this.decimalToNumber(item.totalPrice),
        product: item.product
          ? {
              id: item.product.id,
              publicId: item.product.publicId,
              name: item.product.name,
              sku: item.product.sku,
              barcode: item.product.barcode,
            }
          : null,
      })),
      payments: order.payments.map((payment: any) => ({
        id: payment.id,
        paymentTypeId: payment.paymentTypeId,
        amount: this.decimalToNumber(payment.amount),
        paymentType: payment.paymentType
          ? {
              id: payment.paymentType.id,
              name: payment.paymentType.name,
              isCash: payment.paymentType.isCash,
            }
          : null,
        createdAt: payment.createdAt,
      })),
      shop: order.shop
        ? {
            id: order.shop.id,
            name: order.shop.name,
            branchCode: order.shop.branchCode,
          }
        : null,
      cashbox: order.cashbox
        ? {
            id: order.cashbox.id,
            name: order.cashbox.name,
            isActive: order.cashbox.isActive,
          }
        : null,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  }

  private decimalToNumber(value: unknown) {
    if (value === null || value === undefined) {
      return 0;
    }

    return Number(value);
  }
}

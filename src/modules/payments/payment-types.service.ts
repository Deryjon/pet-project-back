import {
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UsersService } from '../../users/users.service';
import { CreatePaymentTypeDto } from './dto/create-payment-type.dto';

@Injectable()
export class PaymentTypesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
  ) {}

  async create(dto: CreatePaymentTypeDto, authorization?: string) {
    const context = await this.getCompanyContext(authorization);

    try {
      const paymentType = await this.prisma.paymentType.create({
        data: {
          companyId: context.companyId,
          name: dto.name.trim(),
          isCash: dto.isCash ?? false,
        },
      });

      return this.toPaymentTypeResponse(paymentType);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Payment type with this name already exists',
        );
      }

      throw error;
    }
  }

  async findAll(authorization?: string) {
    const context = await this.getCompanyContext(authorization);
    const paymentTypes = await this.prisma.paymentType.findMany({
      where: {
        companyId: context.companyId,
        isActive: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return paymentTypes.map((paymentType) =>
      this.toPaymentTypeResponse(paymentType),
    );
  }

  private async getCompanyContext(authorization?: string) {
    const context = await this.usersService.getRequestContext(authorization);
    if (context.userType !== 'company' || !context.companyId) {
      throw new ForbiddenException(
        'Only company users can manage payment types',
      );
    }

    return {
      companyId: context.companyId,
      userId: context.userId,
    };
  }

  private toPaymentTypeResponse(paymentType: {
    id: string;
    companyId: string;
    name: string;
    isCash: boolean;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: paymentType.id,
      companyId: paymentType.companyId,
      name: paymentType.name,
      isCash: paymentType.isCash,
      isActive: paymentType.isActive,
      createdAt: paymentType.createdAt,
      updatedAt: paymentType.updatedAt,
    };
  }
}

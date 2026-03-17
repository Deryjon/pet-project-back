import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.user.findMany({
      include: {
        role: true,
        location: true,
      },
      orderBy: {
        id: 'asc',
      },
    });
  }

  findById(id: number) {
    return this.prisma.user.findUnique({
      where: { id },
      include: {
        role: true,
        location: true,
      },
    });
  }

  findByPhone(phone: string) {
    return this.prisma.user.findUnique({
      where: { phone },
      include: {
        role: true,
        location: true,
      },
    });
  }
}

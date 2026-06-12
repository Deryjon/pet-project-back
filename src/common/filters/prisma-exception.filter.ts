import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response } from 'express';

@Catch(Prisma.PrismaClientKnownRequestError, Prisma.PrismaClientValidationError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(
    exception: Prisma.PrismaClientKnownRequestError | Prisma.PrismaClientValidationError,
    host: ArgumentsHost,
  ) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const requestId = ctx.getRequest<{ headers: Record<string, string> }>()
      .headers['x-request-id'];

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const { status, message } = this.resolveKnownError(exception);
      this.logger.warn(`Prisma error ${exception.code}: ${message}`, {
        requestId,
        meta: exception.meta,
      });
      return response.status(status).json({ message, statusCode: status });
    }

    this.logger.warn('Prisma validation error', {
      requestId,
      message: exception.message,
    });
    return response.status(HttpStatus.BAD_REQUEST).json({
      message: 'Invalid data',
      statusCode: HttpStatus.BAD_REQUEST,
    });
  }

  private resolveKnownError(err: Prisma.PrismaClientKnownRequestError): {
    status: number;
    message: string;
  } {
    switch (err.code) {
      case 'P2002':
        return {
          status: HttpStatus.CONFLICT,
          message: 'Record with this data already exists',
        };
      case 'P2025':
        return {
          status: HttpStatus.NOT_FOUND,
          message: 'Record not found',
        };
      case 'P2003':
        return {
          status: HttpStatus.BAD_REQUEST,
          message: 'Related record not found',
        };
      case 'P2014':
        return {
          status: HttpStatus.BAD_REQUEST,
          message: 'The provided value violates a required relation',
        };
      default:
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Database error occurred',
        };
    }
  }
}

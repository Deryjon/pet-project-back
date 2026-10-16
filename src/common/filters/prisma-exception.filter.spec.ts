import { ArgumentsHost } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaExceptionFilter } from './prisma-exception.filter';

function run(exception: Parameters<PrismaExceptionFilter['catch']>[0]) {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ headers: {} }),
    }),
  } as unknown as ArgumentsHost;
  new PrismaExceptionFilter().catch(exception, host);
  return { status, json };
}

describe('PrismaExceptionFilter', () => {
  it('answers with statusCode, message and a Nest-style error phrase', () => {
    const { status, json } = run(
      new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith({
      statusCode: 409,
      message: 'Record with this data already exists',
      error: 'Conflict',
    });
  });

  it('maps P2025 to 404', () => {
    const { json } = run(
      new Prisma.PrismaClientKnownRequestError('missing', {
        code: 'P2025',
        clientVersion: 'test',
      }),
    );
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 404, error: 'Not Found' }),
    );
  });
});

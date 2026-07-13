import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import * as express from 'express';
import { join } from 'path';
import { AppModule } from './app.module';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';
import { PrismaService } from './prisma/prisma.service';

function firstHeaderValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function readHeader(req: express.Request, headerName: string) {
  const normalizedName = headerName.toLowerCase();
  const header = firstHeaderValue(req.headers[normalizedName]);

  if (header) {
    return header;
  }

  if (!Array.isArray(req.rawHeaders)) {
    return undefined;
  }

  for (let index = 0; index < req.rawHeaders.length; index += 2) {
    if (req.rawHeaders[index]?.toLowerCase() === normalizedName) {
      return req.rawHeaders[index + 1];
    }
  }

  return undefined;
}

function normalizeAuthorizationHeader(req: express.Request) {
  const authorization =
    readHeader(req, 'authorization') ??
    readHeader(req, 'x-authorization') ??
    readHeader(req, 'x-access-token');

  if (!authorization?.trim()) {
    return;
  }

  req.headers.authorization = authorization.trim();
}

function normalizeApiPrefix(req: express.Request) {
  const currentUrl = req.url || '/';

  if (
    currentUrl === '/api' ||
    currentUrl.startsWith('/api/') ||
    currentUrl === '/uploads' ||
    currentUrl.startsWith('/uploads/')
  ) {
    return;
  }

  req.url = currentUrl.startsWith('/')
    ? `/api${currentUrl}`
    : `/api/${currentUrl}`;
}

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);
  // One reverse proxy (nginx) sits in front of the app in production — trust
  // exactly one hop so req.ip reflects the real client from X-Forwarded-For.
  app.getHttpAdapter().getInstance().set('trust proxy', 1);
  const corsOrigins = (
    process.env.FRONTEND_URL ??
    'http://localhost:3000,http://localhost:5173,http://localhost:4173'
  )
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.use(
    (
      req: express.Request,
      _res: express.Response,
      next: express.NextFunction,
    ) => {
      normalizeApiPrefix(req);
      normalizeAuthorizationHeader(req);
      next();
    },
  );

  app.setGlobalPrefix('api');
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });
  app.use('/uploads', express.static(join(process.cwd(), 'uploads')));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new PrismaExceptionFilter());

  const prismaService = app.get(PrismaService);
  prismaService.enableShutdownHooks(app);

  const port = Number(process.env.PORT ?? 3001);

  try {
    await app.listen(port);
  } catch (error: unknown) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'EADDRINUSE'
    ) {
      logger.error(
        `Port ${port} is already in use. Stop the existing process or set a different PORT.`,
      );
      await app.close();
      process.exit(1);
    }

    throw error;
  }
}

void bootstrap();

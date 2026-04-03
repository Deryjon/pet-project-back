import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import * as express from 'express';
import { join } from 'path';
import { AppModule } from './app.module';
import { PrismaService } from './prisma/prisma.service';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);
  const corsOrigins = (
    process.env.FRONTEND_URL ??
    'http://localhost:3000,http://localhost:5173,http://localhost:4173'
  )
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

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
        `Порт ${port} уже занят. Останови предыдущий процесс или запусти сервер с другим PORT.`,
      );
      await app.close();
      process.exit(1);
    }

    throw error;
  }
}

void bootstrap();

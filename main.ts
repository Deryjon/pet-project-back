import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AppModule } from './src/app.module';

function firstHeaderValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function readHeader(req: Request, headerName: string) {
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

function normalizeAuthorizationHeader(req: Request) {
  const authorization =
    readHeader(req, 'authorization') ??
    readHeader(req, 'x-authorization') ??
    readHeader(req, 'x-access-token');

  if (!authorization?.trim()) {
    return;
  }

  req.headers.authorization = authorization.trim();
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use((req: Request, _res: Response, next: () => void) => {
    normalizeAuthorizationHeader(req);
    next();
  });

  app.enableCors({
    origin: true,
    credentials: true,
  });

  app.setGlobalPrefix('api');

  const config = new DocumentBuilder()
    .setTitle('Konkurent CRM API')
    .setDescription('API documentation')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(process.env.PORT || 3001);
}
bootstrap();

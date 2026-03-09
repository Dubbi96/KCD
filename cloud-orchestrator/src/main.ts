import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { WsAdapter } from '@nestjs/platform-ws';
import { AppModule } from './app.module';

async function bootstrap() {
  // CRITICAL: JWT_SECRET must be set in production
  if (!process.env.JWT_SECRET) {
    if (process.env.NODE_ENV === 'production') {
      console.error('FATAL: JWT_SECRET environment variable is required in production');
      process.exit(1);
    }
    console.warn('WARNING: JWT_SECRET not set — using insecure default. Set JWT_SECRET before deploying to production.');
  }

  // Disable NestJS's default body parser (100KB limit) so we can set a higher limit
  const app = await NestFactory.create(AppModule, { bodyParser: false });

  // Add body parsers FIRST with increased limit for runner callbacks (large resultJson with screenshots)
  const bodyParser = require('body-parser');
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.use(bodyParser.json({ limit: '50mb' }));
  expressApp.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

  // CORS: restrict to allowed origins; fall back to localhost in dev only
  const allowedOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
    : process.env.NODE_ENV === 'production'
      ? [] // deny all if not configured in production
      : ['http://localhost:5173', 'http://localhost:3000'];
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.setGlobalPrefix('api/v1');

  // WebSocket adapter for device streaming relay
  app.useWebSocketAdapter(new WsAdapter(app));

  const config = new DocumentBuilder()
    .setTitle('Katab Cloud Orchestrator')
    .setDescription('Multi-tenant QA automation orchestrator API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  const port = process.env.PORT || 4000;
  await app.listen(port);
  console.log(`Katab Cloud Orchestrator running on port ${port}`);
}
bootstrap();

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AppConfig } from './config/app.config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // CORS
  app.enableCors(AppConfig.cors);

  // Validation
  app.useGlobalPipes(AppConfig.validationPipe);

  // Start server
  await app.listen(AppConfig.port, AppConfig.host);

  console.log(`✅ API listening on http://${AppConfig.host}:${AppConfig.port}`);
}
bootstrap();

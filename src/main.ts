import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // CORS (useful for web & local testing)
  app.enableCors({
    origin: true,
    credentials: true,
  });

  // Validation
  app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true, // rejette les champs inconnus
    transform: true,
    stopAtFirstError: true,     // message plus clair côté client
  }),
);

  const PORT = Number(process.env.PORT) || 3002;

  // ⬅️ IMPORTANT: bind to 0.0.0.0 so Android emulator can reach it via 10.0.2.2
  await app.listen(PORT, '0.0.0.0');

  console.log(`✅ API listening on http://0.0.0.0:${PORT}`);
}
bootstrap();

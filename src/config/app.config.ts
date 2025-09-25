import { ValidationPipe } from '@nestjs/common';

export const AppConfig = {
  cors: {
    origin: true,
    credentials: true,
  },

  validationPipe: new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true, // reject unknown fields
    transform: true,
    stopAtFirstError: true,     // clearer error message on client side
  }),

  port: Number(process.env.PORT) || 3001,
  host: '0.0.0.0', // required so Android Emulator can reach it via 10.0.2.2
};

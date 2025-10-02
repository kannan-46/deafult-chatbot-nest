// src/main.ts

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {


  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: 'http://localhost:3000', // The specific origin of your frontend
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    allowedHeaders: 'Content-Type, Accept, Authorization, X-User-ID', // IMPORTANT: Explicitly allow your custom headers
  });

  await app.listen(3001);
  console.log(`🚀 Server running at http://localhost:3001`);
}
bootstrap();

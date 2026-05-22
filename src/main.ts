import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableCors({
    origin: ['http://localhost:3000', 'http://localhost:3001','https://doctor-appointment-system-seven-xi.vercel.app'], // Your Next.js URL
    credentials: true, // Allow cookies to be sent/received
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  });

  await app.listen(process.env.PORT ?? 3003);
}
bootstrap();

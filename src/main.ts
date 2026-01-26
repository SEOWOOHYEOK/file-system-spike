import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Swagger 설정
  const config = new DocumentBuilder()
    .setTitle('DMS API')
    .setDescription('문서 관리 시스템 API 문서')
    .setVersion('1.0')
    .addTag('Files', '파일 관리 API')
    .addTag('Folders', '폴더 관리 API')
    .addTag('Trash', '휴지통 관리 API')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api-docs', app, document);

  await app.listen(process.env.PORT ?? 3000);
  const logger = new Logger('Main');


  logger.log(`🚀 App server running on http://localhost:${process.env.PORT ?? 3000}`);
  logger.log(`📚 Swagger docs at http://localhost:${process.env.PORT ?? 3000}/api-docs`);
}
bootstrap();

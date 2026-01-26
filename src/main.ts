import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // 전역 유효성 검증 파이프 설정
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true, // 자동 타입 변환 활성화
      // whitelist: true, // DTO에 정의되지 않은 속성 제거
      // forbidNonWhitelisted: false, // 정의되지 않은 속성 허용 (경고 없음)
    }),
  );

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

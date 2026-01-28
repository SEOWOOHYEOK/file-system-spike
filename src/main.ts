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
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api-docs', app, document, {
    swaggerOptions: {
      tagsSorter: 'alpha', // 태그를 알파벳/숫자 순서로 정렬
      operationsSorter: 'alpha', // 각 태그 내 API도 정렬
    },
  });

  await app.listen(process.env.PORT ?? 3000);
  const logger = new Logger('Main');


  logger.log(`🚀 App server running on http://localhost:${process.env.PORT ?? 3000}`);
  logger.log(`📚 Swagger docs at http://localhost:${process.env.PORT ?? 3000}/api-docs`);
}
bootstrap();

/**
 * Node.js libuv 스레드 풀 크기 설정 (기본값 4 → 16)
 * 병렬 파일 I/O 성능 향상을 위해 스레드 풀 확장
 * 주의: 반드시 다른 import 전에 설정해야 함
 */
process.env.UV_THREADPOOL_SIZE = '16';

import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';
import { GlobalExceptionFilter } from './common/exceptions/global-exception.filter';
import { ErrorMessageService } from './common/error-message/error-message.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Winston 로거를 NestJS 기본 로거로 교체
  app.useLogger(app.get(WINSTON_MODULE_NEST_PROVIDER));

  // CORS 설정 (Frontend 개발 서버 허용)
  // .env 파일에서 CORS 허용 origin 읽어오도록 NV 처리
  const allowedOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
    : [];

  //TODO 추후 정의필요
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  // 전역 유효성 검증 파이프 설정
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true, // 자동 타입 변환 활성화
      // whitelist: true, // DTO에 정의되지 않은 속성 제거
      // forbidNonWhitelisted: false, // 정의되지 않은 속성 허용 (경고 없음)
    }),
  );

  // 전역 예외 필터 등록
  const errorMessageService = app.get(ErrorMessageService);
  const winstonLogger = app.get(WINSTON_MODULE_NEST_PROVIDER);
  app.useGlobalFilters(new GlobalExceptionFilter(errorMessageService, winstonLogger));

  // Swagger 설정
  const config = new DocumentBuilder()
    .setTitle('DMS API')
    .setDescription('문서 관리 시스템 API 문서')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT 토큰을 입력하세요',
      },
      'bearer', // Security scheme name - @ApiBearerAuth()와 매칭
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api-docs', app, document, {
    swaggerOptions: {
      tagsSorter: 'alpha', // 태그를 알파벳/숫자 순서로 정렬
      operationsSorter: 'alpha', // 각 태그 내 API도 정렬
      persistAuthorization: true, // 새로고침 후에도 토큰 유지
    },
  });

  await app.listen(process.env.PORT ?? 3000);
  const logger = new Logger('Main');


  logger.log(`🚀 App server running on http://localhost:${process.env.PORT ?? 3000}`);
  logger.log(`📚 Swagger docs at http://localhost:${process.env.PORT ?? 3000}/api-docs`);
}
bootstrap();

# ============================================
# DMS Project - Multi-stage Docker Build
# ============================================
# 사용법:
#   docker compose --profile full up -d --build   # 전체 서비스 빌드 & 실행
#   docker compose up -d --build                   # 기본(app + postgres) 빌드 & 실행
# ============================================

# ── Stage 1: 의존성 설치 ──────────────────────
FROM node:20-alpine AS deps

WORKDIR /app

# bcrypt 네이티브 빌드에 필요한 패키지 설치
RUN apk add --no-cache python3 make g++

# 패키지 매니저 파일만 먼저 복사 (캐시 활용)
COPY package.json package-lock.json* ./

# 프로덕션 + 개발 의존성 모두 설치 (빌드에 devDependencies 필요)
RUN npm ci

# ── Stage 2: 빌드 ─────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# deps 스테이지에서 node_modules 복사
COPY --from=deps /app/node_modules ./node_modules

# 소스 코드 전체 복사
COPY . .

# NestJS 빌드 (dist/ 생성)
RUN npm run build

# ── Stage 3: 프로덕션 이미지 ───────────────────
FROM node:20-alpine AS production

WORKDIR /app

# bcrypt 네이티브 모듈 실행에 필요한 최소 라이브러리
RUN apk add --no-cache libc6-compat

# 프로덕션 의존성만 설치
COPY package.json package-lock.json* ./
RUN apk add --no-cache python3 make g++ \
    && npm ci --omit=dev \
    && apk del python3 make g++

# 빌드 결과물 복사
COPY --from=builder /app/dist ./dist

# 데이터 디렉토리 생성 (queue, cache, logs)
RUN mkdir -p /data/queue /data/cache /data/logs

# 비-root 사용자로 실행
RUN addgroup -g 1001 -S appgroup \
    && adduser -S appuser -u 1001 -G appgroup \
    && chown -R appuser:appgroup /app /data

USER appuser

# 기본 포트
EXPOSE 3100

# 헬스체크
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3100/api-docs || exit 1

# 앱 실행 (APP_MODE 환경변수로 모드 전환)
CMD ["node", "dist/src/main"]

# DMS Docker 명령어 치트시트

> 최종 업데이트: 2026-02-13

---

## 현재 포트 구성

| 서비스 | 호스트 포트 | 컨테이너 포트 | 접속 URL |
|--------|-----------|-------------|----------|
| DMS App (NestJS) | **3100** | 3100 | http://localhost:3100 |
| Swagger 문서 | **3100** | 3100 | http://localhost:3100/api-docs |
| PostgreSQL | **5000** | 5432 | `localhost:5000` (DBeaver 등) |
| Redis (선택) | 6379 | 6379 | `localhost:6379` |
| SeaweedFS (선택) | 9333/8080/8888 | 동일 | — |

---

## 시작 / 종료

```bash
# 기본 (App + PostgreSQL)==========================
docker compose up -d --build

# 테스트 유저 시드 포함 (App + PostgreSQL + Seed)
docker compose --profile seed up -d --build

# Redis 포함
docker compose --profile redis up -d --build

# 전체 (App + PostgreSQL + Redis + SeaweedFS)
docker compose --profile full up -d --build

# 전체 + 시드
docker compose --profile full --profile seed up -d --build

# 종료
docker compose down

# 종료 + 데이터 볼륨 전부 삭제 (⚠️ DB 데이터 포함)
docker compose down -v
```

---

## 테스트 유저 시드

```bash
# 앱 실행 후 테스트 유저 생성 (1회성, 자동 종료)====================
docker compose --profile seed up -d --build

# seed 결과 확인
docker compose --profile seed logs dms-seed
```

생성되는 테스트 유저:

| 역할 | 사번 | 이메일 | 비밀번호 |
|------|------|--------|---------|
| GUEST | TEST-GUEST-001 | test-guest@test.local | test1234 |
| USER | TEST-USER-001 | test-user@test.local | test1234 |
| MANAGER | TEST-MGR-001 | test-manager@test.local | test1234 |
| ADMIN | TEST-ADM-001 | test-admin@test.local | test1234 |

seed 실행 순서: **PostgreSQL healthy → App healthy (roles 테이블 생성) → Seed 실행 → 자동 종료**

---

## 상태 확인

```bash
# 컨테이너 상태
docker compose ps

# seed 포함 전체 상태 (-a: 종료된 컨테이너도 표시)
docker compose --profile seed ps -a

# 앱 로그 실시간 (Ctrl+C 종료)
docker compose logs -f dms-app

# 앱 로그 최근 50줄
docker compose logs --tail 50 dms-app

# PostgreSQL 로그
docker compose logs -f postgres

# Seed 결과 로그
docker compose --profile seed logs dms-seed
```

---

## 앱 관리

```bash
# 코드 수정 후 앱만 재빌드 & 재시작
docker compose up -d --build --force-recreate dms-app

# 앱만 재시작 (환경변수만 변경 시)
docker compose restart dms-app

# 앱 중지 / 시작
docker compose stop dms-app
docker compose start dms-app
```

---

## DB 접속

```bash
# 컨테이너 내부 psql
docker exec -it dms-postgres psql -U postgres -d dms

# SQL 직접 실행
docker exec -it dms-postgres psql -U postgres -d dms -c "SELECT count(*) FROM pg_tables;"

# DB 백업
docker exec dms-postgres pg_dump -U postgres dms > backup.sql

# DB 복원
docker exec -i dms-postgres psql -U postgres -d dms < backup.sql
```

**외부 도구 접속 정보 (DBeaver, pgAdmin 등):**

| 항목 | 값 |
|------|-----|
| Host | `localhost` |
| Port | `5000` |
| User | `postgres` |
| Password | `postgres` |
| Database | `dms` |

---

## 컨테이너 쉘 접속

```bash
docker exec -it dms-app sh          # 앱 컨테이너
docker exec -it dms-postgres sh     # PostgreSQL 컨테이너
```

---

## 이미지 / 볼륨 / 정리

```bash
# 이미지 목록
docker images | grep dms

# 이미지 삭제 (재빌드 필요 시)
docker rmi dms_project-dms-app

# 볼륨 목록
docker volume ls | grep dms

# 미사용 리소스 정리
docker system prune -f
docker volume prune -f

# 빌드 캐시 초기화 (빌드 문제 시)
docker compose build --no-cache dms-app
docker compose up -d
```

---

## 트러블슈팅

### 포트 충돌
```bash
# 사용 중인 포트 확인 (Windows)
netstat -ano | findstr :3100

# 다른 포트로 실행
APP_PORT=3200 docker compose up -d --build
```

### 앱 재시작 반복
```bash
docker compose logs --tail 50 dms-app    # 원인 확인
docker inspect dms-app                    # 상세 정보
```

### DB 연결 불가
```bash
docker compose ps postgres                          # 상태 확인
docker compose logs postgres                         # 로그 확인
docker exec dms-postgres pg_isready -U postgres      # 수동 체크
```

---

## 환경 변수 파일

| 파일 | 용도 |
|------|------|
| `.env` | docker-compose 변수 치환 + 로컬 개발용 |
| `.env.docker` | 컨테이너 앱 환경 변수 (실제 사용) |
| `.env.docker.example` | 환경 변수 템플릿 (참고용) |

**우선순위**: `docker-compose.yml environment:` > `.env.docker` > `.env`

---

## 전체 실행 흐름

```
docker compose --profile seed up -d --build
     │
     ├─ 1. PostgreSQL 시작 → healthcheck 통과 대기
     │
     ├─ 2. DMS App 시작 (PostgreSQL healthy 후)
     │     └─ TypeORM 테이블 동기화
     │     └─ PermissionSyncService: roles 테이블 초기화
     │     └─ MockSSOService 활성화 (NODE_ENV=dev)
     │     └─ healthcheck 통과
     │
     └─ 3. Seed 실행 (App healthy 후)
           └─ 테스트 부서/직책/직급 생성
           └─ 테스트 유저 4명 생성 (GUEST/USER/MANAGER/ADMIN)
           └─ 완료 후 자동 종료 (Exit 0)
```

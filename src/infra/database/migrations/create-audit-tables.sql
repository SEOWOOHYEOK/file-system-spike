-- ============================================
-- DMS 로깅 시스템 - 추가 인덱스
-- ============================================
--
-- 주의: 테이블과 기본 인덱스는 TypeORM synchronize로 자동 생성됩니다.
-- 이 파일은 TypeORM이 지원하지 않는 특수 인덱스만 포함합니다.
--
-- 실행 시점: TypeORM이 테이블 생성 후 수동 실행
-- 실행 방법: psql -d <database> -f create-audit-tables.sql
--
-- ============================================

-- ============================================
-- 1. GIN 인덱스 (JSONB 필드 검색 최적화)
-- ============================================

-- audit_logs.metadata GIN 인덱스
-- 용도: metadata 필드 내 특정 키/값 검색
-- 예: WHERE metadata->>'fileSize' > '1000000'
CREATE INDEX IF NOT EXISTS idx_audit_metadata_gin 
    ON audit_logs USING GIN (metadata);

-- security_logs.details GIN 인덱스
-- 용도: details 필드 내 특정 키/값 검색
CREATE INDEX IF NOT EXISTS idx_security_details_gin 
    ON security_logs USING GIN (details);

-- ============================================
-- 2. 부분 인덱스 (Partial Index)
-- ============================================

-- 실패 로그 전용 부분 인덱스 (보안 분석 핵심)
-- 용도: result = 'FAIL' 인 로그만 빠르게 조회
-- 예: 공격 시도 탐지, 실패 패턴 분석
CREATE INDEX IF NOT EXISTS idx_audit_fail_only 
    ON audit_logs(user_id, created_at DESC) 
    WHERE result = 'FAIL';

-- 기밀 파일 접근 전용 부분 인덱스
-- 용도: sensitivity = 'CONFIDENTIAL' 인 로그만 빠르게 조회
-- 예: 기밀 문서 접근 감사
CREATE INDEX IF NOT EXISTS idx_audit_confidential_only 
    ON audit_logs(user_id, action, created_at DESC) 
    WHERE sensitivity = 'CONFIDENTIAL';

-- 로그인 실패 전용 부분 인덱스
-- 용도: 로그인 실패 이벤트만 빠르게 조회
-- 예: 브루트포스 공격 탐지
CREATE INDEX IF NOT EXISTS idx_security_login_failure_only 
    ON security_logs(ip_address, created_at DESC) 
    WHERE event_type = 'LOGIN_FAILURE';

-- 높은 심각도 이벤트 전용 부분 인덱스
-- 용도: severity가 HIGH 또는 CRITICAL인 이벤트만 조회
-- 예: 긴급 대응이 필요한 보안 이벤트
CREATE INDEX IF NOT EXISTS idx_security_high_severity_only 
    ON security_logs(user_id, created_at DESC) 
    WHERE severity IN ('HIGH', 'CRITICAL');

-- ============================================
-- 3. 테이블 코멘트 (문서화)
-- ============================================

COMMENT ON TABLE audit_logs IS '감사 로그 - 사용자 행위 기록 (append-only, TypeORM 자동 생성)';
COMMENT ON TABLE security_logs IS '보안 로그 - 인증/보안 이벤트 기록 (TypeORM 자동 생성)';
COMMENT ON TABLE file_histories IS '파일 이력 - 파일 변경 이력 (영구 보관, TypeORM 자동 생성)';

COMMENT ON COLUMN audit_logs.request_id IS 'HTTP 요청 고유 ID (상관관계 추적)';
COMMENT ON COLUMN audit_logs.session_id IS '사용자 세션 ID (세션별 활동 추적)';
COMMENT ON COLUMN audit_logs.trace_id IS '여러 요청을 아우르는 작업 추적 ID (멀티파트 업로드 등)';
COMMENT ON COLUMN audit_logs.user_name IS '사용자 이름 (비정규화 - 조회 성능 최적화)';
COMMENT ON COLUMN audit_logs.target_name IS '대상 이름 (비정규화 - 삭제되어도 유지)';
COMMENT ON COLUMN audit_logs.sensitivity IS '기밀 등급 (PUBLIC/INTERNAL/CONFIDENTIAL)';
COMMENT ON COLUMN audit_logs.metadata IS '액션별 추가 정보 (JSONB, 유연한 확장)';
COMMENT ON COLUMN audit_logs.device_fingerprint IS '디바이스 핑거프린트 (IP+UserAgent 해시)';

COMMENT ON COLUMN security_logs.username_attempted IS '로그인 시도된 사용자명 (로그인 실패 시 기록)';
COMMENT ON COLUMN security_logs.severity IS '심각도 (INFO/WARN/HIGH/CRITICAL)';
COMMENT ON COLUMN security_logs.details IS '이벤트 상세 정보 (JSONB)';

COMMENT ON COLUMN file_histories.checksum_before IS '변경 전 파일 체크섬 (SHA-256)';
COMMENT ON COLUMN file_histories.checksum_after IS '변경 후 파일 체크섬 (SHA-256)';

-- ============================================
-- 4. 파티셔닝 (선택적 - 대용량 환경)
-- ============================================
-- 
-- 월간 100만건 이상 로그 예상 시 파티셔닝 권장
-- 아래는 참고용 예시이며, 기존 테이블을 파티션 테이블로 변환하려면
-- 별도의 마이그레이션 전략이 필요합니다.
--
-- -- 파티션 테이블 생성 예시
-- CREATE TABLE audit_logs_partitioned (
--     LIKE audit_logs INCLUDING ALL
-- ) PARTITION BY RANGE (created_at);
--
-- -- 월별 파티션 생성
-- CREATE TABLE audit_logs_2025_01 PARTITION OF audit_logs_partitioned
--     FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');
-- CREATE TABLE audit_logs_2025_02 PARTITION OF audit_logs_partitioned
--     FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');
--
-- ============================================

/**
 * Audit E2E 검증 스크립트
 *
 * 파일 핵심 API 호출 후 audit_logs 테이블에 감사 로그가 정확히 기록되는지 검증한다.
 *
 * 실행:
 *   npx ts-node scripts/audit-e2e-verify.ts
 *
 * 필수 환경변수 (.env 또는 쉘):
 *   TEST_BASE_URL          — dev 서버 주소 (기본: http://localhost:3000)
 *   TEST_SSO_EMAIL         — SSO 로그인 이메일
 *   TEST_SSO_PASSWORD      — SSO 로그인 비밀번호
 *   TEST_FOLDER_ID         — 업로드/다운로드 대상 폴더 UUID
 *   TEST_MOVE_TARGET_FOLDER_ID — 파일 이동 대상 폴더 UUID
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import axios, { AxiosInstance } from 'axios';
import FormData = require('form-data');
import { Client } from 'pg';

// ─── .env 로드 ───────────────────────────────────────
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

// ─── 설정 ────────────────────────────────────────────
const CONFIG = {
  baseUrl: process.env.TEST_BASE_URL || 'http://localhost:3000',
  ssoEmail: process.env.TEST_SSO_EMAIL || '',
  ssoPassword: process.env.TEST_SSO_PASSWORD || '',
  folderId: process.env.TEST_FOLDER_ID || '',
  moveTargetFolderId: process.env.TEST_MOVE_TARGET_FOLDER_ID || '',
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_DATABASE || 'dms',
  },
  /** 버퍼 flush 대기 시간 (ms) — AuditLogService flushInterval(5s) + 여유 1s */
  flushWaitMs: 6000,
};

// ─── 타입 ────────────────────────────────────────────
interface TestResult {
  name: string;
  action: string;
  passed: boolean;
  details: string;
  auditRow?: Record<string, unknown>;
}

interface AuditRow {
  id: string;
  action: string;
  target_type: string;
  target_id: string;
  target_path: string | null;
  target_name: string | null;
  user_id: string;
  result: string;
  http_method: string | null;
  api_endpoint: string | null;
  ip_address: string;
  description: string;
  metadata: Record<string, unknown> | null;
  response_status_code: number | null;
  created_at: Date;
}

// ─── 유틸리티 ─────────────────────────────────────────
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function log(emoji: string, msg: string): void {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`  ${emoji} [${ts}] ${msg}`);
}

// ─── DB 헬퍼 ─────────────────────────────────────────
async function findAuditLog(
  db: Client,
  action: string,
  targetId: string,
  userId: string,
): Promise<AuditRow | null> {
  const { rows } = await db.query<AuditRow>(
    `SELECT * FROM audit_logs
     WHERE action = $1
       AND target_id = $2
       AND user_id = $3
     ORDER BY created_at DESC
     LIMIT 1`,
    [action, targetId, userId],
  );
  return rows[0] || null;
}

// ─── 공통 검증 ────────────────────────────────────────
function verifyCommonFields(
  row: AuditRow,
  expected: {
    action: string;
    targetId: string;
    userId: string;
    httpMethod: string;
  },
): string[] {
  const errors: string[] = [];

  if (row.action !== expected.action) {
    errors.push(`action: expected "${expected.action}", got "${row.action}"`);
  }
  if (row.target_type !== 'FILE') {
    errors.push(`target_type: expected "FILE", got "${row.target_type}" (enum이 대문자여야 함)`);
  }
  if (row.target_id !== expected.targetId) {
    errors.push(`target_id: expected "${expected.targetId}", got "${row.target_id}"`);
  }
  if (row.user_id !== expected.userId) {
    errors.push(`user_id: expected "${expected.userId}", got "${row.user_id}"`);
  }
  if (row.result !== 'SUCCESS') {
    errors.push(`result: expected "SUCCESS", got "${row.result}"`);
  }
  if (row.http_method !== expected.httpMethod) {
    errors.push(`http_method: expected "${expected.httpMethod}", got "${row.http_method}"`);
  }
  if (!row.ip_address) {
    errors.push('ip_address: missing');
  }
  if (!row.description) {
    errors.push('description: missing');
  }

  return errors;
}

// ─── 메인 ────────────────────────────────────────────
async function main(): Promise<void> {
  console.log('\n══════════════════════════════════════════════');
  console.log('  Audit E2E 검증 스크립트');
  console.log('══════════════════════════════════════════════\n');

  // ── 설정 검증 ──
  const missingEnvs: string[] = [];
  if (!CONFIG.ssoEmail) missingEnvs.push('TEST_SSO_EMAIL');
  if (!CONFIG.ssoPassword) missingEnvs.push('TEST_SSO_PASSWORD');
  if (!CONFIG.folderId) missingEnvs.push('TEST_FOLDER_ID');
  if (!CONFIG.moveTargetFolderId) missingEnvs.push('TEST_MOVE_TARGET_FOLDER_ID');

  if (missingEnvs.length > 0) {
    console.error(`❌ 필수 환경변수가 설정되지 않았습니다: ${missingEnvs.join(', ')}`);
    console.error('   .env 파일 또는 쉘 환경변수에 설정해주세요.\n');
    process.exit(1);
  }

  log('🔧', `서버: ${CONFIG.baseUrl}`);
  log('🔧', `DB: ${CONFIG.db.host}:${CONFIG.db.port}/${CONFIG.db.database}`);

  // ── DB 연결 ──
  const db = new Client(CONFIG.db);
  await db.connect();
  log('✅', 'DB 연결 성공');

  // ── HTTP 클라이언트 ──
  const http = axios.create({
    baseURL: CONFIG.baseUrl,
    timeout: 30000,
    validateStatus: () => true, // 모든 상태코드 허용 (수동 검증)
  });

  const results: TestResult[] = [];

  try {
    // ════════════════════════════════════════════
    // Step 0: SSO 로그인
    // ════════════════════════════════════════════
    log('🔐', 'SSO 로그인 시도...');
    const loginRes = await http.post('/v1/auth/login', {
      email: CONFIG.ssoEmail,
      password: CONFIG.ssoPassword,
    });

    if (loginRes.status !== 201 && loginRes.status !== 200) {
      console.error(`❌ 로그인 실패: HTTP ${loginRes.status}`, loginRes.data);
      process.exit(1);
    }

    const token: string = loginRes.data.token;
    const userId: string = loginRes.data.user.id;
    const userName: string = loginRes.data.user.name;

    log('✅', `로그인 성공: userId=${userId}, userName=${userName}`);

    // 인증 헤더 설정
    http.defaults.headers.common['Authorization'] = `Bearer ${token}`;

    // ════════════════════════════════════════════
    // Step 1: FILE_UPLOAD
    // ════════════════════════════════════════════
    log('📤', '[1/6] 파일 업로드 테스트...');
    const testFileName = `audit-test-${Date.now()}.txt`;
    const testFileContent = Buffer.from('Audit E2E 검증 테스트 파일 내용');

    const uploadForm = new FormData();
    uploadForm.append('file', testFileContent, {
      filename: testFileName,
      contentType: 'text/plain',
    });
    uploadForm.append('folderId', CONFIG.folderId);

    const uploadRes = await http.post('/v1/files/upload', uploadForm, {
      headers: uploadForm.getHeaders(),
    });

    if (uploadRes.status !== 201) {
      results.push({
        name: 'FILE_UPLOAD',
        action: 'FILE_UPLOAD',
        passed: false,
        details: `API 호출 실패: HTTP ${uploadRes.status} — ${JSON.stringify(uploadRes.data)}`,
      });
    } else {
      const fileId: string = uploadRes.data.id;
      const filePath: string | undefined = uploadRes.data.path;
      log('📤', `업로드 성공: fileId=${fileId}, path=${filePath}`);

      // flush 대기
      log('⏳', `${CONFIG.flushWaitMs / 1000}초 대기 (버퍼 flush)...`);
      await sleep(CONFIG.flushWaitMs);

      const row = await findAuditLog(db, 'FILE_UPLOAD', fileId, userId);
      if (!row) {
        results.push({
          name: 'FILE_UPLOAD',
          action: 'FILE_UPLOAD',
          passed: false,
          details: 'audit_logs에 레코드 없음',
        });
      } else {
        const errors = verifyCommonFields(row, {
          action: 'FILE_UPLOAD',
          targetId: fileId,
          userId,
          httpMethod: 'POST',
        });

        // target_path 검증
        if (!row.target_path) {
          errors.push('target_path: missing');
        }

        // metadata 검증
        const meta = row.metadata || {};
        if (!meta.originalName && !meta.fileName) errors.push('metadata.originalName/fileName: missing');
        if (!meta.fileSize && !meta.size) errors.push('metadata.fileSize/size: missing');
        if (!meta.mimeType) errors.push('metadata.mimeType: missing');

        results.push({
          name: 'FILE_UPLOAD',
          action: 'FILE_UPLOAD',
          passed: errors.length === 0,
          details: errors.length === 0
            ? `target_id=${fileId}, target_path=${row.target_path}`
            : errors.join('; '),
          auditRow: row as unknown as Record<string, unknown>,
        });
      }

      // ════════════════════════════════════════════
      // Step 2: FILE_DOWNLOAD
      // ════════════════════════════════════════════
      log('📥', '[2/6] 파일 다운로드 테스트...');
      const downloadRes = await http.get(`/v1/files/${fileId}/download`, {
        responseType: 'arraybuffer',
      });

      if (downloadRes.status !== 200 && downloadRes.status !== 206) {
        results.push({
          name: 'FILE_DOWNLOAD',
          action: 'FILE_DOWNLOAD',
          passed: false,
          details: `API 호출 실패: HTTP ${downloadRes.status}`,
        });
      } else {
        log('📥', `다운로드 성공: HTTP ${downloadRes.status}`);
        log('⏳', `${CONFIG.flushWaitMs / 1000}초 대기 (버퍼 flush)...`);
        await sleep(CONFIG.flushWaitMs);

        const row = await findAuditLog(db, 'FILE_DOWNLOAD', fileId, userId);
        if (!row) {
          results.push({
            name: 'FILE_DOWNLOAD',
            action: 'FILE_DOWNLOAD',
            passed: false,
            details: 'audit_logs에 레코드 없음',
          });
        } else {
          const errors = verifyCommonFields(row, {
            action: 'FILE_DOWNLOAD',
            targetId: fileId,
            userId,
            httpMethod: 'GET',
          });
          if (!row.target_path) errors.push('target_path: missing');

          results.push({
            name: 'FILE_DOWNLOAD',
            action: 'FILE_DOWNLOAD',
            passed: errors.length === 0,
            details: errors.length === 0
              ? `target_id=${fileId}, target_path=${row.target_path}`
              : errors.join('; '),
            auditRow: row as unknown as Record<string, unknown>,
          });
        }
      }

      // ════════════════════════════════════════════
      // Step 3: FILE_VIEW (preview)
      // ════════════════════════════════════════════
      log('👁️', '[3/6] 파일 미리보기 테스트...');
      const previewRes = await http.get(`/v1/files/${fileId}/preview`, {
        responseType: 'arraybuffer',
      });

      if (previewRes.status !== 200 && previewRes.status !== 206) {
        results.push({
          name: 'FILE_VIEW',
          action: 'FILE_VIEW',
          passed: false,
          details: `API 호출 실패: HTTP ${previewRes.status}`,
        });
      } else {
        log('👁️', `미리보기 성공: HTTP ${previewRes.status}`);
        log('⏳', `${CONFIG.flushWaitMs / 1000}초 대기 (버퍼 flush)...`);
        await sleep(CONFIG.flushWaitMs);

        const row = await findAuditLog(db, 'FILE_VIEW', fileId, userId);
        if (!row) {
          results.push({
            name: 'FILE_VIEW',
            action: 'FILE_VIEW',
            passed: false,
            details: 'audit_logs에 레코드 없음',
          });
        } else {
          const errors = verifyCommonFields(row, {
            action: 'FILE_VIEW',
            targetId: fileId,
            userId,
            httpMethod: 'GET',
          });
          if (!row.target_path) errors.push('target_path: missing');

          results.push({
            name: 'FILE_VIEW',
            action: 'FILE_VIEW',
            passed: errors.length === 0,
            details: errors.length === 0
              ? `target_id=${fileId}, target_path=${row.target_path}`
              : errors.join('; '),
            auditRow: row as unknown as Record<string, unknown>,
          });
        }
      }

      // ════════════════════════════════════════════
      // Step 4: FILE_RENAME
      // ════════════════════════════════════════════
      log('✏️', '[4/6] 파일 이름변경 테스트...');
      const newName = `renamed-${Date.now()}.txt`;
      const renameRes = await http.put(`/v1/files/${fileId}/rename`, {
        newName,
      });

      if (renameRes.status !== 200) {
        results.push({
          name: 'FILE_RENAME',
          action: 'FILE_RENAME',
          passed: false,
          details: `API 호출 실패: HTTP ${renameRes.status} — ${JSON.stringify(renameRes.data)}`,
        });
      } else {
        log('✏️', `이름변경 성공: ${testFileName} → ${newName}`);
        log('⏳', `${CONFIG.flushWaitMs / 1000}초 대기 (버퍼 flush)...`);
        await sleep(CONFIG.flushWaitMs);

        const row = await findAuditLog(db, 'FILE_RENAME', fileId, userId);
        if (!row) {
          results.push({
            name: 'FILE_RENAME',
            action: 'FILE_RENAME',
            passed: false,
            details: 'audit_logs에 레코드 없음',
          });
        } else {
          const errors = verifyCommonFields(row, {
            action: 'FILE_RENAME',
            targetId: fileId,
            userId,
            httpMethod: 'PUT',
          });
          if (!row.target_path) errors.push('target_path: missing');

          const meta = row.metadata || {};
          if (!meta.newName) errors.push('metadata.newName: missing');

          results.push({
            name: 'FILE_RENAME',
            action: 'FILE_RENAME',
            passed: errors.length === 0,
            details: errors.length === 0
              ? `target_id=${fileId}, target_path=${row.target_path}, newName=${meta.newName}`
              : errors.join('; '),
            auditRow: row as unknown as Record<string, unknown>,
          });
        }
      }

      // ════════════════════════════════════════════
      // Step 5: FILE_MOVE
      // ════════════════════════════════════════════
      log('📁', '[5/6] 파일 이동 테스트...');
      const moveRes = await http.post(`/v1/files/${fileId}/move`, {
        targetFolderId: CONFIG.moveTargetFolderId,
      });

      if (moveRes.status !== 200 && moveRes.status !== 201) {
        results.push({
          name: 'FILE_MOVE',
          action: 'FILE_MOVE',
          passed: false,
          details: `API 호출 실패: HTTP ${moveRes.status} — ${JSON.stringify(moveRes.data)}`,
        });
      } else {
        log('📁', `이동 성공: targetFolder=${CONFIG.moveTargetFolderId}`);
        log('⏳', `${CONFIG.flushWaitMs / 1000}초 대기 (버퍼 flush)...`);
        await sleep(CONFIG.flushWaitMs);

        const row = await findAuditLog(db, 'FILE_MOVE', fileId, userId);
        if (!row) {
          results.push({
            name: 'FILE_MOVE',
            action: 'FILE_MOVE',
            passed: false,
            details: 'audit_logs에 레코드 없음',
          });
        } else {
          const errors = verifyCommonFields(row, {
            action: 'FILE_MOVE',
            targetId: fileId,
            userId,
            httpMethod: 'POST',
          });
          if (!row.target_path) errors.push('target_path: missing');

          const meta = row.metadata || {};
          if (!meta.targetFolderId) errors.push('metadata.targetFolderId: missing');

          results.push({
            name: 'FILE_MOVE',
            action: 'FILE_MOVE',
            passed: errors.length === 0,
            details: errors.length === 0
              ? `target_id=${fileId}, target_path=${row.target_path}, targetFolderId=${meta.targetFolderId}`
              : errors.join('; '),
            auditRow: row as unknown as Record<string, unknown>,
          });
        }
      }

      // ════════════════════════════════════════════
      // Step 6: FILE_DELETE
      // ════════════════════════════════════════════
      log('🗑️', '[6/6] 파일 삭제 테스트...');
      const deleteRes = await http.delete(`/v1/files/${fileId}`);

      if (deleteRes.status !== 200) {
        results.push({
          name: 'FILE_DELETE',
          action: 'FILE_DELETE',
          passed: false,
          details: `API 호출 실패: HTTP ${deleteRes.status} — ${JSON.stringify(deleteRes.data)}`,
        });
      } else {
        log('🗑️', `삭제 성공: fileId=${fileId}`);
        log('⏳', `${CONFIG.flushWaitMs / 1000}초 대기 (버퍼 flush)...`);
        await sleep(CONFIG.flushWaitMs);

        const row = await findAuditLog(db, 'FILE_DELETE', fileId, userId);
        if (!row) {
          results.push({
            name: 'FILE_DELETE',
            action: 'FILE_DELETE',
            passed: false,
            details: 'audit_logs에 레코드 없음',
          });
        } else {
          const errors = verifyCommonFields(row, {
            action: 'FILE_DELETE',
            targetId: fileId,
            userId,
            httpMethod: 'DELETE',
          });
          if (!row.target_path) errors.push('target_path: missing');

          results.push({
            name: 'FILE_DELETE',
            action: 'FILE_DELETE',
            passed: errors.length === 0,
            details: errors.length === 0
              ? `target_id=${fileId}, target_path=${row.target_path}`
              : errors.join('; '),
            auditRow: row as unknown as Record<string, unknown>,
          });
        }
      }
    }
  } catch (error: any) {
    console.error('\n❌ 예기치 않은 오류:', error.message);
    if (error.response) {
      console.error('   응답:', error.response.status, error.response.data);
    }
  } finally {
    await db.end();
  }

  // ════════════════════════════════════════════
  // 결과 출력 + 파일 저장
  // ════════════════════════════════════════════
  const passed = results.filter((r) => r.passed).length;
  const total = results.length;
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const reportPath = path.resolve(__dirname, '..', 'docs', `audit-e2e-result-${timestamp}.md`);

  // ── Markdown 보고서 생성 ──
  const lines: string[] = [];
  lines.push(`# Audit E2E 검증 결과`);
  lines.push('');
  lines.push(`> 실행 시각: ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`);
  lines.push(`> 서버: ${CONFIG.baseUrl}`);
  lines.push(`> DB: ${CONFIG.db.host}:${CONFIG.db.port}/${CONFIG.db.database}`);
  lines.push('');
  lines.push(`## 요약: ${passed}/${total} 통과`);
  lines.push('');
  lines.push('| # | Action | 결과 | 요약 |');
  lines.push('|---|--------|------|------|');

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const icon = r.passed ? 'PASS' : 'FAIL';
    lines.push(`| ${i + 1} | ${r.name} | ${icon} | ${r.details} |`);
  }

  lines.push('');

  // ── 각 테스트 상세 ──
  lines.push('## 상세 결과');
  lines.push('');

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const icon = r.passed ? 'PASS' : 'FAIL';
    lines.push(`### ${i + 1}. ${r.name} — ${icon}`);
    lines.push('');
    lines.push(`- **검증 결과**: ${r.details}`);
    lines.push('');

    if (r.auditRow) {
      lines.push('<details>');
      lines.push(`<summary>audit_logs DB row 전체</summary>`);
      lines.push('');
      lines.push('```json');
      lines.push(JSON.stringify(r.auditRow, null, 2));
      lines.push('```');
      lines.push('');
      lines.push('</details>');
      lines.push('');

      // 주요 필드 테이블
      const row = r.auditRow as Record<string, unknown>;
      lines.push('| 필드 | 값 |');
      lines.push('|------|-----|');
      lines.push(`| action | ${row.action} |`);
      lines.push(`| target_type | ${row.target_type} |`);
      lines.push(`| target_id | ${row.target_id} |`);
      lines.push(`| target_path | ${row.target_path ?? '(null)'} |`);
      lines.push(`| target_name | ${row.target_name ?? '(null)'} |`);
      lines.push(`| user_id | ${row.user_id} |`);
      lines.push(`| result | ${row.result} |`);
      lines.push(`| http_method | ${row.http_method ?? '(null)'} |`);
      lines.push(`| api_endpoint | ${row.api_endpoint ?? '(null)'} |`);
      lines.push(`| ip_address | ${row.ip_address ?? '(null)'} |`);
      lines.push(`| description | ${row.description ?? '(null)'} |`);
      lines.push(`| response_status_code | ${row.response_status_code ?? '(null)'} |`);
      lines.push(`| created_at | ${row.created_at} |`);
      lines.push('');

      if (row.metadata) {
        lines.push('**metadata:**');
        lines.push('');
        lines.push('```json');
        lines.push(JSON.stringify(row.metadata, null, 2));
        lines.push('```');
        lines.push('');
      }
    }

    lines.push('---');
    lines.push('');
  }

  const reportContent = lines.join('\n');

  // ── 파일 저장 ──
  // docs 디렉토리 확인
  const docsDir = path.resolve(__dirname, '..', 'docs');
  if (!fs.existsSync(docsDir)) {
    fs.mkdirSync(docsDir, { recursive: true });
  }
  fs.writeFileSync(reportPath, reportContent, 'utf-8');

  // ── 콘솔 출력 (요약만) ──
  console.log('\n══════════════════════════════════════════════');
  console.log('  테스트 결과');
  console.log('══════════════════════════════════════════════\n');

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const icon = r.passed ? '✅' : '❌';
    console.log(`  ${icon} [${i + 1}/${total}] ${r.name.padEnd(15)} — ${r.details}`);
  }

  console.log(`\n  결과: ${passed}/${total} 통과`);
  console.log(`\n  📄 상세 보고서: ${reportPath}`);
  console.log('\n══════════════════════════════════════════════\n');
  process.exit(passed === total ? 0 : 1);
}

// ─── 실행 ────────────────────────────────────────────
main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

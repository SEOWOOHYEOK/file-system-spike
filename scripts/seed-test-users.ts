/**
 * 테스트 유저 시드 스크립트
 *
 * 4가지 권한 레벨의 테스트 유저를 생성/삭제합니다.
 *
 * ┌──────────┬────────────────┬──────────┬──────────┐
 * │ 역할     │ 사번           │ 아이디   │ 비밀번호 │
 * ├──────────┼────────────────┼──────────┼──────────┤
 * │ GUEST    │ TEST-GUEST-001 │ guest    │ test1234 │
 * │ USER     │ TEST-USER-001  │ user     │ test1234 │
 * │ MANAGER  │ TEST-MGR-001   │ manager  │ test1234 │
 * │ ADMIN    │ TEST-ADM-001   │ admin    │ test1234 │
 * └──────────┴────────────────┴──────────┴──────────┘
 *
 * 사용법:
 *   npm run seed:test-users          # 테스트 유저 생성
 *   npm run unseed:test-users        # 테스트 유저 삭제
 *
 * 또는 직접 실행:
 *   npx ts-node scripts/seed-test-users.ts seed
 *   npx ts-node scripts/seed-test-users.ts unseed
 */

import * as path from 'path';
import { Client } from 'pg';

// ─── .env 로드 (로컬 실행 시에만, Docker에서는 env_file로 주입) ──
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const dotenv = require('dotenv');
  dotenv.config({ path: path.resolve(__dirname, '..', '.env') });
} catch {
  // dotenv 미설치 환경(Docker production)에서는 무시
}

// ─── 고정 UUID (쉬운 식별 및 삭제용, 모두 valid hex) ──
const IDS = {
  department: 'aaaa0000-0000-4000-a000-000000000001',
  position:   'aaaa0000-0000-4000-a000-000000000002',
  rank:       'aaaa0000-0000-4000-a000-000000000003',
  employees: {
    guest:    'aaaa0000-0001-4000-a000-000000000001',
    user:     'aaaa0000-0001-4000-a000-000000000002',
    manager:  'aaaa0000-0001-4000-a000-000000000003',
    admin:    'aaaa0000-0001-4000-a000-000000000004',
  },
  edp: {
    guest:    'aaaa0000-0002-4000-a000-000000000001',
    user:     'aaaa0000-0002-4000-a000-000000000002',
    manager:  'aaaa0000-0002-4000-a000-000000000003',
    admin:    'aaaa0000-0002-4000-a000-000000000004',
  },
};

// ─── 테스트 유저 정보 ────────────────────────────────
const TEST_PASSWORD = 'test1234';

interface TestUserDef {
  key: 'guest' | 'user' | 'manager' | 'admin';
  roleName: string;
  employeeNumber: string;
  name: string;
  email: string;
  isExternal: boolean;
}

const TEST_USERS: TestUserDef[] = [
  {
    key: 'guest',
    roleName: 'GUEST',
    employeeNumber: 'TEST-GUEST-001',
    name: '테스트_외부인',
    email: 'test-guest@test.local',
    isExternal: true,
  },
  {
    key: 'user',
    roleName: 'USER',
    employeeNumber: 'TEST-USER-001',
    name: '테스트_사용자',
    email: 'test-user@test.local',
    isExternal: false,
  },
  {
    key: 'manager',
    roleName: 'MANAGER',
    employeeNumber: 'TEST-MGR-001',
    name: '테스트_매니저',
    email: 'test-manager@test.local',
    isExternal: false,
  },
  {
    key: 'admin',
    roleName: 'ADMIN',
    employeeNumber: 'TEST-ADM-001',
    name: '테스트_관리자',
    email: 'test-admin@test.local',
    isExternal: false,
  },
];

// ─── DB 연결 ─────────────────────────────────────────
function createClient(): Client {
  return new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_DATABASE || 'dms',
  });
}

// ─── SEED: 테스트 유저 생성 ──────────────────────────
async function seed(): Promise<void> {
  const client = createClient();
  await client.connect();
  console.log('✅ DB 연결 성공\n');

  try {
    await client.query('BEGIN');

    // 1. 테스트 부서 생성 (내부 유저용)
    //    order 충돌 방지: 기존 MAX order + 100
    const maxOrderResult = await client.query(
      `SELECT COALESCE(MAX("order"), 0) + 100 AS next_order FROM "departments-info" WHERE "parentDepartmentId" IS NULL`,
    );
    const nextOrder = maxOrderResult.rows[0].next_order;

    await client.query(
      `INSERT INTO "departments-info" (id, "departmentName", "departmentCode", type, "parentDepartmentId", "order")
       VALUES ($1, $2, $3, $4, NULL, $5)
       ON CONFLICT (id) DO NOTHING`,
      [IDS.department, '테스트부서', 'TEST-DEPT-001', 'DEPARTMENT', nextOrder],
    );
    console.log('📁 테스트 부서 생성: 테스트부서 (TEST-DEPT-001)');

    // 2. 테스트 직책 생성
    await client.query(
      `INSERT INTO positions (id, "positionTitle", "positionCode", level, "hasManagementAuthority")
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO NOTHING`,
      [IDS.position, '테스트직원', 'TEST-POS-001', 99, false],
    );
    console.log('👤 테스트 직책 생성: 테스트직원 (TEST-POS-001)');

    // 3. 테스트 직급 생성
    await client.query(
      `INSERT INTO ranks (id, "rankTitle", "rankCode", level)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO NOTHING`,
      [IDS.rank, '테스트직급', 'TEST-RANK-001', 99],
    );
    console.log('🏷️  테스트 직급 생성: 테스트직급 (TEST-RANK-001)');

    // 4. 역할(Role) ID 조회
    const rolesResult = await client.query(`SELECT id, name FROM roles`);
    const roleMap = new Map<string, string>();
    for (const row of rolesResult.rows) {
      roleMap.set(row.name, row.id);
    }
    console.log(`\n🔑 역할 조회 완료: ${[...roleMap.keys()].join(', ')}`);

    // EXTERNAL_DEPARTMENT_ID 조회
    const externalDeptId = process.env.EXTERNAL_DEPARTMENT_ID;
    if (!externalDeptId) {
      console.warn('⚠️  EXTERNAL_DEPARTMENT_ID 미설정 - 외부인(GUEST)은 내부 부서에 생성됩니다.');
    }

    // 5. 테스트 유저 생성
    console.log('\n─── 테스트 유저 생성 ───');

    for (const userDef of TEST_USERS) {
      const employeeId = IDS.employees[userDef.key];
      const edpId = IDS.edp[userDef.key];
      const roleId = roleMap.get(userDef.roleName) || null;

      if (!roleId) {
        console.error(`❌ 역할 ${userDef.roleName}을 찾을 수 없습니다. 앱을 한번 실행하여 역할을 초기화하세요.`);
        continue;
      }

      // 5a. Employee 생성
      await client.query(
        `INSERT INTO "employees-info" (
          id, "employeeNumber", name, email, password, "hireDate", status,
          "currentRankId", "isInitialPasswordSet"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (id) DO UPDATE SET
          "employeeNumber" = EXCLUDED."employeeNumber",
          name = EXCLUDED.name,
          email = EXCLUDED.email,
          password = EXCLUDED.password,
          status = EXCLUDED.status,
          "currentRankId" = EXCLUDED."currentRankId"`,
        [
          employeeId,
          userDef.employeeNumber,
          userDef.name,
          userDef.email,
          TEST_PASSWORD,
          '2025-01-01',
          '재직중',
          IDS.rank,
          false,
        ],
      );

      // 5b. Employee-Department-Position 연결
      const deptId = userDef.isExternal && externalDeptId ? externalDeptId : IDS.department;
      await client.query(
        `INSERT INTO employee_department_positions (
          id, "employeeId", "departmentId", "positionId", "isManager"
        ) VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (id) DO UPDATE SET
          "departmentId" = EXCLUDED."departmentId",
          "positionId" = EXCLUDED."positionId"`,
        [edpId, employeeId, deptId, IDS.position, false],
      );

      // 5c. User 생성 (역할 할당)
      await client.query(
        `INSERT INTO users (id, role_id, is_active)
         VALUES ($1, $2, true)
         ON CONFLICT (id) DO UPDATE SET
           role_id = EXCLUDED.role_id,
           is_active = true`,
        [employeeId, roleId],
      );

      const deptLabel = userDef.isExternal && externalDeptId ? '외부부서' : '테스트부서';
      console.log(
        `  ✅ ${userDef.roleName.padEnd(7)} │ ${userDef.employeeNumber.padEnd(16)} │ ${userDef.name.padEnd(10)} │ ${userDef.email.padEnd(28)} │ ${deptLabel}`,
      );
    }

    await client.query('COMMIT');

    // ─── 결과 요약 ───
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  테스트 유저 생성 완료!');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');
    console.log('  토큰 발급 방법 (Swagger 또는 curl):');
    console.log('  POST /v1/auth/generate-token');
    console.log('');
    for (const u of TEST_USERS) {
      console.log(`  [${u.roleName.padEnd(7)}] { "employeeNumber": "${u.employeeNumber}" }`);
    }
    console.log('');
    console.log('  삭제: npm run unseed:test-users');
    console.log('═══════════════════════════════════════════════════════════════');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ 시드 실패:', err);
    throw err;
  } finally {
    await client.end();
  }
}

// ─── UNSEED: 테스트 유저 삭제 ────────────────────────
async function unseed(): Promise<void> {
  const client = createClient();
  await client.connect();
  console.log('✅ DB 연결 성공\n');

  try {
    await client.query('BEGIN');

    const employeeIds = Object.values(IDS.employees);
    const edpIds = Object.values(IDS.edp);

    // 삭제 순서: FK 의존성 역순
    // 1. users
    const usersResult = await client.query(
      `DELETE FROM users WHERE id = ANY($1)`,
      [employeeIds],
    );
    console.log(`🗑️  users 삭제: ${usersResult.rowCount}건`);

    // 2. employee_department_positions
    const edpResult = await client.query(
      `DELETE FROM employee_department_positions WHERE id = ANY($1)`,
      [edpIds],
    );
    console.log(`🗑️  employee_department_positions 삭제: ${edpResult.rowCount}건`);

    // 3. employees-info
    const empResult = await client.query(
      `DELETE FROM "employees-info" WHERE id = ANY($1)`,
      [employeeIds],
    );
    console.log(`🗑️  employees-info 삭제: ${empResult.rowCount}건`);

    // 4. ranks (테스트용만)
    const rankResult = await client.query(
      `DELETE FROM ranks WHERE id = $1`,
      [IDS.rank],
    );
    console.log(`🗑️  ranks 삭제: ${rankResult.rowCount}건`);

    // 5. positions (테스트용만)
    const posResult = await client.query(
      `DELETE FROM positions WHERE id = $1`,
      [IDS.position],
    );
    console.log(`🗑️  positions 삭제: ${posResult.rowCount}건`);

    // 6. departments-info (테스트용만)
    const deptResult = await client.query(
      `DELETE FROM "departments-info" WHERE id = $1`,
      [IDS.department],
    );
    console.log(`🗑️  departments-info 삭제: ${deptResult.rowCount}건`);

    await client.query('COMMIT');

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  테스트 유저 삭제 완료!');
    console.log('═══════════════════════════════════════════════════════════════');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ 삭제 실패:', err);
    throw err;
  } finally {
    await client.end();
  }
}

// ─── MAIN ────────────────────────────────────────────
async function main(): Promise<void> {
  const command = process.argv[2] || 'seed';

  console.log('');
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log(`║  테스트 유저 시드 스크립트  [${command.toUpperCase()}]`);
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  console.log('');

  switch (command) {
    case 'seed':
      await seed();
      break;
    case 'unseed':
    case 'delete':
    case 'remove':
      await unseed();
      break;
    default:
      console.log('사용법: npx ts-node scripts/seed-test-users.ts [seed|unseed]');
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

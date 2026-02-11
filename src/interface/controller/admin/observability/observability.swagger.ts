/**
 * Observability Controller Swagger 데코레이터
 * 컨트롤러를 깔끔하게 유지하기 위해 Swagger 데코레이터를 분리
 */
import { applyDecorators } from '@nestjs/common';
import {
  ApiOperation,
  ApiOkResponse,
  ApiResponse,
  ApiQuery,
  ApiBody,
} from '@nestjs/swagger';

/**
 * GET /v1/admin/observability/current - NAS 현재 상태 조회 API 문서
 */
export const ApiObservabilityCurrent = () =>
  applyDecorators(
    ApiOperation({
      summary: 'NAS 현재 상태 조회',
      description: `
NAS 스토리지의 현재 연결 상태와 용량 정보를 실시간으로 조회합니다.

### 상태 (status)
- \`healthy\`: 정상 (응답 시간 1초 미만)
- \`degraded\`: 성능 저하 (응답 시간 1초 이상)
- \`unhealthy\`: 연결 불가 또는 오류 발생

### 용량 정보
- healthy/degraded 상태일 때 capacity 정보가 포함됩니다.
- unhealthy 상태일 때는 capacity 대신 error 메시지가 포함됩니다.

### 서버명 (serverName)
NAS UNC 경로에서 자동 추출됩니다.
- 예: \`\\\\\\\\Portal-NAS-01\\\\Web\` → \`Portal-NAS-01\`

### 대시보드 매핑
| 대시보드 항목 | 응답 필드 |
|---|---|
| Storage Usage % | \`usagePercent\` |
| 사용량 / 전체 용량 | \`usedBytes\` / \`totalBytes\` |
| 도넛 차트 | \`usedBytes\`, \`freeBytes\`, \`totalBytes\` |
| SERVER NAME | \`serverName\` |
| STATUS | \`status\` → Online/Offline 매핑 |
| TOTAL CAPACITY | \`totalBytes\` |
| USED SPACE | \`usedBytes\` |
| LAST CHECKED | \`checkedAt\` |
      `,
    }),
    ApiOkResponse({
      description: 'NAS 현재 상태 조회 성공',
      schema: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['healthy', 'degraded', 'unhealthy'],
            description: '스토리지 상태',
            example: 'healthy',
          },
          responseTimeMs: {
            type: 'number',
            description: '응답 시간 (ms)',
            example: 45,
          },
          checkedAt: {
            type: 'string',
            format: 'date-time',
            description: '확인 시각',
            example: '2026-02-09T09:10:00.000Z',
          },
          totalBytes: {
            type: 'number',
            description: '전체 용량 (bytes). healthy/degraded 시에만 포함',
            example: 999893999616,
            nullable: true,
          },
          usedBytes: {
            type: 'number',
            description: '사용 용량 (bytes). healthy/degraded 시에만 포함',
            example: 449952149504,
            nullable: true,
          },
          freeBytes: {
            type: 'number',
            description: '여유 용량 (bytes). healthy/degraded 시에만 포함',
            example: 549941850112,
            nullable: true,
          },
          usagePercent: {
            type: 'number',
            description: '사용률 (%). 소수점 2자리',
            example: 45.0,
            nullable: true,
          },
          serverName: {
            type: 'string',
            description: '서버명 (UNC 경로에서 추출)',
            example: 'Portal-NAS-01',
            nullable: true,
          },
          error: {
            type: 'string',
            description: '에러 메시지 (unhealthy 시에만 포함)',
            example: 'No mapped drive found for UNC path',
            nullable: true,
          },
        },
        required: ['status', 'responseTimeMs', 'checkedAt'],
      },
    }),
    ApiResponse({
      status: 500,
      description: '서버 내부 오류 (PowerShell 실행 실패 등)',
    }),
  );

/**
 * GET /v1/admin/observability/history - NAS 상태 이력 조회 API 문서
 */
export const ApiObservabilityHistory = () =>
  applyDecorators(
    ApiOperation({
      summary: 'NAS 상태 이력 조회',
      description: `
NAS 헬스체크 이력을 조회합니다. Cron 스케줄러가 주기적으로 수행한 헬스체크 결과가 시간순으로 반환됩니다.

### 조회 기간
- 기본값: 24시간
- 최대: 168시간 (7일)
- 이력 보존 기간은 관리자 설정에 따릅니다 (기본 7일)

### 정상 비율 계산
- \`healthy\` 또는 \`degraded\` 상태를 **정상**으로 간주합니다.
- \`unhealthy\` 상태만 **비정상**으로 간주합니다.
- \`healthyPercent\` = (정상 건수 / 전체 건수) × 100

### 시간 계산
- \`healthyHours\` = (healthyPercent / 100) × hours
- \`unhealthyHours\` = hours - healthyHours

### 대시보드 매핑
| 대시보드 항목 | 응답 필드 |
|---|---|
| System Status 75% | \`healthyPercent\` |
| 24H 타임라인 차트 | \`items[]\` (status, checkedAt) |
| 18h 정상 / 6h 비정상 | \`healthyHours\`, \`unhealthyHours\` |

### 타임라인 차트 렌더링
\`items[]\` 배열은 시간순(ASC) 정렬됩니다.
- \`status\`가 \`healthy\` 또는 \`degraded\`이면 1 (정상)
- \`status\`가 \`unhealthy\`이면 0 (비정상)
      `,
    }),
    ApiQuery({
      name: 'hours',
      required: false,
      type: Number,
      description: '조회할 시간 범위 (1~168, 기본값: 24)',
      example: 24,
    }),
    ApiOkResponse({
      description: 'NAS 상태 이력 조회 성공',
      schema: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            description: '이력 데이터 (시간순 ASC 정렬)',
            items: {
              type: 'object',
              properties: {
                status: {
                  type: 'string',
                  enum: ['healthy', 'degraded', 'unhealthy'],
                  description: '체크 당시 상태',
                  example: 'healthy',
                },
                responseTimeMs: {
                  type: 'number',
                  description: '응답 시간 (ms)',
                  example: 42,
                },
                totalBytes: {
                  type: 'number',
                  description: '전체 용량 (bytes)',
                  example: 999893999616,
                },
                usedBytes: {
                  type: 'number',
                  description: '사용 용량 (bytes)',
                  example: 449952149504,
                },
                checkedAt: {
                  type: 'string',
                  format: 'date-time',
                  description: '체크 시각',
                  example: '2026-02-09T00:05:00.000Z',
                },
              },
            },
          },
          hours: {
            type: 'number',
            description: '조회 기간 (시간)',
            example: 24,
          },
          totalCount: {
            type: 'number',
            description: '전체 이력 건수',
            example: 288,
          },
          healthyPercent: {
            type: 'number',
            description: '정상 비율 (%). 소수점 2자리',
            example: 75.0,
          },
          healthyHours: {
            type: 'number',
            description: '정상 시간 (시간). 소수점 2자리',
            example: 18.0,
          },
          unhealthyHours: {
            type: 'number',
            description: '비정상 시간 (시간). 소수점 2자리',
            example: 6.0,
          },
        },
        required: ['items', 'hours', 'totalCount', 'healthyPercent', 'healthyHours', 'unhealthyHours'],
      },
    }),
    ApiResponse({
      status: 400,
      description: 'Validation error (hours 범위 초과 등)',
    }),
  );

/**
 * GET /v1/admin/observability/settings - Observability 설정 조회 API 문서
 */
export const ApiObservabilitySettingsGet = () =>
  applyDecorators(
    ApiOperation({
      summary: 'Observability 설정 조회',
      description: `
NAS Observability 대시보드의 관리자 설정을 조회합니다.

### 설정 항목

| 설정 | DB 키 | 기본값 | 설명 |
|---|---|---|---|
| 헬스체크 주기 | \`nas.health_check.interval_minutes\` | 5분 | Cron 스케줄러 실행 간격 |
| 이력 보존 기간 | \`nas.health_check.retention_days\` | 7일 | 자동 정리 기준 |
| 스토리지 임계치 | \`nas.health_check.threshold_percent\` | 80% | 경고 표시 기준 |

### 기본값 동작
- DB에 설정이 없으면 기본값이 반환됩니다.
- 설정을 한 번도 변경하지 않은 경우에도 기본값이 정상 반환됩니다.
      `,
    }),
    ApiOkResponse({
      description: 'Observability 설정 조회 성공',
      schema: {
        type: 'object',
        properties: {
          intervalMinutes: {
            type: 'number',
            description: '헬스체크 주기 (분). 스케줄러가 이 간격으로 NAS 상태를 체크합니다.',
            example: 5,
          },
          retentionDays: {
            type: 'number',
            description: '이력 보존 기간 (일). 이 기간 초과 이력은 매일 자정에 자동 삭제됩니다.',
            example: 7,
          },
          thresholdPercent: {
            type: 'number',
            description: '스토리지 사용률 임계치 (%). 이 수치 초과 시 대시보드에서 경고를 표시합니다.',
            example: 80,
          },
        },
        required: ['intervalMinutes', 'retentionDays', 'thresholdPercent'],
      },
    }),
  );

/**
 * PUT /v1/admin/observability/settings - Observability 설정 변경 API 문서
 */
export const ApiObservabilitySettingsUpdate = () =>
  applyDecorators(
    ApiOperation({
      summary: 'Observability 설정 변경',
      description: `
NAS Observability 대시보드의 관리자 설정을 변경합니다.

### 부분 업데이트
- 변경하고 싶은 필드만 전달하면 됩니다.
- 전달하지 않은 필드는 기존 값이 유지됩니다.

### 주기 변경 반영
- \`intervalMinutes\` 변경 시 **서버 재시작 없이 최대 1분 이내에 반영**됩니다.
- Cron 스케줄러가 매분 실행되며, DB에서 설정값을 읽어 주기를 판단합니다.

### 보존 기간 변경
- \`retentionDays\`를 줄이면 다음 자정 정리 시 초과분이 삭제됩니다.
- 즉시 삭제가 아닌 자정 Cron에서 처리됩니다.

### 임계치 변경
- \`thresholdPercent\`는 프론트엔드 대시보드 UI 표시 기준입니다.
- 서버측 동작에는 영향을 주지 않습니다.

### 요청 예시

**주기만 변경:**
\`\`\`json
{ "intervalMinutes": 10 }
\`\`\`

**전체 변경:**
\`\`\`json
{
  "intervalMinutes": 10,
  "retentionDays": 30,
  "thresholdPercent": 90
}
\`\`\`
      `,
    }),
    ApiBody({
      description: '변경할 설정값 (부분 업데이트 가능)',
      schema: {
        type: 'object',
        properties: {
          intervalMinutes: {
            type: 'number',
            description: '헬스체크 주기 (분). 1~60 범위',
            example: 10,
            minimum: 1,
            maximum: 60,
          },
          retentionDays: {
            type: 'number',
            description: '이력 보존 기간 (일). 1~365 범위',
            example: 30,
            minimum: 1,
            maximum: 365,
          },
          thresholdPercent: {
            type: 'number',
            description: '스토리지 사용률 임계치 (%). 50~99 범위',
            example: 90,
            minimum: 50,
            maximum: 99,
          },
        },
      },
    }),
    ApiOkResponse({
      description: '설정 변경 성공. 변경 후 전체 설정을 반환합니다.',
      schema: {
        type: 'object',
        properties: {
          intervalMinutes: {
            type: 'number',
            description: '헬스체크 주기 (분)',
            example: 10,
          },
          retentionDays: {
            type: 'number',
            description: '이력 보존 기간 (일)',
            example: 30,
          },
          thresholdPercent: {
            type: 'number',
            description: '스토리지 사용률 임계치 (%)',
            example: 90,
          },
        },
        required: ['intervalMinutes', 'retentionDays', 'thresholdPercent'],
      },
    }),
    ApiResponse({
      status: 400,
      description: 'Validation error (범위 초과, 잘못된 타입 등)',
      schema: {
        type: 'object',
        properties: {
          statusCode: { type: 'number', example: 400 },
          message: {
            type: 'array',
            items: { type: 'string' },
            example: ['intervalMinutes must not be greater than 60'],
          },
          error: { type: 'string', example: 'Bad Request' },
        },
      },
    }),
  );

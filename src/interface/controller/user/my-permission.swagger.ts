import { applyDecorators } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';

export const ApiGetMyPermissions = () =>
  applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: '나의 역할 및 권한 조회',
      description: `현재 로그인한 사용자의 역할과 보유 권한 목록을 조회합니다.

### 응답 정보
- **roleName**: 현재 역할명 (ADMIN, MANAGER, USER, GUEST)
- **permissions**: 보유 권한 코드 플랫 목록 (프론트엔드 권한 체크용)
- **permissionGroups**: 카테고리별 그룹핑된 권한 목록 (UI 표시용)

### 주요 활용 사례
- 공유 요청 시 \`FILE_SHARE_DIRECT\` 보유 여부로 즉시 공유/승인 대기 안내
- 메뉴/버튼 노출 제어 (예: 관리자 메뉴, 승인 버튼 등)
- 파일 작업 권한 사전 확인 (이동, 삭제, 업로드 등)`,
    }),
    ApiResponse({
      status: 200,
      description: '나의 역할 및 권한 정보',
      schema: {
        type: 'object',
        properties: {
          roleId: { type: 'string', description: '역할 ID', example: '550e8400-e29b-41d4-a716-446655440001' },
          roleName: { type: 'string', description: '역할명', example: 'MANAGER' },
          roleDescription: { type: 'string', description: '역할 설명', example: '매니저' },
          permissions: {
            type: 'array',
            description: '보유 권한 코드 목록 (플랫)',
            items: { type: 'string' },
            example: ['FILE_READ', 'FILE_SHARE_DIRECT', 'FILE_SHARE_REQUEST'],
          },
          permissionGroups: {
            type: 'array',
            description: '카테고리별 권한 그룹',
            items: {
              type: 'object',
              properties: {
                category: { type: 'string', description: '카테고리명', example: 'File Share Management' },
                permissions: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      code: { type: 'string', description: '권한 코드', example: 'FILE_SHARE_DIRECT' },
                      description: { type: 'string', description: '권한 설명', example: '파일 공유 직접 생성 (자동승인)' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    }),
    ApiResponse({ status: 401, description: '인증 필요' }),
    ApiResponse({ status: 404, description: '사용자 또는 역할을 찾을 수 없음' }),
  );

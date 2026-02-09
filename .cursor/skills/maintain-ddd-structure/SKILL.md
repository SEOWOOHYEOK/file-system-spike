---
name: maintain-ddd-structure
description: Analyzes and enforces Domain-Driven Design (DDD) folder structure. Use when the user asks to check, organize, refactor folder structure, or mentions "DDD" or "architecture".
---

# Maintain DDD Structure

## Purpose
This skill ensures the codebase adheres to the project's Domain-Driven Design (DDD) layered architecture. It helps identify misplaced files and guides the reorganization process.

## Architecture Overview

The project follows a 4-layer architecture:

1.  **Interface Layer** (`src/interface`): Entry points (Controllers, Resolvers), DTOs (Request/Response), Swagger.
2.  **Business Layer** (`src/business`): Application logic, Use Cases, Service orchestration.
3.  **Domain Layer** (`src/domain`): Core business logic, Entities, Value Objects, Repository Interfaces (Ports), Domain Services.
4.  **Infrastructure Layer** (`src/infra`): Technical implementation, Database ORM entities, Repository Implementations, External Adapters.

---

## Structure Rules

### 1. Interface Layer (`src/interface`)
-   **Location**: `src/interface/<module>/`
-   **Files**:
    -   `*.controller.ts`: API Controllers.
    -   `*.dto.ts`: Data Transfer Objects for API requests/responses.
    -   `*.swagger.ts`: Swagger/OpenAPI definitions.
-   **Conventions**:
    -   **Request validation**: Use class-validator decorators in request DTOs; controllers should rely on validation pipes (no manual validation).
    -   **Response typing**: Controller handlers must return `Promise<T>` with explicit response DTO or entity type for quick type visibility.
    -   **Swagger docs**: Keep `summary`, `description`, `tags`, `params`, and `responses` detailed and up-to-date.
    -   **Swagger separation**: Define Swagger metadata in a separate `.swagger.ts` file and import into the `.controller.ts`.

#### Interface 레이어 공용 데코레이터 사용 규칙 (중요)

**절대 인라인 Transform을 직접 작성하지 말고, 항상 `@interface/decorators/`의 공용 데코레이터를 우선 사용해야 합니다.**

##### Boolean 변환
-   ❌ **금지**: `@Transform(({ value }) => { ... })` 직접 작성
-   ✅ **사용**: `@ToBoolean()`, `@ToBooleanStrict()`, `@OptionalToBoolean()`, `@OptionalToBooleanStrict()`

```typescript
// ❌ 나쁜 예 - 직접 Transform 작성
@Transform(({ value }) => {
  if (value === 'true') return true;
  return false;
})
@IsBoolean()
includeExcluded?: boolean;

// ✅ 좋은 예 - 공용 데코레이터 사용
import { ToBoolean } from '@interface/decorators';

@ToBoolean(false)
@IsBoolean()
includeExcluded?: boolean;
```

##### Date 변환
-   ❌ **금지**: `@Transform(({ value }) => new Date(value))` 직접 작성
-   ✅ **사용**: `@DateToUTC()`, `@OptionalDateToUTC()`

##### UUID 파싱
-   ❌ **금지**: 컨트롤러에서 직접 UUID 검증
-   ✅ **사용**: `@ParseUUID(paramName)` 데코레이터

##### DTO Import 순서

```typescript
// 1. NestJS/Swagger 관련
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
// 2. class-transformer (Type만 필요한 경우)
import { Type } from 'class-transformer';
// 3. class-validator
import { IsString, IsNotEmpty, IsOptional, IsBoolean } from 'class-validator';
// 4. 공용 데코레이터 (Transform은 여기서)
import { ToBoolean, DateToUTC, ParseUUID } from '@interface/decorators';
```

##### 데코레이터 순서

```typescript
export class ExampleDto {
  @ApiProperty()           // 1. Swagger 문서화
  @IsNotEmpty()            // 2. 유효성 검사
  @IsString()              // 3. 타입 검증
  name: string;

  @ApiPropertyOptional()   // 1. Swagger 문서화
  @IsOptional()            // 2. Optional 선언
  @ToBoolean(false)        // 3. 값 변환
  @IsBoolean()             // 4. 타입 검증
  isActive?: boolean;
}
```

#### 컨트롤러-서비스 책임 분리 원칙 (Thin Controller 패턴)

**컨트롤러는 비대해지면 안 됩니다. 컨트롤러는 오직 HTTP 입출력 처리만 담당해야 합니다.**

##### 컨트롤러의 역할 (해야 할 것)
- HTTP 요청 파라미터 추출 (`@Param`, `@Query`, `@Body`, `@Headers`)
- DTO 기반 입력 검증 (ValidationPipe)
- HTTP 응답 설정 (상태 코드, 헤더)
- 스트림 파이핑 (파일 다운로드 등)

##### 컨트롤러가 하면 안 되는 것
- HTTP 헤더 파싱 로직 (예: Range 헤더 파싱)
- 비즈니스 검증 로직 (예: If-Range ETag 비교)
- 조건부 분기 처리 (예: Range 유효성에 따른 재시도)
- 동일 서비스 메서드를 위해 사전 데이터 조회

##### 실제 예시: Range 요청 처리

```typescript
// ❌ 잘못된 예시 - 컨트롤러가 비대해짐
@Get(':fileId/download')
async download(
  @Param('fileId') fileId: string,
  @Headers('range') rangeHeader: string,
  @Headers('if-range') ifRangeHeader: string,
  @Res() res: Response,
): Promise<void> {
  // 컨트롤러에서 파일 정보 조회 (DB 쿼리 1회)
  const fileInfo = await this.fileQueryService.getFileInfo(fileId);
  
  // 컨트롤러에서 Range 파싱
  let range = parseRangeHeader(rangeHeader, fileInfo.size);
  
  // 컨트롤러에서 Range 유효성 검증
  if (rangeHeader && !range) {
    res.status(416);
    res.set({ 'Content-Range': `bytes */${fileInfo.size}` });
    res.end();
    return;
  }

  // 서비스 호출 (내부에서 다시 DB 쿼리 - 중복!)
  let downloadResult = await this.fileDownloadService.downloadWithRange(fileId, range);
  
  // 컨트롤러에서 If-Range ETag 검증 및 재시도 로직
  if (ifRangeHeader && range && downloadResult.storageObject.checksum) {
    const expectedEtag = `"${downloadResult.storageObject.checksum}"`;
    if (ifRangeHeader !== expectedEtag) {
      await this.fileDownloadService.releaseLease(fileId);
      downloadResult = await this.fileDownloadService.downloadWithRange(fileId, undefined);
      range = null;
    }
  }
  
  // ... 응답 헤더 설정 (20+ 줄) ...
}

// ✅ 올바른 예시 - 컨트롤러는 HTTP 입출력만
@Get(':fileId/download')
async download(
  @Param('fileId') fileId: string,
  @Headers('range') rangeHeader: string,
  @Headers('if-range') ifRangeHeader: string,
  @Res() res: Response,
): Promise<void> {
  // 서비스에 HTTP 헤더를 그대로 전달 (파싱/검증은 서비스에서)
  const { file, storageObject, stream, isPartial, range, isRangeInvalid } =
    await this.fileDownloadService.downloadWithRange(fileId, {
      rangeHeader,
      ifRangeHeader,
    });

  // 컨트롤러는 결과에 따른 HTTP 응답만 처리
  if (isRangeInvalid) {
    res.status(416);
    res.set({ 'Content-Range': `bytes */${file.sizeBytes}` });
    res.end();
    return;
  }

  // 응답 헤더 설정 및 스트림 파이핑
  // ...
}
```

##### 리팩토링 가이드

컨트롤러가 비대해지는 징후:
1. **동일 정보를 위한 중복 조회**: `getFileInfo` 후 `downloadWithRange` 호출
2. **HTTP 헤더 직접 파싱**: `parseRangeHeader(rangeHeader, fileInfo.size)`
3. **조건부 서비스 재호출**: `if (조건) { 다시 서비스 호출 }`
4. **비즈니스 검증 로직**: ETag 비교, 만료일 검증 등

해결 방법:
1. 서비스 메서드가 HTTP 헤더를 직접 받도록 시그니처 변경
2. 파싱/검증 로직을 서비스 내부로 이동
3. 결과 객체에 상태 플래그 포함 (예: `isRangeInvalid`, `isPartial`)
4. 컨트롤러는 플래그에 따라 HTTP 응답만 설정

### 2. Business Layer (`src/business`)
-   **Location**: `src/business/<module>/`
-   **Files**:
    -   `*.service.ts`: Application Services (handling use cases).
    -   `*.module.ts`: NestJS Modules for the business layer.
-   **Dependency Rule (IMPORTANT)**:
    -   **Business services must not depend on repository ports directly.**
    -   Business layer should depend on **Domain Services** (and other business services) only.
    -   Repository ports (`*.repository.interface.ts`, tokens like `*_REPOSITORY`) should be injected only inside Domain Services.

### 3. Domain Layer (`src/domain`)
-   **Location**: `src/domain/<module>/`
-   **Files**:
    -   `*.entity.ts`: Pure Domain Entities (NOT ORM entities).
    -   `*.vo.ts`: Value Objects.
    -   `*.repository.interface.ts` (or `*.port.ts`): Repository interfaces (Ports).
    -   `*-domain.service.ts`: Domain Services (pure domain logic).
    -   `*.exception.ts`: Domain-specific exceptions.
    -   **Ports must live in domain only**: Interfaces that represent domain-level ports (e.g. repository ports, external service ports) belong in `src/domain` and must not be declared in `src/business`, `src/interface`, or `src/infra`.

#### Domain Exception 작성

```typescript
// evaluation-period.exceptions.ts
export class EvaluationPeriodNotFoundException extends NotFoundException {
  constructor(evaluationPeriodId: string) {
    super(`평가기간을 찾을 수 없습니다. (id: ${evaluationPeriodId})`);
  }
}

export class InvalidEvaluationPeriodStatusException extends BadRequestException {
  constructor(currentStatus: string, requestedStatus: string) {
    super(`평가기간 상태를 변경할 수 없습니다. (현재: ${currentStatus}, 요청: ${requestedStatus})`);
  }
}
```

### 4. Infrastructure Layer (`src/infra`)
-   **Location**: `src/infra/<module>/` or `src/infra/database/`, `src/infra/storage/`
-   **Files**:
    -   `*.orm-entity.ts`: Database ORM Entities (TypeORM, etc.).
    -   `*.repository.ts`: Repository Implementations (implementing domain interfaces).
    -   `*.adapter.ts`: Adapters for external services (Storage, Queue, etc.).
    -   `*.mapper.ts`: Mappers between Domain Entities and ORM Entities/DTOs.

---

## TypeORM QueryBuilder 베스트 프랙티스

### 1. Soft Delete 필터링

**모든 쿼리에서 삭제된(soft-deleted) 엔티티를 제외해야 합니다.**

```typescript
// ❌ 잘못된 예시
const result = await this.repository
  .createQueryBuilder('entity')
  .where('entity.id = :id', { id })
  .getOne();

// ✅ 올바른 예시
const result = await this.repository
  .createQueryBuilder('entity')
  .where('entity.id = :id', { id })
  .andWhere('entity.deletedAt IS NULL')
  .getOne();
```

### 2. LEFT JOIN 시 Soft Delete 조건 추가

**조인하는 엔티티도 삭제된 데이터를 제외해야 합니다.**

```typescript
// ❌ 잘못된 예시
.leftJoin(Employee, 'employee', 'employee.id = entity.employeeId')

// ✅ 올바른 예시
.leftJoin(
  Employee,
  'employee',
  'employee.id = entity.employeeId AND employee.deletedAt IS NULL',
)
```

### 3. SELECT 시 명시적 Alias 사용 (getRawMany/getRawOne)

**`getRawMany()` 또는 `getRawOne()`을 사용할 때는 모든 컬럼에 명시적 alias를 지정해야 합니다.**

```typescript
// ❌ 잘못된 예시
const result = await this.repository
  .createQueryBuilder('assignment')
  .select([
    'assignment.id',
    'project.name',
  ])
  .leftJoin(Project, 'project', 'project.id = assignment.projectId')
  .getRawMany();

// ✅ 올바른 예시
const result = await this.repository
  .createQueryBuilder('assignment')
  .select([
    'assignment.id AS assignment_id',
    'project.name AS project_name',
  ])
  .leftJoin(
    Project,
    'project',
    'project.id = assignment.projectId AND project.deletedAt IS NULL',
  )
  .getRawMany();
```

### 4. QueryBuilder 체크리스트

쿼리를 작성할 때 다음 항목을 체크하세요:
-   [ ] 메인 엔티티에 `deletedAt IS NULL` 조건 추가
-   [ ] 모든 `leftJoin`에 조인 엔티티의 `deletedAt IS NULL` 조건 추가
-   [ ] `getRawMany/getRawOne` 사용 시 명시적 `AS alias` 지정
-   [ ] Date 타입 필드는 적절히 변환 (ISO 8601)
-   [ ] 필요한 인덱스가 있는지 확인 (성능 최적화)

---

## CQRS 패턴 가이드

### 1. Query Handler 작성

**읽기 전용 작업은 Query Handler로 작성합니다.**

```typescript
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';

export class GetEmployeeDataQuery {
  constructor(
    public readonly evaluationPeriodId: string,
    public readonly employeeId: string,
  ) {}
}

@Injectable()
@QueryHandler(GetEmployeeDataQuery)
export class GetEmployeeDataHandler
  implements IQueryHandler<GetEmployeeDataQuery, EmployeeDataResult>
{
  constructor(
    @InjectRepository(Entity)
    private readonly repository: Repository<Entity>,
  ) {}

  async execute(query: GetEmployeeDataQuery): Promise<EmployeeDataResult> {
    // 구현
  }
}
```

### 2. Command Handler 작성

**쓰기 작업(생성, 수정, 삭제)은 Command Handler로 작성합니다.**

```typescript
import { ICommandHandler, CommandHandler } from '@nestjs/cqrs';

export class CreateEvaluationCommand {
  constructor(
    public readonly employeeId: string,
    public readonly data: CreateEvaluationDto,
  ) {}
}

@Injectable()
@CommandHandler(CreateEvaluationCommand)
export class CreateEvaluationHandler
  implements ICommandHandler<CreateEvaluationCommand, string>
{
  constructor(
    @InjectRepository(Entity)
    private readonly repository: Repository<Entity>,
  ) {}

  async execute(command: CreateEvaluationCommand): Promise<string> {
    // 구현
  }
}
```

### 3. Handler Export 패턴

**handlers 디렉토리 구조:**

```
handlers/
├── queries/
│   ├── get-employee-data.query.ts
│   └── index.ts
├── commands/
│   ├── create-evaluation.command.ts
│   └── index.ts
├── query-handlers.ts
└── command-handlers.ts
```

**query-handlers.ts:**

```typescript
export const QueryHandlers = [
  GetEmployeeDataHandler,
  GetEmployeeListHandler,
];
```

**command-handlers.ts:**

```typescript
export const CommandHandlers = [
  CreateEvaluationHandler,
  UpdateEvaluationHandler,
  DeleteEvaluationHandler,
];
```

---

## DTO 작성 가이드

### 1. API 응답 DTO

**Swagger 문서화를 위해 모든 필드에 `@ApiProperty` 데코레이터를 사용합니다.**

```typescript
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class EmployeeInfoDto {
  @ApiProperty({
    description: '직원 ID',
    example: '123e4567-e89b-12d3-a456-426614174001',
  })
  id: string;

  @ApiProperty({
    description: '직원명',
    example: '홍길동',
  })
  name: string;

  @ApiPropertyOptional({
    description: '전화번호',
    example: '010-1234-5678',
    nullable: true,
  })
  phoneNumber?: string;

  @ApiProperty({
    description: '직원 상태',
    example: 'ACTIVE',
    enum: ['ACTIVE', 'INACTIVE', 'LEAVE', 'RESIGNED'],
  })
  status: string;
}
```

### 2. 중첩 DTO 구조

**복잡한 객체는 계층적으로 구성합니다.**

```typescript
export class AssignedWbsInfoDto {
  @ApiProperty({ description: 'WBS ID' })
  wbsId: string;

  @ApiProperty({
    description: 'WBS에 할당된 평가기준 목록',
    type: [WbsEvaluationCriterionDto],
  })
  @Type(() => WbsEvaluationCriterionDto)
  criteria: WbsEvaluationCriterionDto[];
}
```

---

## API 데코레이터 작성 가이드

### 1. API 데코레이터 구조

**각 엔드포인트마다 재사용 가능한 데코레이터를 작성합니다.**

```typescript
import { applyDecorators, Get, Post } from '@nestjs/common';
import { ApiOperation, ApiOkResponse, ApiParam } from '@nestjs/swagger';

export function GetEmployeeData() {
  return applyDecorators(
    Get(':evaluationPeriodId/employees/:employeeId/data'),
    ApiOperation({
      summary: '직원 데이터 조회',
      description: `**동작:**
- 직원 기본 정보 조회
- 할당된 프로젝트 및 WBS 조회
- 평가 진행 현황 조회

**테스트 케이스:**
- 정상 조회: 등록된 직원 데이터 조회 성공
- 미등록: 404 에러 반환
- 잘못된 UUID: 400 에러 반환`,
    }),
    ApiParam({
      name: 'evaluationPeriodId',
      description: '평가기간 ID',
      type: 'string',
      format: 'uuid',
    }),
    ApiOkResponse({
      description: '직원 데이터 조회 성공',
      type: EmployeeDataResponseDto,
    }),
  );
}
```

### 2. API 문서화 규칙

#### Summary (필수)
-   **한 줄로 명확하게** 작성
-   동사로 시작 (예: "조회", "생성", "변경", "삭제")

#### Description - **동작** 섹션 (필수)
-   엔드포인트가 **무엇을** 하는지 명확히 기술
-   주요 동작을 bullet point로 나열

#### Description - **테스트 케이스** 섹션 (필수)
-   작성한 E2E 테스트를 기반으로 나열
-   각 케이스를 **한 줄로 간결하게** 작성

---

## 네이밍 컨벤션

### 1. Context 서비스 메서드

**한글로 작성하며 '~한다' 형태로 끝냅니다.**

```typescript
// ✅ 올바른 예시
async 직원_데이터를_조회한다(evaluationPeriodId: string, employeeId: string)
async 평가를_생성한다(data: CreateEvaluationDto)
async 평가를_수정한다(id: string, data: UpdateEvaluationDto)
async 평가를_삭제한다(id: string)

// ❌ 잘못된 예시
async getEmployeeData(evaluationPeriodId: string, employeeId: string)
async createEvaluation(data: CreateEvaluationDto)
```

### 2. Handler 클래스명

```typescript
// Query Handler: Get + 기능명 + Query
export class GetEmployeeDataQuery {}
export class GetEmployeeDataHandler {}

// Command Handler: 동사 + 기능명 + Command
export class CreateEvaluationCommand {}
export class CreateEvaluationHandler {}
```

### 3. DTO 클래스명

```typescript
// 응답 DTO: 기능명 + ResponseDto
export class EmployeeDataResponseDto {}

// 요청 DTO: 동사 + 기능명 + Dto
export class CreateEvaluationDto {}

// 쿼리 DTO: Get + 기능명 + QueryDto
export class GetEvaluationListQueryDto {}
```

---

## 에러 처리

### 1. 표준 Exception 사용

```typescript
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';

// 데이터를 찾을 수 없을 때
if (!entity) {
  throw new NotFoundException(`엔티티를 찾을 수 없습니다. (id: ${id})`);
}

// 유효하지 않은 요청
if (!isValid) {
  throw new BadRequestException('유효하지 않은 요청입니다.');
}

// 중복 데이터
if (exists) {
  throw new ConflictException('이미 존재하는 데이터입니다.');
}
```

### 2. HTTP 상태 코드 가이드

-   `200 OK`: 성공적인 GET, PUT, PATCH 요청
-   `201 Created`: 성공적인 POST 요청 (리소스 생성)
-   `204 No Content`: 성공적인 DELETE 요청 (응답 본문 없음)
-   `400 Bad Request`: 잘못된 요청 (유효성 검증 실패)
-   `404 Not Found`: 리소스를 찾을 수 없음
-   `409 Conflict`: 리소스 충돌 (중복 등록)

---

## 성능 최적화

### 1. N+1 쿼리 문제 해결

**반복문 내에서 개별 쿼리를 실행하지 않습니다.**

```typescript
// ❌ 잘못된 예시 (N+1 문제)
const projects = await this.projectRepository.find();
for (const project of projects) {
  const wbs = await this.wbsRepository.find({
    where: { projectId: project.id },
  });
  project.wbsList = wbs;
}

// ✅ 올바른 예시 (배치 조회)
const projects = await this.projectRepository.find();
const projectIds = projects.map((p) => p.id);

const wbsList = await this.wbsRepository
  .createQueryBuilder('wbs')
  .where('wbs.projectId IN (:...projectIds)', { projectIds })
  .andWhere('wbs.deletedAt IS NULL')
  .getMany();

// 그룹화
const wbsMap = new Map<string, WbsItem[]>();
wbsList.forEach((wbs) => {
  if (!wbsMap.has(wbs.projectId)) {
    wbsMap.set(wbs.projectId, []);
  }
  wbsMap.get(wbs.projectId)!.push(wbs);
});

// 할당
projects.forEach((project) => {
  project.wbsList = wbsMap.get(project.id) || [];
});
```

### 2. 인덱스 활용

**자주 조회하는 컬럼에는 인덱스를 생성합니다.**

```typescript
@Entity('evaluation_period')
@Index(['status'])
@Index(['currentPhase'])
@Index(['startDate', 'endDate'])
export class EvaluationPeriod extends BaseEntity {
  // ...
}
```

---

## 테스트 작성 가이드

### 1. Handler 테스트

```typescript
describe('GetEmployeeDataHandler', () => {
  let handler: GetEmployeeDataHandler;
  let repository: Repository<Entity>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GetEmployeeDataHandler,
        {
          provide: getRepositoryToken(Entity),
          useValue: {
            createQueryBuilder: jest.fn(),
          },
        },
      ],
    }).compile();

    handler = module.get<GetEmployeeDataHandler>(GetEmployeeDataHandler);
    repository = module.get<Repository<Entity>>(getRepositoryToken(Entity));
  });

  it('정상적으로 직원 데이터를 조회해야 함', async () => {
    // Given
    const query = new GetEmployeeDataQuery('period-id', 'employee-id');
    const mockResult = { /* ... */ };

    // When
    const result = await handler.execute(query);

    // Then
    expect(result).toEqual(mockResult);
  });

  it('존재하지 않는 직원일 경우 NotFoundException을 던져야 함', async () => {
    // Given
    const query = new GetEmployeeDataQuery('period-id', 'invalid-id');

    // When & Then
    await expect(handler.execute(query)).rejects.toThrow(NotFoundException);
  });
});
```
## 로깅

### Logger 사용

```typescript
import { Logger } from '@nestjs/common';

export class SomeHandler {
  private readonly logger = new Logger(SomeHandler.name);

  async execute(query: SomeQuery): Promise<SomeResult> {
    this.logger.log('작업 시작', { queryData: query });

    try {
      const result = await this.doSomething();
      this.logger.log('작업 완료', { resultData: result });
      return result;
    } catch (error) {
      this.logger.error('작업 실패', error.stack, { queryData: query });
      throw error;
    }
  }
}
```

---

## Analysis Workflow

When asked to analyze or fix the structure:

1.  **Identify the Scope**: specific module (e.g., `file`) or entire `src`.
2.  **Scan for Violations**:
    -   Are ORM entities (`*.orm-entity.ts`) in `src/domain`? -> Move to `src/infra`.
    -   Are Controllers (`*.controller.ts`) in `src/business`? -> Move to `src/interface`.
    -   Are Repository Implementations (`*.repository.ts`) in `src/domain`? -> Move to `src/infra`.
    -   Are Domain Entities (`*.entity.ts`) in `src/infra`? -> Move to `src/domain`.
    -   Are domain-level ports/interfaces (e.g. `*.repository.interface.ts`, `*.port.ts`) declared outside `src/domain` (including other domain folders)? -> Move to the correct `src/domain/<module>/` and update imports.
    -   Are ports for one domain placed under a different domain (e.g. file ports under `src/domain/folder/`)? -> Move to the owning domain folder and update imports.
    -   **Are Business services injecting repository ports or tokens directly?**
        -   Example smells: `@Inject(FILE_REPOSITORY)`, `ISyncEventRepository` in `src/business/**`.
        -   Fix: Create/Use a Domain Service in `src/domain/<module>/service/*-domain.service.ts` and inject that service instead.
        -   If multiple domains are needed, Business can orchestrate multiple **domain services**, but still should not inject repository ports.
3.  **Report Findings**: List misplaced files and their intended locations.

## Refactoring Workflow

1.  **Move Files**: Use `mv` command or file system tools to move files to their correct layers.
2.  **Update Imports**:
    -   **CRITICAL**: After moving files, you MUST update all relative imports in the moved files and imports referencing these files in other files.
    -   Use `grep` or `ripgrep` to find usages.
3.  **Verify**: Run `tsc --noEmit` or build the project to ensure no broken imports.

---

## 체크리스트

### DTO 체크리스트

-   [ ] `@Transform()` 직접 사용하지 않았는가?
-   [ ] 공용 데코레이터(`@ToBoolean`, `@DateToUTC` 등) 사용했는가?
-   [ ] `@interface/decorators`에서 import 했는가?
-   [ ] 데코레이터 순서가 올바른가? (문서화 → 검증 → 변환 → 타입)

### API 문서화 체크리스트

-   [ ] `@ApiOperation()`에 summary와 description 추가했는가?
-   [ ] **동작** 섹션을 작성했는가?
-   [ ] **테스트 케이스** 섹션을 E2E 테스트 기반으로 작성했는가?
-   [ ] Query 파라미터 타입을 String으로 명시했는가? (boolean query의 경우)

### 컨트롤러 체크리스트

-   [ ] `@ParseUUID()` 데코레이터 사용했는가?
-   [ ] DTO로 요청 데이터 검증하는가?
-   [ ] HTTP 상태 코드가 적절한가?
-   [ ] **Thin Controller 원칙**:
    -   [ ] HTTP 헤더 파싱 로직이 컨트롤러에 있지 않은가? (서비스로 이동)
    -   [ ] 비즈니스 검증 로직이 컨트롤러에 있지 않은가? (서비스로 이동)
    -   [ ] 동일 데이터를 위해 사전 조회 후 서비스 호출하지 않는가? (중복 제거)
    -   [ ] 조건부 서비스 재호출 로직이 없는가? (서비스 내부에서 처리)

### QueryBuilder 체크리스트

-   [ ] 메인 엔티티에 `deletedAt IS NULL` 조건 추가
-   [ ] 모든 `leftJoin`에 `deletedAt IS NULL` 조건 추가
-   [ ] `getRawMany/getRawOne` 사용 시 명시적 `AS alias` 지정

### 테스트 체크리스트

-   [ ] 성공 케이스와 실패 케이스 모두 작성했는가?
-   [ ] Query 파라미터를 문자열로 전달했는가?
-   [ ] Given-When-Then 패턴을 따랐는가?

---

## Examples

**Input**: "Check if the `role` module follows DDD."

**Action**:
1.  List files in `src/business/role`, `src/domain/role`, `src/infra/database/role...`.
2.  Check if `role.controller.ts` is in `src/interface/role`.
3.  Check if `role.repository.ts` is in `src/infra/database/repositories`.
4.  Check if `role.entity.ts` is in `src/domain/role/entities`.

**Input**: "Move `user.controller.ts` from `business` to `interface`."

**Action**:
1.  `mkdir -p src/interface/user`
2.  `mv src/business/user/user.controller.ts src/interface/user/`
3.  Update imports in `user.controller.ts` (adjust `../../` levels).
4.  Update `app.module.ts` or `user.module.ts` imports.

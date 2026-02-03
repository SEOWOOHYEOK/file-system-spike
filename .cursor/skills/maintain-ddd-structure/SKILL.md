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

### 4. Infrastructure Layer (`src/infra`)
-   **Location**: `src/infra/<module>/` or `src/infra/database/`, `src/infra/storage/`
-   **Files**:
    -   `*.orm-entity.ts`: Database ORM Entities (TypeORM, etc.).
    -   `*.repository.ts`: Repository Implementations (implementing domain interfaces).
    -   `*.adapter.ts`: Adapters for external services (Storage, Queue, etc.).
    -   `*.mapper.ts`: Mappers between Domain Entities and ORM Entities/DTOs.

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

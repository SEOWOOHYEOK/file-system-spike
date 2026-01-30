import { Injectable } from '@nestjs/common';
import { User } from '../../domain/user/entities/user.entity';
import {
  Employee,
  EmployeeStatus,
} from '../../integrations/migration/organization/entities/employee.entity';
import { DomainEmployeeService } from '../../integrations/migration/organization/services/employee.service';

import { UserDomainService } from '../../domain/user';

/**
 * 동기화 결과 인터페이스
 */
export interface SyncResult {
  /** 새로 생성된 User 수 */
  created: number;
  /** 재활성화된 User 수 */
  activated: number;
  /** 비활성화된 User 수 */
  deactivated: number;
  /** 생성 건너뛴 수 (퇴사 상태 신규) */
  skipped: number;
  /** 변경 없는 User 수 */
  unchanged: number;
  /** 총 처리 시간 (ms) */
  processingTimeMs: number;
}

/**
 * User 동기화 서비스
 *
 * Employee → User 배치 동기화 담당
 * Admin API에서 수동으로 트리거됨
 */
@Injectable()
export class UserSyncService {
  constructor(
    private readonly userDomainService: UserDomainService,
    private readonly employeeService: DomainEmployeeService,
  ) {}

  /**
   * Employee → User 배치 동기화 실행
   *
   * 동기화 규칙:
   * - 신규 재직중 Employee → User 생성 (roleId: null, isActive: true)
   * - 신규 퇴사/휴직 Employee → User 생성 안 함
   * - 기존 User의 Employee 퇴사/휴직 → isActive: false
   * - 기존 User의 Employee 복직 → isActive: true
   * - 기존 Role은 유지
   */
  async syncEmployeesToUsers(): Promise<SyncResult> {
    const startTime = Date.now();

    const result: SyncResult = {
      created: 0,
      activated: 0,
      deactivated: 0,
      skipped: 0,
      unchanged: 0,
      processingTimeMs: 0,
    };

    // 1. 모든 Employee 조회
    const employees = await this.employeeService.findAll();

    // 2. 모든 User 조회
    const users = await this.userDomainService.전체조회();
    const userMap = new Map<string, User>(users.map((u) => [u.id, u]));

    // 3. 변경된 User 수집
    const usersToSave: User[] = [];

    for (const employee of employees) {
      const existingUser = userMap.get(employee.id);
      const isEmployeeActive = employee.status === EmployeeStatus.Active;

      if (!existingUser) {
        // Case: Employee 있고 User 없음
        if (isEmployeeActive) {
          // 신규 재직중 → User 생성
          const newUser = new User({
            id: employee.id,
            roleId: null,
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
          usersToSave.push(newUser);
          result.created++;
        } else {
          // 신규 퇴사/휴직 → User 생성 안 함
          result.skipped++;
        }
      } else {
        // Case: User 존재
        if (isEmployeeActive && !existingUser.isActive) {
          // 복직 → 재활성화
          existingUser.activate();
          usersToSave.push(existingUser);
          result.activated++;
        } else if (!isEmployeeActive && existingUser.isActive) {
          // 퇴사/휴직 → 비활성화
          existingUser.deactivate();
          usersToSave.push(existingUser);
          result.deactivated++;
        } else {
          // 상태 변경 없음
          result.unchanged++;
        }
      }
    }

    // 4. 변경된 User 일괄 저장
    if (usersToSave.length > 0) {
      await this.userDomainService.다중저장(usersToSave);
    }

    result.processingTimeMs = Date.now() - startTime;
    return result;
  }
}

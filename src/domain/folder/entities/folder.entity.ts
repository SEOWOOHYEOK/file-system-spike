/**
 * 폴더 도메인 엔티티
 * 폴더의 핵심 속성과 상태를 정의합니다.
 * 
 * DDD 관점: Folder는 Aggregate Root로서 폴더 메타데이터의 일관성을 보장합니다.
 * 스토리지 관련 로직은 FolderStorageObjectEntity에서 별도로 관리합니다.
 */

/**
 * 폴더 상태
 */
export enum FolderState {
  ACTIVE = 'ACTIVE',//활성
  TRASHED = 'TRASHED',//휴지통
  DELETED = 'DELETED',//영구삭제
}

// | `ACTIVE` | 정상 상태. 파일 업로드 및 하위 폴더 생성 가능 | 초기 생성 시, 복구 시 |
// | `TRASHED` | 휴지통 상태. 폴더 삭제 시 하위 모든 항목도 함께 TRASHED (현재 빈 폴더만 삭제 가능) | DELETE 요청 시 |
// | `DELETED` | 영구 삭제 상태 | 휴지통에서 영구삭제 시 |

/**
 * 폴더 엔티티
 */
export class FolderEntity {
  id: string;
  name: string;
  parentId: string | null;
  path: string;
  state: FolderState;
  createdAt: Date;
  updatedAt: Date;

  constructor(partial: Partial<FolderEntity>) {
    Object.assign(this, partial);
  }

  /**
   * 폴더가 활성 상태인지 확인
   */
  isActive(): boolean {
    return this.state === FolderState.ACTIVE;
  }

  /**
   * 폴더가 삭제되었는지 확인
   */
  isDeleted(): boolean {
    return this.state === FolderState.DELETED;
  }

  /**
   * 루트 폴더인지 확인
   */
  isRoot(): boolean {
    return this.parentId === null;
  }


  /**
   * 폴더가 영구삭제 상태인지 확인
   */
  isPermanentlyDeleted(): boolean {
    return this.state === FolderState.DELETED;
  }

  /**
   * 폴더가 휴지통 상태인지 확인
   */
  isTrashed(): boolean {
    return this.state === FolderState.TRASHED;
  }

  /**
   * 폴더 삭제(휴지통)
   */
  delete(): void {
    if (!this.isActive()) {
      throw new Error('활성 상태의 폴더만 삭제할 수 있습니다.');
    }
    this.state = FolderState.TRASHED;
    this.updatedAt = new Date();
  }

  /**
   * 영구 삭제
   */
  permanentDelete(): void {
    if (this.state !== FolderState.TRASHED) {
      throw new Error('휴지통에 있는 폴더만 영구 삭제할 수 있습니다.');
    }
    this.state = FolderState.DELETED;
    this.updatedAt = new Date();
  }

  /**
   * 폴더명 변경
   */
  rename(newName: string, newPath: string): void {
    if (!this.isActive()) {
      throw new Error('활성 상태의 폴더만 이름을 변경할 수 있습니다.');
    }
    this.name = newName;
    this.path = newPath;
    this.updatedAt = new Date();
  }

  /**
   * 폴더 위치 변경 (이동)
   */
  moveTo(targetParentId: string, newPath: string): void {
    if (!this.isActive()) {
      throw new Error('활성 상태의 폴더만 이동할 수 있습니다.');
    }
    this.parentId = targetParentId;
    this.path = newPath;
    this.updatedAt = new Date();
  }


}

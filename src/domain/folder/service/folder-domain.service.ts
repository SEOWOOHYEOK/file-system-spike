/**
 * 폴더 도메인 서비스
 * FolderEntity의 행위를 실행하고 영속성을 보장합니다.
 *
 * DDD 관점: 도메인 서비스는 엔티티 행위 호출 후 Repository를 통해 변경사항을 영속화합니다.
 */

import { Inject, Injectable } from '@nestjs/common';
import { FolderEntity, FolderState } from '../entities/folder.entity';
import {
  FOLDER_REPOSITORY,
} from '../repositories/folder.repository.interface';
import type {
  IFolderRepository,
  FindFolderOptions,
  TransactionOptions,
} from '../repositories/folder.repository.interface';

/**
 * 폴더 생성 파라미터
 */
export interface CreateFolderParams {
  id: string;
  name: string;
  parentId: string | null;
  /** 경로를 직접 지정 (비즈니스 레이어에서 충돌 처리 후 전달) */
  path?: string;
}

@Injectable()
export class FolderDomainService {
  constructor(
    @Inject(FOLDER_REPOSITORY)
    private readonly folderRepository: IFolderRepository,
  ) {}

  // ============================================
  // 조회 메서드 (Query Methods)
  // ============================================

  /**
   * ID로 폴더 조회
   */
  async 조회(folderId: string, txOptions?: TransactionOptions): Promise<FolderEntity | null> {
    return this.folderRepository.findById(folderId, txOptions);
  }

  /**
   * ID로 폴더 조회 (락 획득)
   */
  async 잠금조회(folderId: string, txOptions?: TransactionOptions): Promise<FolderEntity | null> {
    return this.folderRepository.findByIdForUpdate(folderId, txOptions);
  }

  /**
   * 조건으로 폴더 조회
   */
  async 조건조회(options: FindFolderOptions): Promise<FolderEntity | null> {
    return this.folderRepository.findOne(options);
  }

  /**
   * 루트 폴더 조회
   */
  async 루트폴더조회(): Promise<FolderEntity | null> {
    return this.folderRepository.findOne({ parentId: null });
  }

  /**
   * 상위 폴더 내 하위 폴더 목록 조회
   */
  async 하위폴더조회(parentId: string | null, state?: FolderState): Promise<FolderEntity[]> {
    return this.folderRepository.findByParentId(parentId, state);
  }

  /**
   * 하위 모든 폴더 조회 (재귀)
   */
  async 모든하위폴더조회(folderId: string, state?: FolderState): Promise<FolderEntity[]> {
    return this.folderRepository.findAllDescendants(folderId, state);
  }

  /**
   * 상위 폴더 체인 조회 (브레드크럼)
   */
  async 상위폴더체인조회(folderId: string): Promise<FolderEntity[]> {
    return this.folderRepository.findAncestors(folderId);
  }

  /**
   * 동일 폴더명 존재 확인
   */
  async 중복확인(parentId: string | null, name: string, excludeFolderId?: string): Promise<boolean> {
    return this.folderRepository.existsByNameInParent(parentId, name, excludeFolderId);
  }

  /**
   * 폴더 + 하위 통계 조회
   */
  async 통계조회(folderId: string): Promise<{ fileCount: number; folderCount: number; totalSize: number }> {
    return this.folderRepository.getStatistics(folderId);
  }

  // ============================================
  // 명령 메서드 (Command Methods)
  // ============================================

  /**
   * 폴더 생성
   * 새 폴더 엔티티를 생성하고 영속화합니다.
   * 
   * 참고: 중복 확인 및 경로 계산은 비즈니스 레이어에서 처리 후 path를 전달합니다.
   *
   * @param params - 폴더 생성 파라미터
   * @param txOptions - 트랜잭션 옵션
   * @returns 생성된 폴더 엔티티
   */
  async 생성(params: CreateFolderParams, txOptions?: TransactionOptions): Promise<FolderEntity> {
    // 경로가 전달되지 않은 경우 직접 계산
    let folderPath = params.path;
    if (!folderPath) {
      let parentPath = '';
      if (params.parentId) {
        const parent = await this.folderRepository.findById(params.parentId, txOptions);
        if (!parent) {
          throw new Error(`부모 폴더를 찾을 수 없습니다: ${params.parentId}`);
        }
        if (!parent.isActive()) {
          throw new Error('활성 상태의 폴더에만 하위 폴더를 생성할 수 있습니다.');
        }
        parentPath = parent.path;
      }
      folderPath = parentPath ? `${parentPath}/${params.name}` : `/${params.name}`;
    }

    // 새 엔티티 생성
    const folder = new FolderEntity({
      id: params.id,
      name: params.name,
      parentId: params.parentId,
      path: folderPath,
      state: FolderState.ACTIVE,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // 영속화
    return this.folderRepository.save(folder, txOptions);
  }

  /**
   * 폴더 저장
   * 기존 폴더 엔티티를 영속화합니다.
   *
   * @param folder - 저장할 폴더 엔티티
   * @param txOptions - 트랜잭션 옵션
   * @returns 저장된 폴더 엔티티
   */
  async 저장(folder: FolderEntity, txOptions?: TransactionOptions): Promise<FolderEntity> {
    return this.folderRepository.save(folder, txOptions);
  }

  /**
   * 폴더 삭제 (휴지통으로 이동)
   * 엔티티의 delete 행위를 실행하고 변경사항을 영속화합니다.
   *
   * @param folderId - 대상 폴더 ID
   * @param txOptions - 트랜잭션 옵션
   * @returns 업데이트된 폴더 엔티티
   * @throws Error - 폴더가 존재하지 않거나 활성 상태가 아닌 경우
   */
  async 삭제(folderId: string, txOptions?: TransactionOptions): Promise<FolderEntity> {
    const folder = await this.folderRepository.findByIdForUpdate(folderId, txOptions);
    if (!folder) {
      throw new Error(`폴더를 찾을 수 없습니다: ${folderId}`);
    }

    // 루트 폴더는 삭제 불가
    if (folder.isRoot()) {
      throw new Error('루트 폴더는 삭제할 수 없습니다.');
    }

    // 엔티티 행위 실행
    folder.delete();

    // 영속화
    return this.folderRepository.save(folder, txOptions);
  }

  /**
   * 폴더 삭제 (엔티티 직접 전달)
   * 이미 조회된 엔티티의 delete 행위를 실행하고 영속화합니다.
   * 비즈니스 레이어에서 락을 이미 획득한 경우 사용합니다.
   *
   * @param folder - 삭제할 폴더 엔티티
   * @param txOptions - 트랜잭션 옵션
   * @returns 업데이트된 폴더 엔티티
   */
  async 엔티티삭제(folder: FolderEntity, txOptions?: TransactionOptions): Promise<FolderEntity> {
    // 루트 폴더는 삭제 불가
    if (folder.isRoot()) {
      throw new Error('루트 폴더는 삭제할 수 없습니다.');
    }

    // 엔티티 행위 실행
    folder.delete();

    // 영속화
    return this.folderRepository.save(folder, txOptions);
  }

  /**
   * 폴더명 변경
   * 엔티티의 rename 행위를 실행하고 변경사항을 영속화합니다.
   * 하위 폴더들의 경로도 함께 업데이트합니다.
   *
   * @param folderId - 대상 폴더 ID
   * @param newName - 새 폴더명
   * @param newPath - 새 경로 (비즈니스 레이어에서 계산하여 전달, 없으면 자동 계산)
   * @param txOptions - 트랜잭션 옵션
   * @returns 업데이트된 폴더 엔티티
   * @throws Error - 폴더가 존재하지 않거나 활성 상태가 아닌 경우
   */
  async 이름변경(folderId: string, newName: string, newPath?: string, txOptions?: TransactionOptions): Promise<FolderEntity> {
    const folder = await this.folderRepository.findByIdForUpdate(folderId, txOptions);
    if (!folder) {
      throw new Error(`폴더를 찾을 수 없습니다: ${folderId}`);
    }

    return this.엔티티이름변경(folder, newName, newPath, txOptions);
  }

  /**
   * 폴더명 변경 (엔티티 직접 전달)
   * 이미 조회된 엔티티의 rename 행위를 실행하고 영속화합니다.
   *
   * @param folder - 이름을 변경할 폴더 엔티티
   * @param newName - 새 폴더명
   * @param newPath - 새 경로 (비즈니스 레이어에서 계산하여 전달, 없으면 자동 계산)
   * @param txOptions - 트랜잭션 옵션
   * @returns 업데이트된 폴더 엔티티
   */
  async 엔티티이름변경(folder: FolderEntity, newName: string, newPath?: string, txOptions?: TransactionOptions): Promise<FolderEntity> {
    // 루트 폴더는 이름 변경 불가
    if (folder.isRoot()) {
      throw new Error('루트 폴더는 이름을 변경할 수 없습니다.');
    }

    // 새 경로 계산 (전달되지 않은 경우)
    const oldPath = folder.path;
    if (!newPath) {
      const pathParts = oldPath.split('/');
      pathParts[pathParts.length - 1] = newName;
      newPath = pathParts.join('/');
    }

    // 엔티티 행위 실행
    folder.rename(newName, newPath);

    // 영속화
    const savedFolder = await this.folderRepository.save(folder, txOptions);

    // 하위 폴더들의 경로 일괄 업데이트
    await this.folderRepository.updatePathByPrefix(oldPath + '/', newPath + '/', txOptions);

    return savedFolder;
  }

  /**
   * 폴더 이동
   * 엔티티의 moveTo 행위를 실행하고 변경사항을 영속화합니다.
   * 하위 폴더들의 경로도 함께 업데이트합니다.
   *
   * @param folderId - 대상 폴더 ID
   * @param targetParentId - 이동할 대상 부모 폴더 ID
   * @param newPath - 새 경로 (비즈니스 레이어에서 계산하여 전달, 없으면 자동 계산)
   * @param txOptions - 트랜잭션 옵션
   * @returns 업데이트된 폴더 엔티티
   * @throws Error - 폴더가 존재하지 않거나 활성 상태가 아닌 경우
   */
  async 이동(folderId: string, targetParentId: string, newPath?: string, txOptions?: TransactionOptions): Promise<FolderEntity> {
    const folder = await this.folderRepository.findByIdForUpdate(folderId, txOptions);
    if (!folder) {
      throw new Error(`폴더를 찾을 수 없습니다: ${folderId}`);
    }

    return this.엔티티이동(folder, targetParentId, newPath, txOptions);
  }

  /**
   * 폴더 이동 (엔티티 직접 전달)
   * 이미 조회된 엔티티의 moveTo 행위를 실행하고 영속화합니다.
   *
   * @param folder - 이동할 폴더 엔티티
   * @param targetParentId - 이동할 대상 부모 폴더 ID
   * @param newPath - 새 경로 (비즈니스 레이어에서 계산하여 전달, 없으면 자동 계산)
   * @param txOptions - 트랜잭션 옵션
   * @returns 업데이트된 폴더 엔티티
   */
  async 엔티티이동(folder: FolderEntity, targetParentId: string, newPath?: string, txOptions?: TransactionOptions): Promise<FolderEntity> {
    // 루트 폴더는 이동 불가
    if (folder.isRoot()) {
      throw new Error('루트 폴더는 이동할 수 없습니다.');
    }

    // 동일 위치로의 이동 방지
    if (folder.parentId === targetParentId) {
      throw new Error('폴더가 이미 해당 위치에 있습니다.');
    }

    // 새 경로 계산 (전달되지 않은 경우)
    const oldPath = folder.path;
    if (!newPath) {
      const targetParent = await this.folderRepository.findById(targetParentId, txOptions);
      if (!targetParent) {
        throw new Error(`대상 폴더를 찾을 수 없습니다: ${targetParentId}`);
      }
      newPath = targetParent.path + '/' + folder.name;
    }

    // 엔티티 행위 실행
    folder.moveTo(targetParentId, newPath);

    // 영속화
    const savedFolder = await this.folderRepository.save(folder, txOptions);

    // 하위 폴더들의 경로 일괄 업데이트
    await this.folderRepository.updatePathByPrefix(oldPath + '/', newPath + '/', txOptions);

    return savedFolder;
  }

  /**
   * 폴더 영구 삭제
   * 엔티티의 permanentDelete 행위를 실행하고 변경사항을 영속화합니다.
   *
   * @param folderId - 대상 폴더 ID
   * @param txOptions - 트랜잭션 옵션
   * @returns 업데이트된 폴더 엔티티
   * @throws Error - 폴더가 존재하지 않거나 휴지통 상태가 아닌 경우
   */
  async 영구삭제(folderId: string, txOptions?: TransactionOptions): Promise<FolderEntity> {
    const folder = await this.folderRepository.findByIdForUpdate(folderId, txOptions);
    if (!folder) {
      throw new Error(`폴더를 찾을 수 없습니다: ${folderId}`);
    }

    return this.엔티티영구삭제(folder, txOptions);
  }

  /**
   * 폴더 영구 삭제 (엔티티 직접 전달)
   * 이미 조회된 엔티티의 permanentDelete 행위를 실행하고 영속화합니다.
   *
   * @param folder - 영구 삭제할 폴더 엔티티
   * @param txOptions - 트랜잭션 옵션
   * @returns 업데이트된 폴더 엔티티
   */
  async 엔티티영구삭제(folder: FolderEntity, txOptions?: TransactionOptions): Promise<FolderEntity> {
    // 루트 폴더는 삭제 불가
    if (folder.isRoot()) {
      throw new Error('루트 폴더는 삭제할 수 없습니다.');
    }

    // 엔티티 행위 실행
    folder.permanentDelete();

    // 영속화
    return this.folderRepository.save(folder, txOptions);
  }

  // ============================================
  // 일괄 작업 메서드 (Bulk Operations)
  // ============================================

  /**
   * 다수 폴더 상태 일괄 변경
   * 비즈니스 레이어에서 하위 폴더들의 상태를 일괄 변경할 때 사용합니다.
   *
   * @param folderIds - 대상 폴더 ID 목록
   * @param state - 변경할 상태
   * @returns 영향받은 폴더 수
   */
  async 상태일괄변경(folderIds: string[], state: FolderState): Promise<number> {
    if (folderIds.length === 0) {
      return 0;
    }
    return this.folderRepository.updateStateByIds(folderIds, state);
  }

  /**
   * 경로 일괄 업데이트
   * 상위 폴더 이동/이름변경 시 하위 폴더들의 경로를 일괄 업데이트합니다.
   *
   * @param oldPrefix - 기존 경로 접두사
   * @param newPrefix - 새 경로 접두사
   * @param txOptions - 트랜잭션 옵션
   * @returns 영향받은 폴더 수
   */
  async 경로일괄변경(oldPrefix: string, newPrefix: string, txOptions?: TransactionOptions): Promise<number> {
    return this.folderRepository.updatePathByPrefix(oldPrefix, newPrefix, txOptions);
  }
}

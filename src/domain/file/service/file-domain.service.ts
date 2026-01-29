/**
 * 파일 도메인 서비스
 * FileEntity의 행위를 실행하고 영속성을 보장합니다.
 *
 * DDD 관점: 도메인 서비스는 엔티티 행위 호출 후 Repository를 통해 변경사항을 영속화합니다.
 */

import { Inject, Injectable } from '@nestjs/common';
import { FileEntity } from '../entities/file.entity';
import { FileState } from '../type/file.type';
import {
    FILE_REPOSITORY,
} from '../repositories/file.repository.interface';

import type {
    IFileRepository,
    FindFileOptions,
} from '../repositories/file.repository.interface';

/**
 * 파일 생성 파라미터
 */
export interface CreateFileParams {
    id: string;
    name: string;
    folderId: string;
    sizeBytes: number;
    mimeType: string;
}

@Injectable()
export class FileDomainService {
    constructor(
        @Inject(FILE_REPOSITORY)
        private readonly fileRepository: IFileRepository,
    ) { }

    // ============================================
    // 조회 메서드 (Query Methods)
    // ============================================

    /**
     * ID로 파일 조회
     */
    async 조회(fileId: string): Promise<FileEntity | null> {
        return this.fileRepository.findById(fileId);
    }

    /**
     * ID로 파일 조회 (락 획득)
     */
    async 조회ForUpdate(fileId: string): Promise<FileEntity | null> {
        return this.fileRepository.findByIdForUpdate(fileId);
    }

    /**
     * 조건으로 파일 조회
     */
    async 조회ByOptions(options: FindFileOptions): Promise<FileEntity | null> {
        return this.fileRepository.findOne(options);
    }

    /**
     * 폴더 내 파일 목록 조회
     */
    async 폴더내파일조회(folderId: string, state?: FileState): Promise<FileEntity[]> {
        return this.fileRepository.findByFolderId(folderId, state);
    }

    /**
     * 동일 파일명 존재 확인
     * @param createdAt 동일 createdAt 값도 체크할 경우 전달
     */
    async 중복확인(folderId: string, name: string, mimeType: string, excludeFileId?: string, createdAt?: Date): Promise<boolean> {
        return this.fileRepository.existsByNameInFolder(folderId, name, mimeType, excludeFileId, undefined, createdAt);
    }

    // ============================================
    // 명령 메서드 (Command Methods)
    // ============================================

    /**
     * 파일 생성
     * 새 파일 엔티티를 생성하고 영속화합니다.
     * 
     * 참고: 중복 확인은 비즈니스 레이어에서 처리할 수 있습니다.
     *
     * @param params - 파일 생성 파라미터
     * @returns 생성된 파일 엔티티
     */
    async 생성(params: CreateFileParams): Promise<FileEntity> {
        // 새 엔티티 생성
        const file = new FileEntity({
            id: params.id,
            name: params.name,
            folderId: params.folderId,
            sizeBytes: params.sizeBytes,
            mimeType: params.mimeType,
            state: FileState.ACTIVE,
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        // 영속화
        return this.fileRepository.save(file);
    }

    /**
     * 파일 삭제 (휴지통으로 이동)
     * 엔티티의 delete 행위를 실행하고 변경사항을 영속화합니다.
     *
     * @param fileId - 대상 파일 ID
     * @returns 업데이트된 파일 엔티티
     * @throws Error - 파일이 존재하지 않거나 활성 상태가 아닌 경우
     */
    async 삭제(fileId: string): Promise<FileEntity> {
        const file = await this.fileRepository.findByIdForUpdate(fileId);
        if (!file) {
            throw new Error(`파일을 찾을 수 없습니다: ${fileId}`);
        }

        return this.삭제WithEntity(file);
    }

    /**
     * 파일 삭제 (엔티티 직접 전달)
     * 이미 조회된 엔티티의 delete 행위를 실행하고 영속화합니다.
     *
     * @param file - 삭제할 파일 엔티티
     * @returns 업데이트된 파일 엔티티
     */
    async 삭제WithEntity(file: FileEntity): Promise<FileEntity> {
        // 엔티티 행위 실행
        file.delete();

        // 영속화
        return this.fileRepository.save(file);
    }

    /**
     * 파일명 변경
     * 엔티티의 rename 행위를 실행하고 변경사항을 영속화합니다.
     *
     * @param fileId - 대상 파일 ID
     * @param newName - 새 파일명
     * @returns 업데이트된 파일 엔티티
     * @throws Error - 파일이 존재하지 않거나 활성 상태가 아닌 경우
     */
    async 이름변경(fileId: string, newName: string): Promise<FileEntity> {
        const file = await this.fileRepository.findByIdForUpdate(fileId);
        if (!file) {
            throw new Error(`파일을 찾을 수 없습니다: ${fileId}`);
        }

        return this.이름변경WithEntity(file, newName);
    }

    /**
     * 파일명 변경 (엔티티 직접 전달)
     * 이미 조회된 엔티티의 rename 행위를 실행하고 영속화합니다.
     *
     * @param file - 이름을 변경할 파일 엔티티
     * @param newName - 새 파일명
     * @returns 업데이트된 파일 엔티티
     */
    async 이름변경WithEntity(file: FileEntity, newName: string): Promise<FileEntity> {
        // 엔티티 행위 실행
        file.rename(newName);

        // 영속화
        return this.fileRepository.save(file);
    }

    /**
     * 파일 이동
     * 엔티티의 moveTo 행위를 실행하고 변경사항을 영속화합니다.
     *
     * @param fileId - 대상 파일 ID
     * @param targetFolderId - 이동할 대상 폴더 ID
     * @returns 업데이트된 파일 엔티티
     * @throws Error - 파일이 존재하지 않거나 활성 상태가 아닌 경우
     */
    async 이동(fileId: string, targetFolderId: string): Promise<FileEntity> {
        const file = await this.fileRepository.findByIdForUpdate(fileId);
        if (!file) {
            throw new Error(`파일을 찾을 수 없습니다: ${fileId}`);
        }

        return this.이동WithEntity(file, targetFolderId);
    }

    /**
     * 파일 이동 (엔티티 직접 전달)
     * 이미 조회된 엔티티의 moveTo 행위를 실행하고 영속화합니다.
     *
     * @param file - 이동할 파일 엔티티
     * @param targetFolderId - 이동할 대상 폴더 ID
     * @returns 업데이트된 파일 엔티티
     */
    async 이동WithEntity(file: FileEntity, targetFolderId: string): Promise<FileEntity> {
        // 동일 폴더로의 이동 방지
        if (file.folderId === targetFolderId) {
            throw new Error('파일이 이미 해당 폴더에 있습니다.');
        }

        // 엔티티 행위 실행
        file.moveTo(targetFolderId);

        // 영속화
        return this.fileRepository.save(file);
    }

    /**
     * 파일 영구 삭제
     * 엔티티의 permanentDelete 행위를 실행하고 변경사항을 영속화합니다.
     *
     * @param fileId - 대상 파일 ID
     * @returns 업데이트된 파일 엔티티
     * @throws Error - 파일이 존재하지 않거나 휴지통 상태가 아닌 경우
     */
    async 영구삭제(fileId: string): Promise<FileEntity> {
        const file = await this.fileRepository.findByIdForUpdate(fileId);
        if (!file) {
            throw new Error(`파일을 찾을 수 없습니다: ${fileId}`);
        }

        return this.영구삭제WithEntity(file);
    }

    /**
     * 파일 영구 삭제 (엔티티 직접 전달)
     * 이미 조회된 엔티티의 permanentDelete 행위를 실행하고 영속화합니다.
     *
     * @param file - 영구 삭제할 파일 엔티티
     * @returns 업데이트된 파일 엔티티
     */
    async 영구삭제WithEntity(file: FileEntity): Promise<FileEntity> {
        // 엔티티 행위 실행
        file.permanentDelete();

        // 영속화
        return this.fileRepository.save(file);
    }

    // ============================================
    // 일괄 작업 메서드 (Bulk Operations)
    // ============================================

    /**
     * 다수 파일 상태 일괄 변경 (폴더 ID 기준)
     * 비즈니스 레이어에서 폴더 삭제 시 하위 파일들의 상태를 일괄 변경할 때 사용합니다.
     *
     * @param folderIds - 대상 폴더 ID 목록
     * @param state - 변경할 상태
     * @returns 영향받은 파일 수
     */
    async 상태일괄변경ByFolderIds(folderIds: string[], state: FileState): Promise<number> {
        if (folderIds.length === 0) {
            return 0;
        }
        return this.fileRepository.updateStateByFolderIds(folderIds, state);
    }
}

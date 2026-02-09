/**
 * 시스템 설정 도메인 서비스
 * 시스템 설정 조회, 업데이트 도메인 로직을 담당합니다.
 *
 * DDD 규칙: Repository는 Domain Service에서만 주입받습니다.
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { SystemConfigEntity } from '../entities/system-config.entity';
import {
  SYSTEM_CONFIG_REPOSITORY,
  type ISystemConfigRepository,
} from '../repositories/system-config.repository.interface';

@Injectable()
export class SystemConfigDomainService {
  private readonly logger = new Logger(SystemConfigDomainService.name);

  constructor(
    @Inject(SYSTEM_CONFIG_REPOSITORY)
    private readonly repo: ISystemConfigRepository,
  ) {}

  /**
   * 숫자 설정값 조회
   * @param key 설정 키
   * @param defaultValue 기본값 (설정이 없거나 파싱 실패 시)
   * @returns 숫자 값
   */
  async getNumberConfig(key: string, defaultValue: number): Promise<number> {
    const entity = await this.repo.findByKey(key);
    if (!entity) return defaultValue;
    return entity.getNumberValue(defaultValue);
  }

  /**
   * 문자열 설정값 조회
   * @param key 설정 키
   * @param defaultValue 기본값 (설정이 없을 시)
   * @returns 문자열 값
   */
  async getStringConfig(key: string, defaultValue: string): Promise<string> {
    const entity = await this.repo.findByKey(key);
    return entity?.value ?? defaultValue;
  }

  /**
   * 접두사로 설정 목록 조회
   * @param prefix 키 접두사
   * @returns 설정 엔티티 배열
   */
  async getConfigsByPrefix(prefix: string): Promise<SystemConfigEntity[]> {
    return this.repo.findByKeyPrefix(prefix);
  }

  /**
   * 설정 업데이트 (없으면 생성)
   * @param key 설정 키
   * @param value 설정 값
   * @param updatedBy 수정자 ID
   * @param description 설정 설명 (선택)
   * @returns 저장된 설정 엔티티
   */
  async updateConfig(
    key: string,
    value: string,
    updatedBy: string,
    description?: string,
  ): Promise<SystemConfigEntity> {
    let entity = await this.repo.findByKey(key);

    if (entity) {
      entity.value = value;
      entity.updatedBy = updatedBy;
      entity.updatedAt = new Date();
    } else {
      entity = new SystemConfigEntity({
        id: uuidv4(),
        key,
        value,
        description: description || '',
        updatedAt: new Date(),
        updatedBy,
      });
    }

    return this.repo.save(entity);
  }
}

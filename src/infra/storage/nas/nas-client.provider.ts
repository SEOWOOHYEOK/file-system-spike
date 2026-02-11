import { Injectable, Logger, BadRequestException, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import * as fs from 'fs';

/**
 * NAS 클라이언트 공급자
 * - NAS 루트 경로 관리
 * - 경로 검증 및 정규화
 */
@Injectable()
export class NasClientProvider implements OnModuleInit {
  private readonly logger = new Logger(NasClientProvider.name);
  private readonly nasRootPath: string;

  readonly trashFolder = '.nas_trash';

  constructor(private readonly configService: ConfigService) {
    // this.nasRootPath = this.configService.get<string>('NAS_MOUNT_PATH') || '\\\\192.168.10.249\\Web\\personal\\서우혁\\filerServerTest';
    this.nasRootPath = 
    this.configService.get<string>('NAS_MOUNT_PATH') 
    || '\\\\192.168.10.249\\Web\\personal\\서우혁\\dms';

    if (!this.nasRootPath) {
      this.logger.warn('⚠️ NAS_MOUNT_PATH 환경변수가 설정되지 않았습니다.');
    } else {
      this.logger.log(`📁 NAS 루트 경로: ${this.nasRootPath}`);
    }
  }

  /**
   * 모듈 초기화 시 실행
   * - NAS 경로 설정 검증
   * - 연결 테스트
   */
  async onModuleInit() {
    this.validateNasConfig();
    await this.checkNasConnectivity();
  }

  private validateNasConfig() {
    if (!this.nasRootPath) return;

    // 이중 이스케이프 체크 (\\\\로 시작하는지 확인)
    // 정상적인 UNC 경로는 \\server... 이지만, .env에서 \\\\server... 로 입력하면
    // 코드에서는 \\\\\\\\server... (백슬래시 8개) 또는 \\\\server... (백슬래시 4개)로 인식될 수 있음
    // JS 문자열에서 백슬래시 4개는 실제 문자 4개를 의미할 수도 있고, 이스케이프된 2개를 의미할 수도 있음.
    // 여기서는 문자열 값 자체를 검사.
    
    if (this.nasRootPath.startsWith('\\\\\\\\')) {
      this.logger.error(`🚨 NAS_MOUNT_PATH 설정 오류 감지: 경로가 '\\\\\\\\'로 시작합니다. .env 파일에서 이스케이프가 중복되었을 수 있습니다.`);
      this.logger.error(`현재 값: ${this.nasRootPath}`);
      this.logger.error(`권장 값: \\\\192.168... (백슬래시 2개로 시작)`);
      throw new Error('NAS_MOUNT_PATH 설정 오류 이유: 이중 이스케이프 체크 실패');
    }
  }

  private async checkNasConnectivity() {
    if (!this.nasRootPath) return;

    try {
      await fs.promises.access(this.nasRootPath, fs.constants.F_OK);
      this.logger.log(`✅ NAS 연결 확인 완료: ${this.nasRootPath}`);
    } catch (error: any) {
      this.logger.error(`❌ NAS 연결 실패: ${this.nasRootPath}`);
      this.logger.error(`원인: ${error.message}`);
      // 연결 실패는 치명적일 수 있으나, 앱 실행을 막지 않고 경고만 남김 (선택 사항)
    }
  }

  /**
   * NAS 루트 경로 반환
   */
  getRootPath(): string {
    return this.nasRootPath;
  }

  /**
   * UNC 경로인지 확인
   */
  isUNCPath(p: string): boolean {
    return p.startsWith('\\\\') || p.startsWith('//');
  }

  /**
   * 루트 경로 정규화
   */
  normalizeRootPath(): string {
    let root = this.nasRootPath;
    root = root.replace(/[/\\]+$/, '');
    return root;
  }

  /**
   * 경로 검증 및 절대 경로 생성
   */
  validateAndCreatePath(relativePath: string): string {
    if (!this.nasRootPath) {
      throw new BadRequestException('NAS_MOUNT_PATH 환경변수가 설정되지 않았습니다.');
    }

    const normalizedRelative = relativePath
      .replace(/\\/g, '/')
      .replace(/^\/+/, '')
      .replace(/\/+$/, '');

    const normalizedRoot = this.normalizeRootPath();
    const isUNC = this.isUNCPath(normalizedRoot);

    let fullPath: string;

    if (isUNC) {
      if (normalizedRelative) {
        fullPath = normalizedRoot + '\\' + normalizedRelative.replace(/\//g, '\\');
      } else {
        fullPath = normalizedRoot;
      }
    } else {
      fullPath = path.resolve(normalizedRoot, normalizedRelative);
    }

    // Path Traversal 방지
    if (normalizedRelative.includes('..')) {
      throw new BadRequestException('허용되지 않은 경로입니다.');
    }

    // 경로가 루트 내부인지 확인
    if (normalizedRelative) {
      const normalizedFullPath = fullPath.replace(/\\/g, '/').toLowerCase();
      const normalizedRootCheck = normalizedRoot.replace(/\\/g, '/').toLowerCase();

      if (!normalizedFullPath.startsWith(normalizedRootCheck)) {
        this.logger.error(`🚨 경로 이탈 감지: ${fullPath} (Root: ${normalizedRoot})`);
        throw new BadRequestException('허용되지 않은 경로입니다.');
      }
    }

    // 첫 호출 시 또는 디버그 레벨에서 경로 확인 로그
    // (너무 잦은 로그를 방지하기 위해 debug 레벨 사용)
    this.logger.debug(`경로 해석됨: ${relativePath} -> ${fullPath}`);

    return fullPath;
  }

  /**
   * 절대 경로에서 상대 경로 생성
   */
  createRelativePath(fullPath: string): string {
    const normalizedRoot = this.normalizeRootPath();

    const normalizedFullPath = fullPath.replace(/\\/g, '/');
    const normalizedRootSlash = normalizedRoot.replace(/\\/g, '/');

    let relativePath: string;
    if (normalizedFullPath.toLowerCase().startsWith(normalizedRootSlash.toLowerCase())) {
      relativePath = normalizedFullPath.substring(normalizedRootSlash.length);
      relativePath = relativePath.replace(/^\/+/, '');
    } else {
      relativePath = path.relative(normalizedRoot, fullPath);
    }

    return relativePath.replace(/\\/g, '/');
  }

  /**
   * 파일명 유효성 검증
   */
  validateFileName(name: string): void {
    if (!name || name.trim() === '') {
      throw new BadRequestException('파일/폴더 이름은 필수입니다.');
    }

    const invalidChars = /[<>:"/\\|?*\x00-\x1f]/;
    if (invalidChars.test(name)) {
      throw new BadRequestException('파일/폴더 이름에 사용할 수 없는 문자가 포함되어 있습니다.');
    }

    const reservedNames = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
    if (reservedNames.test(name)) {
      throw new BadRequestException('사용할 수 없는 파일/폴더 이름입니다.');
    }

    if (name.length > 255) {
      throw new BadRequestException('파일/폴더 이름이 너무 깁니다. (최대 255자)');
    }
  }
}

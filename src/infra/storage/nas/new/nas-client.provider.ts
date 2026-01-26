import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';

/**
 * NAS 클라이언트 공급자
 * - NAS 루트 경로 관리
 * - 경로 검증 및 정규화
 */
@Injectable()
export class NasClientProvider {
  private readonly logger = new Logger(NasClientProvider.name);
  private readonly nasRootPath: string;

  readonly trashFolder = '.nas_trash';

  constructor(private readonly configService: ConfigService) {
    // this.nasRootPath = this.configService.get<string>('NAS_ROOT_PATH') || '\\\\192.168.10.249\\Web\\personal\\서우혁\\filerServerTest';
    this.nasRootPath = 
    this.configService.get<string>('NAS_ROOT_PATH') 
    || '\\\\192.168.10.249\\Web\\personal\\서우혁\\dms';

    if (!this.nasRootPath) {
      this.logger.warn('⚠️ NAS_ROOT_PATH 환경변수가 설정되지 않았습니다.');
    } else {
      this.logger.log(`📁 NAS 루트 경로: ${this.nasRootPath}`);
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
      throw new BadRequestException('NAS_ROOT_PATH 환경변수가 설정되지 않았습니다.');
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
        throw new BadRequestException('허용되지 않은 경로입니다.');
      }
    }

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


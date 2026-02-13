/**
 * NAS Health Check 도메인 서비스
 * 운영체제 환경을 감지하여 적절한 방식으로 NAS 연결 상태와 용량을 확인합니다.
 * - Windows: PowerShell + UNC 경로를 통한 매핑 드라이브 용량 조회
 * - Linux/Docker: df 명령어를 통한 마운트 경로 용량 조회
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { exec, execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as os from 'os';


const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);


/**
 * NAS 용량 정보
 */
export interface NasCapacity {
  totalBytes: number;
  usedBytes: number;
  freeBytes: number;
  drive?: string;
  provider?: string;
}

/**
 * NAS 스토리지 건강 상태 결과
 */
export interface NasHealthResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  responseTimeMs: number;
  checkedAt: Date;
  capacity?: NasCapacity;
  error?: string;
}

@Injectable()
export class NasHealthCheckService {
  private readonly logger = new Logger(NasHealthCheckService.name);
  private readonly isWindows: boolean;

  constructor(private readonly configService: ConfigService) {
    this.isWindows = os.platform() === 'win32';
    this.logger.log(`운영체제 감지: ${os.platform()} (Windows: ${this.isWindows})`);
  }

  /**
   * NAS 스토리지 연결 상태 및 용량 확인
   * 운영체제에 따라 Windows(PowerShell) 또는 Linux(df) 방식으로 확인합니다.
   * @returns NAS 스토리지의 건강 상태와 용량 정보
   */
  async checkHealth(): Promise<NasHealthResult> {
    const startTime = Date.now();

    const mountPath = this.configService.get<string>('NAS_MOUNT_PATH');

    if (!mountPath) {
      return {
        status: 'unhealthy',
        responseTimeMs: Date.now() - startTime,
        checkedAt: new Date(),
        error: 'NAS_MOUNT_PATH 환경변수가 설정되지 않았습니다.',
      };
    }

    try {
      let capacity: NasCapacity;

      if (this.isWindows) {
        // Windows: UNC 경로 검증 + PowerShell로 용량 조회
        if (!this.isUNCPath(mountPath)) {
          return {
            status: 'unhealthy',
            responseTimeMs: Date.now() - startTime,
            checkedAt: new Date(),
            error: '유효한 UNC 경로가 아닙니다.',
          };
        }

        capacity = await Promise.race([
          this.getCapacityWindowsUNC(mountPath),
          this.createTimeout(10000),
        ]);
      } else {
        // Linux/Docker: 마운트 경로 검증 + df 명령어로 용량 조회
        if (!this.isValidLinuxPath(mountPath)) {
          return {
            status: 'unhealthy',
            responseTimeMs: Date.now() - startTime,
            checkedAt: new Date(),
            error: `유효한 Linux 경로가 아닙니다: ${mountPath}`,
          };
        }

        capacity = await Promise.race([
          this.getCapacityLinux(mountPath),
          this.createTimeout(10000),
        ]);
      }

      const responseTime = Date.now() - startTime;

      return {
        status: responseTime > 1000 ? 'degraded' : 'healthy',
        responseTimeMs: responseTime,
        checkedAt: new Date(),
        capacity,
      };
    } catch (error) {
      this.logger.error(`NAS 상태 확인 실패: ${error}`);
      return {
        status: 'unhealthy',
        responseTimeMs: Date.now() - startTime,
        checkedAt: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * 타임아웃 Promise 생성
   */
  private createTimeout(ms: number): Promise<never> {
    return new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Timeout')), ms),
    );
  }

  // ============================================
  // 경로 검증 메서드
  // ============================================

  /**
   * UNC 경로인지 확인 (Windows 전용)
   * \\server\share 또는 //server/share 형식
   */
  private isUNCPath(path: string): boolean {
    return path.startsWith('\\\\') || path.startsWith('//');
  }

  /**
   * Linux 경로 유효성 확인
   * 절대 경로(/ 시작)인지 확인
   */
  private isValidLinuxPath(path: string): boolean {
    return path.startsWith('/');
  }

  // ============================================
  // Windows 전용 메서드
  // ============================================

  /**
   * UNC 경로 정규화
   * 다양한 이스케이프 형식을 표준 형식으로 변환
   * 예: '\\\\\\\\192.168.10.249\\\\Web' → '//192.168.10.249/Web'
   */
  private normalizeUNCPath(uncPath: string): string {
    // 모든 연속된 백슬래시/슬래시를 단일 슬래시로 변환
    return uncPath.replace(/[\\\/]+/g, '/');
  }

  /**
   * UNC 경로에서 서버명과 공유 폴더명 추출
   * 예: '\\192.168.10.249\Web\folder' → { server: '192.168.10.249', share: 'Web' }
   */
  private parseUNCPath(uncPath: string): { server: string; share: string } {
    const normalized = this.normalizeUNCPath(uncPath);
    // 앞의 슬래시들 제거하고 분리
    const parts = normalized.replace(/^\/+/, '').split('/').filter(p => p.length > 0);

    const server = parts[0] || '';
    const share = parts[1] || '';

    this.logger.debug(`UNC 경로 파싱: 원본=${uncPath}, 정규화=${normalized}, 서버=${server}, 공유=${share}`);

    if (!server || !share) {
      throw new Error(`UNC 경로 파싱 실패: 서버=${server}, 공유=${share}, 원본=${uncPath}`);
    }

    return { server, share };
  }

  /**
   * Windows UNC 경로를 통해 NAS 용량 조회
   * PowerShell을 사용하여 매핑된 네트워크 드라이브의 용량 정보를 가져옵니다.
   */
  private async getCapacityWindowsUNC(uncPath: string): Promise<NasCapacity> {
    // UNC 경로에서 서버와 공유 폴더 추출 (예: \\192.168.10.249\Web)
    const { server: serverName, share: shareName } = this.parseUNCPath(uncPath);

    this.logger.debug(`UNC 경로 분석: 서버=${serverName}, 공유=${shareName}`);

    // 매핑된 드라이브 중 해당 UNC 경로를 사용하는 것 찾기
    // PowerShell 명령어를 한 줄로 구성 (줄바꿈 이슈 방지)
    // 정확한 서버명 매칭을 위해 \\serverName\ 패턴 사용
    const ps = `
    $mapped = Get-CimInstance Win32_MappedLogicalDisk | Where-Object { 
      $_.ProviderName -like "*${serverName}*" -and $_.ProviderName -like "*${shareName}*"
    } | Select-Object -First 1;
    
    if ($mapped) {
      $drive = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='$($mapped.DeviceID)'";
      [PSCustomObject]@{
        Total = [int64]$drive.Size
        Free  = [int64]$drive.FreeSpace
        Used  = [int64]($drive.Size - $drive.FreeSpace)
        Drive = $drive.DeviceID
        Provider = $mapped.ProviderName
      } | ConvertTo-Json -Compress
    }  else {
        throw "No mapped drive found for UNC path"
    }
  `.trim();

    const { stdout } = await execFileAsync('powershell', ['-NoProfile', '-Command', ps]);

    const result = JSON.parse(stdout.trim());

    // 응답 유효성 검증
    this.validateCapacityResult(result, serverName, shareName);

    return {
      totalBytes: result.Total,
      usedBytes: result.Used,
      freeBytes: result.Free,
      drive: result.Drive,
      provider: result.Provider,
    };
  }

  /**
   * 용량 조회 결과 유효성 검증 (Windows PowerShell 결과)
   * - Total이 0이거나 Drive가 null이면 에러
   * - Provider가 요청한 서버/공유 폴더와 일치하는지 확인
   */
  private validateCapacityResult(
    result: { Total: number; Free: number; Used: number; Drive: string | null; Provider: string },
    expectedServer: string,
    expectedShare: string,
  ): void {
    // Drive가 null이면 에러
    if (!result.Drive) {
      throw new Error(`매핑된 드라이브를 찾을 수 없습니다. Provider: ${result.Provider}`);
    }

    // Total이 0이면 에러 (정상적인 드라이브는 용량이 0일 수 없음)
    if (result.Total === 0) {
      throw new Error(`드라이브 용량을 조회할 수 없습니다. Drive: ${result.Drive}, Provider: ${result.Provider}`);
    }

    // Provider가 예상한 서버/공유와 일치하는지 검증
    const normalizedProvider = result.Provider.replace(/\\/g, '/').toLowerCase();
    const expectedPattern = `//${expectedServer}/${expectedShare}`.toLowerCase();

    if (!normalizedProvider.includes(expectedPattern)) {
      throw new Error(
        `반환된 Provider(${result.Provider})가 예상한 경로(\\\\${expectedServer}\\${expectedShare})와 일치하지 않습니다.`
      );
    }
  }

  // ============================================
  // Linux/Docker 전용 메서드
  // ============================================

  /**
   * Linux 환경에서 마운트된 경로의 용량 조회
   * df 명령어를 사용하여 디스크 사용량 정보를 가져옵니다.
   */
  private async getCapacityLinux(mountPath: string): Promise<NasCapacity> {
    // 경로 접근 가능 여부 확인
    try {
      await fs.promises.access(mountPath, fs.constants.F_OK | fs.constants.R_OK);
    } catch {
      throw new Error(`NAS 경로에 접근할 수 없습니다: ${mountPath}`);
    }

    // df -B1 로 바이트 단위 용량 조회 (POSIX 호환 출력)
    const { stdout } = await execAsync(`df -B1 "${mountPath}"`);
    const lines = stdout.trim().split('\n');

    // 헤더 제외, 마지막 라인 사용 (df 출력이 여러 줄일 수 있음)
    if (lines.length < 2) {
      throw new Error(`df 명령어 출력 파싱 실패: 출력 라인 부족 (${lines.length}줄)`);
    }

    const dataLine = lines[lines.length - 1];
    const parts = dataLine.trim().split(/\s+/);

    // df 출력 형식: Filesystem 1B-blocks Used Available Use% Mounted_on
    if (parts.length < 6) {
      throw new Error(`df 명령어 출력 파싱 실패: 컬럼 부족 (${parts.length}개) - ${dataLine}`);
    }

    const filesystem = parts[0];
    const totalBytes = parseInt(parts[1], 10);
    const usedBytes = parseInt(parts[2], 10);
    const freeBytes = parseInt(parts[3], 10);
    const mountedOn = parts[5];

    if (isNaN(totalBytes) || isNaN(usedBytes) || isNaN(freeBytes)) {
      throw new Error(`df 출력에서 용량 정보를 파싱할 수 없습니다: ${dataLine}`);
    }

    if (totalBytes === 0) {
      throw new Error(`마운트된 경로의 총 용량이 0입니다: ${mountPath}`);
    }

    this.logger.debug(
      `Linux NAS 용량 조회 완료: filesystem=${filesystem}, ` +
        `total=${totalBytes}, used=${usedBytes}, free=${freeBytes}, mount=${mountedOn}`,
    );

    return {
      totalBytes,
      usedBytes,
      freeBytes,
      drive: filesystem,
      provider: mountedOn,
    };
  }
}

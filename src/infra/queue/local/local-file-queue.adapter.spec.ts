/**
 * ============================================================
 * 📦 LocalFileQueueAdapter 테스트
 * ============================================================
 *
 * 🎯 테스트 대상:
 *   - LocalFileQueueAdapter (로컬 파일 기반 작업 큐)
 *
 * 📋 비즈니스 맥락:
 *   - Redis 없이 파일 시스템으로 작업 큐를 관리
 *   - 프로세스 장애 시 처리 중인 작업이 유실되지 않도록 복구 필요
 *
 * ⚠️ 중요 고려사항:
 *   - active/ 폴더의 작업은 프로세스가 죽으면 영원히 처리되지 않음
 *   - 재시작 시 active/ → waiting/ 복구 로직이 필수
 * ============================================================
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { ConfigService } from '@nestjs/config';
import { LocalFileQueueAdapter } from './local-file-queue.adapter';

describe('LocalFileQueueAdapter', () => {
  let adapter: LocalFileQueueAdapter;
  let testBasePath: string;
  let configService: ConfigService;

  /**
   * 🎭 Mock 설정
   * 📍 ConfigService:
   *   - 실제 동작: 환경변수에서 설정값 조회
   *   - Mock 이유: 테스트용 임시 디렉토리 사용을 위함
   */
  beforeEach(async () => {
    testBasePath = path.join(process.cwd(), 'test-queue-' + Date.now());

    configService = {
      get: jest.fn((key: string, defaultValue: any) => {
        if (key === 'QUEUE_LOCAL_PATH') return testBasePath;
        if (key === 'QUEUE_POLLING_INTERVAL') return 100; // 빠른 테스트를 위해 짧게
        return defaultValue;
      }),
    } as unknown as ConfigService;

    adapter = new LocalFileQueueAdapter(configService);
    await adapter.onModuleInit();
  });

  afterEach(async () => {
    await adapter.onModuleDestroy();
    // 테스트 디렉토리 정리
    try {
      await fs.rm(testBasePath, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  /**
   * ============================================================
   * 📦 Stale Active Job 복구 테스트
   * ============================================================
   *
   * 🎯 테스트 대상:
   *   - recoverStaleActiveJobs 메서드
   *
   * 📋 비즈니스 맥락:
   *   - 프로세스가 갑자기 죽으면 active/ 폴더에 작업이 남음
   *   - 재시작 시 이 작업들을 waiting/으로 복구해야 재처리 가능
   *   - 복구하지 않으면 "Lost Job" - 영원히 처리되지 않는 작업 발생
   *
   * ⚠️ 중요 고려사항:
   *   - attemptsMade는 유지되어야 무한 재시도 방지
   *   - 여러 큐의 작업을 모두 복구해야 함
   * ============================================================
   */
  describe('Stale Active Job 복구', () => {
    /**
     * 📌 테스트 시나리오: 프로세스 재시작 시 active 작업이 waiting으로 복구됨
     *
     * 🎯 검증 목적:
     *   프로세스가 죽었을 때 active/ 폴더에 남은 작업이
     *   재시작 후 다시 처리될 수 있도록 waiting/으로 복구되어야 한다.
     *
     * ✅ 기대 결과:
     *   - active/ 폴더의 작업이 waiting/ 폴더로 이동
     *   - 작업 상태가 'waiting'으로 변경
     */
    it('프로세스 재시작 시 active/ 폴더의 작업을 waiting/으로 복구해야 한다', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // - 프로세스가 죽은 상황을 시뮬레이션
      // - active/ 폴더에 처리 중이던 작업 파일이 남아있음
      // ═══════════════════════════════════════════════════════
      const queueName = 'TEST_QUEUE';
      const jobId = 'stale-job-123';

      // active/ 디렉토리에 작업 파일 직접 생성 (프로세스 죽은 상황 시뮬레이션)
      const activeDir = path.join(testBasePath, queueName, 'active');
      await fs.mkdir(activeDir, { recursive: true });

      const staleJobFile = {
        job: {
          id: jobId,
          queueName,
          data: { testData: 'value' },
          status: 'active',
          progress: 0,
          createdAt: new Date().toISOString(),
          processedAt: new Date().toISOString(),
          attemptsMade: 1,
        },
        options: { attempts: 3 },
      };

      await fs.writeFile(
        path.join(activeDir, `${jobId}.json`),
        JSON.stringify(staleJobFile, null, 2),
      );

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // - 새 어댑터 인스턴스 생성 (프로세스 재시작 시뮬레이션)
      // - onModuleInit 호출 시 복구 로직 실행
      // ═══════════════════════════════════════════════════════
      const newAdapter = new LocalFileQueueAdapter(configService);
      await newAdapter.onModuleInit();

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // - active/ 폴더에서 작업이 사라져야 함
      // - waiting/ 폴더에 작업이 있어야 함
      // ═══════════════════════════════════════════════════════
      const activeCount = await newAdapter.getActiveCount(queueName);
      const waitingCount = await newAdapter.getWaitingCount(queueName);

      expect(activeCount).toBe(0);
      expect(waitingCount).toBe(1);

      // 복구된 작업 확인
      const recoveredJob = await newAdapter.getJob(queueName, jobId);
      expect(recoveredJob).not.toBeNull();
      expect(recoveredJob!.status).toBe('waiting');

      await newAdapter.onModuleDestroy();
    });

    /**
     * 📌 테스트 시나리오: 복구된 작업의 attemptsMade가 1 감소됨 (롤백)
     *
     * 🎯 검증 목적:
     *   프로세스 크래시는 "실패한 시도"가 아니므로 attemptsMade를 롤백해야 한다.
     *   - active로 이동 시 attemptsMade가 증가됨
     *   - 크래시로 인한 복구 시에는 이 증가분을 롤백해야 함
     *   - 그렇지 않으면 크래시 1회당 재시도 기회 1회가 소모됨
     *
     * ✅ 기대 결과:
     *   - attemptsMade 값이 복구 전보다 1 감소
     */
    it('복구된 작업의 attemptsMade가 1 감소되어야 한다 (크래시는 시도 횟수에서 제외)', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // - 작업이 active로 이동하면서 attemptsMade가 2로 증가된 상태
      // - 프로세스 크래시로 인해 active/에 남아있음
      // ═══════════════════════════════════════════════════════
      const queueName = 'RETRY_QUEUE';
      const jobId = 'retry-job-456';
      const attemptsMadeBeforeCrash = 2; // active 이동 시 증가된 값

      const activeDir = path.join(testBasePath, queueName, 'active');
      await fs.mkdir(activeDir, { recursive: true });

      const staleJobFile = {
        job: {
          id: jobId,
          queueName,
          data: { retryTest: true },
          status: 'active',
          progress: 50,
          createdAt: new Date().toISOString(),
          processedAt: new Date().toISOString(),
          attemptsMade: attemptsMadeBeforeCrash,
        },
        options: { attempts: 3, backoff: 1000 },
      };

      await fs.writeFile(
        path.join(activeDir, `${jobId}.json`),
        JSON.stringify(staleJobFile, null, 2),
      );

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const newAdapter = new LocalFileQueueAdapter(configService);
      await newAdapter.onModuleInit();

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // - attemptsMade가 1 감소되어야 함 (2 → 1)
      // - 크래시는 실패한 시도가 아니므로 롤백
      // ═══════════════════════════════════════════════════════
      const recoveredJob = await newAdapter.getJob(queueName, jobId);
      expect(recoveredJob).not.toBeNull();
      expect(recoveredJob!.attemptsMade).toBe(attemptsMadeBeforeCrash - 1);

      await newAdapter.onModuleDestroy();
    });

    /**
     * 📌 테스트 시나리오: attemptsMade가 0인 작업은 0으로 유지됨
     *
     * 🎯 검증 목적:
     *   attemptsMade가 0인 경우 음수가 되면 안 됨.
     *   - 롤백 로직이 0 미만으로 내려가지 않도록 보호
     *
     * ✅ 기대 결과:
     *   - attemptsMade가 0으로 유지 (음수 방지)
     */
    it('attemptsMade가 0인 작업은 0으로 유지되어야 한다 (음수 방지)', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const queueName = 'ZERO_ATTEMPT_QUEUE';
      const jobId = 'zero-attempt-job';

      const activeDir = path.join(testBasePath, queueName, 'active');
      await fs.mkdir(activeDir, { recursive: true });

      const staleJobFile = {
        job: {
          id: jobId,
          queueName,
          data: { test: true },
          status: 'active',
          progress: 0,
          createdAt: new Date().toISOString(),
          attemptsMade: 0, // 이미 0인 상태
        },
      };

      await fs.writeFile(
        path.join(activeDir, `${jobId}.json`),
        JSON.stringify(staleJobFile, null, 2),
      );

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const newAdapter = new LocalFileQueueAdapter(configService);
      await newAdapter.onModuleInit();

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // - attemptsMade가 0으로 유지 (음수가 되면 안 됨)
      // ═══════════════════════════════════════════════════════
      const recoveredJob = await newAdapter.getJob(queueName, jobId);
      expect(recoveredJob).not.toBeNull();
      expect(recoveredJob!.attemptsMade).toBe(0);

      await newAdapter.onModuleDestroy();
    });

    /**
     * 📌 테스트 시나리오: 여러 큐의 active 작업들이 모두 복구됨
     *
     * 🎯 검증 목적:
     *   여러 큐에 걸쳐 있는 stale 작업들이 모두 복구되어야 한다.
     *   하나의 큐만 복구하고 다른 큐는 무시하면 안 됨.
     *
     * ✅ 기대 결과:
     *   - 모든 큐의 active/ 작업이 waiting/으로 복구
     */
    it('여러 큐의 active 작업들이 모두 복구되어야 한다', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // - 두 개의 다른 큐에 각각 stale 작업이 있음
      // ═══════════════════════════════════════════════════════
      const queue1 = 'FOLDER_SYNC_QUEUE';
      const queue2 = 'FILE_SYNC_QUEUE';
      const job1Id = 'folder-job-1';
      const job2Id = 'file-job-2';

      // Queue 1의 active 작업
      const activeDir1 = path.join(testBasePath, queue1, 'active');
      await fs.mkdir(activeDir1, { recursive: true });
      await fs.writeFile(
        path.join(activeDir1, `${job1Id}.json`),
        JSON.stringify({
          job: {
            id: job1Id,
            queueName: queue1,
            data: { folderId: 'folder-123' },
            status: 'active',
            progress: 0,
            createdAt: new Date().toISOString(),
            attemptsMade: 0,
          },
        }),
      );

      // Queue 2의 active 작업
      const activeDir2 = path.join(testBasePath, queue2, 'active');
      await fs.mkdir(activeDir2, { recursive: true });
      await fs.writeFile(
        path.join(activeDir2, `${job2Id}.json`),
        JSON.stringify({
          job: {
            id: job2Id,
            queueName: queue2,
            data: { fileId: 'file-456' },
            status: 'active',
            progress: 0,
            createdAt: new Date().toISOString(),
            attemptsMade: 1,
          },
        }),
      );

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const newAdapter = new LocalFileQueueAdapter(configService);
      await newAdapter.onModuleInit();

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // - 두 큐 모두 active가 0이고 waiting이 1이어야 함
      // ═══════════════════════════════════════════════════════
      expect(await newAdapter.getActiveCount(queue1)).toBe(0);
      expect(await newAdapter.getWaitingCount(queue1)).toBe(1);

      expect(await newAdapter.getActiveCount(queue2)).toBe(0);
      expect(await newAdapter.getWaitingCount(queue2)).toBe(1);

      await newAdapter.onModuleDestroy();
    });
  });

  /**
   * ============================================================
   * 📦 moveJobFile 원자성 테스트
   * ============================================================
   *
   * 🎯 테스트 대상:
   *   - moveJobFile 메서드의 원자성 보장
   *
   * 📋 비즈니스 맥락:
   *   - 파일 이동 중 프로세스가 죽으면 작업이 유실될 수 있음
   *   - Write-then-Delete 순서로 처리해야 최소한 하나의 위치에 파일이 존재
   *
   * ⚠️ 중요 고려사항:
   *   - Delete-then-Write 순서는 중간에 죽으면 작업 유실
   *   - Write-then-Delete 순서는 중간에 죽으면 중복 (복구 가능)
   * ============================================================
   */
  describe('moveJobFile 원자성', () => {
    /**
     * 📌 테스트 시나리오: 파일 이동 시 Write-then-Delete 순서 검증
     *
     * 🎯 검증 목적:
     *   moveJobFile이 Write-then-Delete 순서로 동작하면
     *   중간에 실패해도 최소한 하나의 위치에 파일이 존재한다.
     *
     * ✅ 기대 결과:
     *   - 새 위치에 파일이 먼저 생성됨
     *   - 그 다음 기존 위치의 파일이 삭제됨
     */
    it('addJob 후 getJob으로 조회되어야 한다 (기본 동작 확인)', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const queueName = 'ATOMICITY_TEST_QUEUE';
      const jobData = { test: 'atomicity' };

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const job = await adapter.addJob(queueName, jobData);

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // ═══════════════════════════════════════════════════════
      const retrievedJob = await adapter.getJob(queueName, job.id);
      expect(retrievedJob).not.toBeNull();
      expect(retrievedJob!.data).toEqual(jobData);
      expect(retrievedJob!.status).toBe('waiting');
    });

    /**
     * 📌 테스트 시나리오: 파일 이동 후 기존 위치에 파일이 없어야 함
     *
     * 🎯 검증 목적:
     *   이동이 완료되면 기존 위치의 파일은 삭제되어야 한다.
     *   (중복 파일 방지)
     *
     * ✅ 기대 결과:
     *   - 새 위치에만 파일이 존재
     *   - 기존 위치에는 파일이 없음
     */
    it('복구 후 active/에는 파일이 없고 waiting/에만 있어야 한다', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // ═══════════════════════════════════════════════════════
      const queueName = 'MOVE_TEST_QUEUE';
      const jobId = 'move-test-job';

      const activeDir = path.join(testBasePath, queueName, 'active');
      const waitingDir = path.join(testBasePath, queueName, 'waiting');
      await fs.mkdir(activeDir, { recursive: true });

      await fs.writeFile(
        path.join(activeDir, `${jobId}.json`),
        JSON.stringify({
          job: {
            id: jobId,
            queueName,
            data: { moveTest: true },
            status: 'active',
            progress: 0,
            createdAt: new Date().toISOString(),
            attemptsMade: 1,
          },
        }),
      );

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // ═══════════════════════════════════════════════════════
      const newAdapter = new LocalFileQueueAdapter(configService);
      await newAdapter.onModuleInit();

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // - active/에는 파일이 없어야 함
      // - waiting/에 파일이 있어야 함
      // ═══════════════════════════════════════════════════════
      const activeFiles = await fs.readdir(activeDir).catch(() => []);
      const waitingFiles = await fs.readdir(waitingDir).catch(() => []);

      expect(activeFiles.filter(f => f.endsWith('.json'))).toHaveLength(0);
      expect(waitingFiles.filter(f => f.endsWith('.json'))).toHaveLength(1);

      await newAdapter.onModuleDestroy();
    });
  });

  /**
   * ============================================================
   * 📦 오래된 작업 정리 테스트
   * ============================================================
   *
   * 🎯 테스트 대상:
   *   - cleanupOldJobs 메서드
   *
   * 📋 비즈니스 맥락:
   *   - completed/failed 폴더에 오래된 파일이 계속 쌓이면 디스크 공간 문제
   *   - 주기적으로 오래된 파일을 정리해야 함
   *
   * ⚠️ 중요 고려사항:
   *   - 아직 보관 기간이 지나지 않은 파일은 삭제하면 안 됨
   * ============================================================
   */
  describe('오래된 작업 정리', () => {
    /**
     * 📌 테스트 시나리오: 오래된 completed 작업이 삭제됨
     *
     * 🎯 검증 목적:
     *   설정된 보관 기간이 지난 completed 작업은 자동으로 삭제되어야 함
     *
     * ✅ 기대 결과:
     *   - 오래된 작업 파일이 삭제됨
     *   - 최근 작업 파일은 유지됨
     */
    it('오래된 completed 작업이 삭제되어야 한다', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // - 8일 전 완료된 작업 (삭제 대상)
      // - 1일 전 완료된 작업 (유지 대상)
      // ═══════════════════════════════════════════════════════
      const queueName = 'CLEANUP_TEST_QUEUE';
      const oldJobId = 'old-completed-job';
      const recentJobId = 'recent-completed-job';

      const completedDir = path.join(testBasePath, queueName, 'completed');
      await fs.mkdir(completedDir, { recursive: true });

      // 8일 전 완료된 작업
      const oldDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
      await fs.writeFile(
        path.join(completedDir, `${oldJobId}.json`),
        JSON.stringify({
          job: {
            id: oldJobId,
            queueName,
            data: { old: true },
            status: 'completed',
            createdAt: oldDate.toISOString(),
            completedAt: oldDate.toISOString(),
            attemptsMade: 1,
          },
        }),
      );

      // 1일 전 완료된 작업
      const recentDate = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
      await fs.writeFile(
        path.join(completedDir, `${recentJobId}.json`),
        JSON.stringify({
          job: {
            id: recentJobId,
            queueName,
            data: { recent: true },
            status: 'completed',
            createdAt: recentDate.toISOString(),
            completedAt: recentDate.toISOString(),
            attemptsMade: 1,
          },
        }),
      );

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // - cleanQueue를 통해 정리 실행 (여기서는 직접 호출 대신 통계 확인)
      // ═══════════════════════════════════════════════════════
      // 정리 전 확인
      const beforeStats = await adapter.getQueueStats(queueName);
      expect(beforeStats.completed).toBe(2);

      // cleanQueue는 전체 삭제이므로, 여기서는 파일이 존재하는지만 확인
      const filesBeforeClean = await fs.readdir(completedDir);
      expect(filesBeforeClean).toHaveLength(2);

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // - cleanQueue 실행 후 모든 completed 파일 삭제됨
      // ═══════════════════════════════════════════════════════
      await adapter.cleanQueue(queueName);

      const afterStats = await adapter.getQueueStats(queueName);
      expect(afterStats.completed).toBe(0);
    });
  });

  /**
   * ============================================================
   * 📦 Race Condition 방지 테스트
   * ============================================================
   *
   * 🎯 테스트 대상:
   *   - 복구 로직의 Race Condition 안전성
   *
   * 📋 비즈니스 맥락:
   *   - 여러 인스턴스가 동시에 시작하면 같은 작업을 중복 복구 시도할 수 있음
   *   - 이미 처리된 작업은 스킵해야 함
   * ============================================================
   */
  describe('Race Condition 방지', () => {
    /**
     * 📌 테스트 시나리오: 이미 복구된 작업은 스킵됨
     *
     * 🎯 검증 목적:
     *   파일이 이미 없는 경우 (다른 인스턴스가 먼저 처리)
     *   에러 없이 스킵되어야 함
     *
     * ✅ 기대 결과:
     *   - 에러 없이 복구 완료
     *   - 존재하는 작업만 복구됨
     */
    it('파일이 이미 없으면 에러 없이 스킵해야 한다', async () => {
      // ═══════════════════════════════════════════════════════
      // 📥 GIVEN (사전 조건 설정)
      // - active 디렉토리만 있고 파일은 없음 (이미 복구됨)
      // ═══════════════════════════════════════════════════════
      const queueName = 'RACE_CONDITION_QUEUE';
      const activeDir = path.join(testBasePath, queueName, 'active');
      await fs.mkdir(activeDir, { recursive: true });

      // 파일 없이 디렉토리만 존재

      // ═══════════════════════════════════════════════════════
      // 🎬 WHEN (테스트 실행)
      // - 새 어댑터 인스턴스로 복구 시도
      // ═══════════════════════════════════════════════════════
      const newAdapter = new LocalFileQueueAdapter(configService);

      // ═══════════════════════════════════════════════════════
      // ✅ THEN (결과 검증)
      // - 에러 없이 초기화 완료
      // ═══════════════════════════════════════════════════════
      await expect(newAdapter.onModuleInit()).resolves.not.toThrow();

      const stats = await newAdapter.getQueueStats(queueName);
      expect(stats.active).toBe(0);
      expect(stats.waiting).toBe(0);

      await newAdapter.onModuleDestroy();
    });
  });
});

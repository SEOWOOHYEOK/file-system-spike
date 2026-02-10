/**
 * EventDescriptionBuilder 테스트
 *
 * FILE_UPLOAD 감사 로그 설명이 단일/다중 파일 모두 올바르게 생성되는지 검증
 */

import { EventDescriptionBuilder } from './description-builder';
import { AuditAction } from '../enums/audit-action.enum';
import { LogResult, UserType } from '../enums/common.enum';

describe('EventDescriptionBuilder.forAuditLog - FILE_UPLOAD', () => {
  const baseParams = {
    action: AuditAction.FILE_UPLOAD,
    actorName: '김철수',
    actorType: UserType.INTERNAL,
    result: LogResult.SUCCESS,
  };

  it('단일 파일 업로드: 파일명과 크기를 포함해야 함', () => {
    const result = EventDescriptionBuilder.forAuditLog({
      ...baseParams,
      targetName: 'report.pdf',
      metadata: { size: 2048576 },
    });

    expect(result).toContain('김철수');
    expect(result).toContain('report.pdf');
    expect(result).toContain('2.0MB');
    expect(result).toContain('업로드');
  });

  it('단일 파일 업로드: size가 없으면 크기 표시 없이 생성해야 함', () => {
    const result = EventDescriptionBuilder.forAuditLog({
      ...baseParams,
      targetName: 'report.pdf',
      metadata: {},
    });

    expect(result).toContain('report.pdf');
    expect(result).toContain('업로드');
    expect(result).not.toContain('MB');
    expect(result).not.toContain('KB');
  });

  it('다중 파일 업로드: fileCount가 2 이상이면 건수와 총 크기를 표시해야 함', () => {
    const result = EventDescriptionBuilder.forAuditLog({
      ...baseParams,
      targetName: 'doc1.pdf 외 2건',
      metadata: { size: 5120, fileCount: 3 },
    });

    expect(result).toContain('김철수');
    expect(result).toContain('doc1.pdf 외 2건');
    expect(result).toContain('5.0KB');
    expect(result).toContain('업로드');
  });

  it('다중 파일 업로드: fileCount=1이면 단일 파일과 동일하게 표시해야 함', () => {
    const result = EventDescriptionBuilder.forAuditLog({
      ...baseParams,
      targetName: '7777.txt',
      metadata: { size: 62, fileCount: 1 },
    });

    expect(result).toContain('7777.txt');
    expect(result).toContain('62B');
    expect(result).toContain('업로드');
  });

  it('실패 시 실패 사유를 포함해야 함', () => {
    const result = EventDescriptionBuilder.forAuditLog({
      ...baseParams,
      targetName: 'report.pdf',
      result: LogResult.FAIL,
      failReason: '용량 초과',
      errorCode: 'FILE_TOO_LARGE',
      metadata: { size: 200000000 },
    });

    expect(result).toContain('실패');
    expect(result).toContain('용량 초과');
    expect(result).toContain('FILE_TOO_LARGE');
  });
});

describe('EventDescriptionBuilder.formatBytes', () => {
  it('0B', () => expect(EventDescriptionBuilder.formatBytes(0)).toBe('0B'));
  it('500B', () => expect(EventDescriptionBuilder.formatBytes(500)).toBe('500B'));
  it('1.0KB', () => expect(EventDescriptionBuilder.formatBytes(1024)).toBe('1.0KB'));
  it('1.5MB', () => expect(EventDescriptionBuilder.formatBytes(1572864)).toBe('1.5MB'));
  it('2.0GB', () => expect(EventDescriptionBuilder.formatBytes(2147483648)).toBe('2.0GB'));
});

import { buildPath, extractName, extractParentPath, isValidPath } from './path.util';

/**
 * 경로 유틸리티 테스트
 *
 * 주요 테스트 시나리오:
 * 1. 루트 폴더로 이동 시 이중 슬래시(//) 방지
 * 2. 일반 폴더 경로 결합
 * 3. 경로에서 이름/부모 경로 추출
 * 4. 경로 유효성 검증
 */
describe('Path Utilities', () => {
  describe('buildPath - 경로 결합', () => {
    describe('루트 폴더 처리 (이중 슬래시 방지)', () => {
      it('루트 폴더("/")에 폴더 추가 시 "/폴더명" 형식이어야 한다', () => {
        const result = buildPath('/', 'myFolder');
        expect(result).toBe('/myFolder');
        expect(result).not.toBe('//myFolder'); // 이중 슬래시 방지 확인
      });

      it('루트 폴더에 한글 폴더명 추가 시 정상 동작해야 한다', () => {
        const result = buildPath('/', '1-1폴더-222');
        expect(result).toBe('/1-1폴더-222');
        expect(result).not.toContain('//');
      });

      it('루트 폴더에 파일명 추가 시 정상 동작해야 한다', () => {
        const result = buildPath('/', 'document.pdf');
        expect(result).toBe('/document.pdf');
      });

      it('빈 문자열 parentPath도 루트로 처리해야 한다', () => {
        const result = buildPath('', 'folder');
        expect(result).toBe('/folder');
      });
    });

    describe('일반 폴더 경로 결합', () => {
      it('1단계 폴더에 추가', () => {
        const result = buildPath('/parent', 'child');
        expect(result).toBe('/parent/child');
      });

      it('다단계 폴더에 추가', () => {
        const result = buildPath('/a/b/c', 'd');
        expect(result).toBe('/a/b/c/d');
      });

      it('한글 경로에 한글 폴더 추가', () => {
        const result = buildPath('/1번폴더', '1-1폴더');
        expect(result).toBe('/1번폴더/1-1폴더');
      });

      it('깊은 중첩 경로에 파일 추가', () => {
        const result = buildPath('/documents/2024/reports', 'final-report.docx');
        expect(result).toBe('/documents/2024/reports/final-report.docx');
      });
    });

    describe('경계 케이스', () => {
      it('특수 문자가 포함된 이름 처리', () => {
        const result = buildPath('/folder', 'file (1).txt');
        expect(result).toBe('/folder/file (1).txt');
      });

      it('공백이 포함된 폴더명 처리', () => {
        const result = buildPath('/my folder', 'sub folder');
        expect(result).toBe('/my folder/sub folder');
      });
    });
  });

  describe('extractName - 경로에서 이름 추출', () => {
    it('일반 파일 경로에서 파일명 추출', () => {
      expect(extractName('/folder1/folder2/file.txt')).toBe('file.txt');
    });

    it('1단계 경로에서 이름 추출', () => {
      expect(extractName('/singleFolder')).toBe('singleFolder');
    });

    it('루트 경로는 빈 문자열 반환', () => {
      expect(extractName('/')).toBe('');
    });

    it('빈 문자열 입력 시 빈 문자열 반환', () => {
      expect(extractName('')).toBe('');
    });

    it('한글 경로에서 이름 추출', () => {
      expect(extractName('/1번폴더/1-1폴더-222')).toBe('1-1폴더-222');
    });
  });

  describe('extractParentPath - 부모 경로 추출', () => {
    it('깊은 경로에서 부모 경로 추출', () => {
      expect(extractParentPath('/folder1/folder2/file.txt')).toBe('/folder1/folder2');
    });

    it('1단계 경로의 부모는 루트', () => {
      expect(extractParentPath('/singleFolder')).toBe('/');
    });

    it('루트 경로의 부모는 null', () => {
      expect(extractParentPath('/')).toBeNull();
    });

    it('빈 문자열의 부모는 null', () => {
      expect(extractParentPath('')).toBeNull();
    });

    it('한글 경로에서 부모 추출', () => {
      expect(extractParentPath('/1번폴더/1-1폴더-222')).toBe('/1번폴더');
    });
  });

  describe('isValidPath - 경로 유효성 검증', () => {
    describe('유효한 경로', () => {
      it('루트 경로는 유효', () => {
        expect(isValidPath('/')).toBe(true);
      });

      it('일반 경로는 유효', () => {
        expect(isValidPath('/folder/file.txt')).toBe(true);
      });

      it('1단계 경로는 유효', () => {
        expect(isValidPath('/folder')).toBe(true);
      });

      it('깊은 경로는 유효', () => {
        expect(isValidPath('/a/b/c/d/e')).toBe(true);
      });

      it('한글 경로는 유효', () => {
        expect(isValidPath('/1번폴더/1-1폴더-222')).toBe(true);
      });
    });

    describe('유효하지 않은 경로 (버그 방지)', () => {
      it('이중 슬래시는 유효하지 않음 - 루트 이동 버그 감지용', () => {
        expect(isValidPath('//folder')).toBe(false);
      });

      it('중간에 이중 슬래시는 유효하지 않음', () => {
        expect(isValidPath('/folder//subfolder')).toBe(false);
      });

      it('슬래시로 시작하지 않으면 유효하지 않음', () => {
        expect(isValidPath('folder/file.txt')).toBe(false);
      });

      it('슬래시로 끝나면 유효하지 않음 (루트 제외)', () => {
        expect(isValidPath('/folder/')).toBe(false);
      });

      it('빈 문자열은 유효하지 않음', () => {
        expect(isValidPath('')).toBe(false);
      });
    });
  });

  describe('통합 시나리오 테스트', () => {
    it('폴더 이동 시나리오: 하위 폴더에서 루트로 이동', () => {
      // 원래 경로: /1번폴더/1-1폴더-222
      // 루트로 이동 시
      const targetParentPath = '/';
      const folderName = '1-1폴더-222';

      const newPath = buildPath(targetParentPath, folderName);

      expect(newPath).toBe('/1-1폴더-222');
      expect(isValidPath(newPath)).toBe(true);
      expect(newPath).not.toBe('//1-1폴더-222'); // 버그 케이스
    });

    it('폴더 이동 시나리오: 다른 폴더로 이동', () => {
      const targetParentPath = '/2번폴더';
      const folderName = '1-1폴더-222';

      const newPath = buildPath(targetParentPath, folderName);

      expect(newPath).toBe('/2번폴더/1-1폴더-222');
      expect(isValidPath(newPath)).toBe(true);
    });

    it('경로 분해 후 재조립 시 동일해야 함', () => {
      const originalPath = '/parent/child/grandchild';

      const name = extractName(originalPath);
      const parentPath = extractParentPath(originalPath);

      expect(name).toBe('grandchild');
      expect(parentPath).toBe('/parent/child');

      const rebuiltPath = buildPath(parentPath!, name);
      expect(rebuiltPath).toBe(originalPath);
    });
  });
});

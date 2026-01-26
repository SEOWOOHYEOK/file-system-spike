# NAS File Handler 동작 및 이론 정리

대상 파일: `appServer/src/infra/storage/nas/internal/nas-file.handler.ts`

## 핵심 개념
- **같은 드라이브/볼륨에서의 `fs.rename`**: 파일 내용은 그대로 두고 디렉터리 엔트리(메타데이터)만 새로운 경로로 갱신. 내용 재기록 없음 → 빠름.
- **다른 드라이브(`EXDEV`) 이동**: `copyFile`로 전체 내용을 복사한 뒤 `unlink`로 원본 경로를 끊음 → 내용 복사 비용이 큼.
- **`unlink`**: 경로를 제거하고 링크 카운트를 감소시킴. 링크 카운트가 0이 되고 열린 핸들이 모두 닫히면 커널이 할당 블록을 해제. 내용 재기록 없음.
- **`stat`/`access`/`readdir`**: 메타데이터 조회 수준의 I/O로 내용 읽기 없음.

## 기능별 동작 방식

| 메서드 | 주요 호출 | 동작 요약 | I/O 특성 |
| --- | --- | --- | --- |
| `upload` | `fs.writeFile` | 버퍼를 새 파일로 기록. 부모 디렉터리 없으면 생성. | 파일 크기만큼 **쓰기 I/O** |
| `download` | `fs.readFile` | 파일 전체를 메모리로 읽어 스트림 반환. | 파일 크기만큼 **읽기 I/O** |
| `move` | `fs.rename` → (예외 시) `copyFile`+`unlink` | 같은 볼륨: 메타데이터만 수정. 다른 볼륨: 내용 복사 후 원본 경로 제거. | 같은 볼륨: 메타데이터; 다른 볼륨: **읽기+쓰기 I/O** |
| `rename` | `fs.rename` | 동일 디렉터리 내 이름 변경. 메타데이터만 수정. | 메타데이터 |
| `delete` | `fs.unlink` | 경로 제거, 링크 카운트 0이면 핸들 닫힘 시 블록 해제. | 메타데이터 |
| `list` | `fs.readdir` + `fs.stat` | 디렉터리 엔트리와 각 항목 메타데이터 조회. | 메타데이터 |
| `getInfo` | `fs.stat` | 단일 파일 메타데이터 조회. | 메타데이터 |
| `exists` | `fs.access` | 존재 여부 검사. | 메타데이터 |
| `calculateHash` | `fs.readFile` | 전체 파일을 읽어 SHA-256 계산. | 파일 크기만큼 **읽기 I/O** |
| `getReadStream` | `fs.createReadStream` | 스트리밍 읽기. 총 I/O는 파일 크기만큼, 메모리 부담은 적음. | **읽기 I/O** |
| `getWriteStream` | `fs.createWriteStream` | 스트리밍 쓰기. 총 I/O는 파일 크기만큼, 백프레셔 지원. | **쓰기 I/O** |

## 흐름 도식

### 동일 볼륨 이동/이름 변경 (`fs.rename`)
```
[디렉터리 엔트리 업데이트]
old path --> new path
(파일 내용은 이동/복사 없음)
```

### 다른 볼륨 이동 (EXDEV)
```
source 파일 전체 읽기 --> dest에 전체 쓰기 --> source 경로 unlink
```

### 삭제 (`unlink`)
```
경로 삭제 -> 링크 카운트 0?
  └─ 아니오: 다른 하드링크/열린 핸들 존재 → 파일 유지
  └─ 예: 열린 핸들 모두 닫히는 시점에 커널이 블록 해제
```

## 성능/비용 관점 (일반적인 경우)
- **비용 높음**: `upload`, `download`, `calculateHash`, 스트림 기반 대용량 읽기/쓰기(총 I/O는 동일).
- **중간/낮음**: `list`, `getInfo`, `exists`(메타데이터 조회).
- **매우 낮음**: 동일 볼륨 `move`/`rename`, `delete`(`unlink`) — 메타데이터 수준 작업.

## 주의점
- 다른 볼륨 간 이동 시 전체 복사 비용이 발생하므로 대용량 파일은 시간이 오래 걸릴 수 있음.
- `unlink` 후에도 다른 프로세스가 파일을 열어두면 핸들이 닫힐 때까지 디스크 블록은 잠시 유지될 수 있으나, 경로로는 접근 불가.
- `download`/`calculateHash`는 전체 파일을 메모리에 올리므로 대용량 시 스트리밍 방식으로 대체를 고려.

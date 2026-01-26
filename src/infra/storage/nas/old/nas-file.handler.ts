// import {
//   Injectable,
//   Logger,
//   NotFoundException,
//   InternalServerErrorException,
// } from '@nestjs/common';
// import * as fs from 'fs/promises';
// import * as fsSync from 'fs';
// import * as path from 'path';
// import * as crypto from 'crypto';
// import { Readable } from 'stream';
// import { NasClientProvider } from './nas-client.provider';
// import {
//   IFileHandler,
//   FileUploadResult,
//   FileDownloadResult,
//   FileInfoResult,
//   FileListItemResult,
//   MultiUploadItemType,
//   MultiUploadResultType,
//   MultiDeleteResultType,
// } from '../../interfaces/file-handler.interface';

// /**
//  * NAS 파일 핸들러
//  * - IFileHandler 인터페이스 구현
//  * - 파일 CRUD 작업
//  */
// @Injectable()
// export class NasFileHandler implements IFileHandler {
//   private readonly logger = new Logger(NasFileHandler.name);

//   constructor(private readonly clientProvider: NasClientProvider) {}

//   /**
//    * 파일 업로드 (저장)
//    */
//   async upload(key: string, body: Buffer, contentType: string): Promise<FileUploadResult> {
//     const fullPath = this.clientProvider.validateAndCreatePath(key);

//     // 부모 디렉토리가 없으면 생성
//     const parentDir = path.dirname(fullPath);
//     try {
//       await fs.access(parentDir);
//     } catch {
//       await fs.mkdir(parentDir, { recursive: true });
//       this.logger.debug(`📁 부모 디렉토리 생성: ${parentDir}`);
//     }

//     try {
//       await fs.writeFile(fullPath, body);
//       this.logger.debug(`📝 파일 저장 완료: ${key} (${body.length} bytes)`);
//       return { key, size: body.length };
//     } catch (error) {
//       throw new InternalServerErrorException(`파일 저장 실패: ${error.message}`);
//     }
//   }

//   /**
//    * 파일 다운로드
//    */
//   async download(key: string): Promise<FileDownloadResult> {
//     const fullPath = this.clientProvider.validateAndCreatePath(key);

//     try {
//       const content = await fs.readFile(fullPath);
//       const stats = await fs.stat(fullPath);
//       const stream = Readable.from(content);

//       // 확장자로 contentType 추정
//       const ext = path.extname(key).toLowerCase();
//       const mimeTypes: Record<string, string> = {
//         '.txt': 'text/plain',
//         '.json': 'application/json',
//         '.html': 'text/html',
//         '.css': 'text/css',
//         '.js': 'application/javascript',
//         '.png': 'image/png',
//         '.jpg': 'image/jpeg',
//         '.jpeg': 'image/jpeg',
//         '.gif': 'image/gif',
//         '.pdf': 'application/pdf',
//         '.zip': 'application/zip',
//       };

//       return {
//         stream,
//         contentType: mimeTypes[ext] || 'application/octet-stream',
//         contentLength: stats.size,
//         filename: path.basename(key),
//       };
//     } catch (error) {
//       if (error.code === 'ENOENT') {
//         throw new NotFoundException(`파일을 찾을 수 없습니다: ${key}`);
//       }
//       throw new InternalServerErrorException(`파일 읽기 실패: ${error.message}`);
//     }
//   }

//   /**
//    * 파일 삭제
//    */
//   async delete(key: string): Promise<void> {
//     const fullPath = this.clientProvider.validateAndCreatePath(key);

//     try {
//       await fs.access(fullPath);
//     } catch {
//       throw new NotFoundException(`파일을 찾을 수 없습니다: ${key}`);
//     }

//     try {
//       await fs.unlink(fullPath);
//       this.logger.log(`🗑️ 파일 삭제 완료: ${fullPath}`);
//     } catch (error) {
//       throw new InternalServerErrorException(`삭제 실패: ${error.message}`);
//     }
//   }

//   /**
//    * 파일 이동
//    */
//   async move(sourceKey: string, destinationKey: string): Promise<void> {
//     const sourceFullPath = this.clientProvider.validateAndCreatePath(sourceKey);
//     const destFullPath = this.clientProvider.validateAndCreatePath(destinationKey);

//     try {
//       await fs.access(sourceFullPath);
//     } catch {
//       throw new NotFoundException(`원본 파일을 찾을 수 없습니다: ${sourceKey}`);
//     }

//     // 대상 디렉토리 생성
//     const destDir = path.dirname(destFullPath);
//     await fs.mkdir(destDir, { recursive: true });

//     try {
//       await fs.rename(sourceFullPath, destFullPath);
//       this.logger.log(`📁 Moved: ${sourceKey} → ${destinationKey}`);
//     } catch (error) {
//       //드라이브 다른경우 생기는 에러
//       if (error.code === 'EXDEV') {
//         // 다른 드라이브 간 이동
//         await fs.copyFile(sourceFullPath, destFullPath);
//         await fs.unlink(sourceFullPath);
//         this.logger.log(`📁 Moved (cross-device): ${sourceKey} → ${destinationKey}`);
//       } else {
//         throw new InternalServerErrorException(`이동 실패: ${error.message}`);
//       }
//     }
//   }

//   /**
//    * 파일 이름 변경
//    */
//   async rename(key: string, newName: string): Promise<string> {
//     const sourceFullPath = this.clientProvider.validateAndCreatePath(key);

//     try {
//       await fs.access(sourceFullPath);
//     } catch {
//       throw new NotFoundException(`파일을 찾을 수 없습니다: ${key}`);
//     }

//     // 새 경로 생성 (같은 디렉토리 내에서 이름만 변경)
//     const parentDir = path.dirname(key);
//     const newKey = parentDir ? `${parentDir}/${newName}` : newName;
//     const destFullPath = this.clientProvider.validateAndCreatePath(newKey);

//     // 대상 파일이 이미 존재하는지 확인
//     try {
//       await fs.access(destFullPath);
//       throw new InternalServerErrorException(`동일한 이름의 파일이 이미 존재합니다: ${newName}`);
//     } catch (error) {
//       if (error.code !== 'ENOENT') {
//         throw error;
//       }
//       // ENOENT는 파일이 없다는 뜻이므로 정상 진행
//     }

//     try {
//       await fs.rename(sourceFullPath, destFullPath);
//       this.logger.log(`✏️ Renamed: ${key} → ${newKey}`);
//       return newKey;
//     } catch (error) {
//       throw new InternalServerErrorException(`이름 변경 실패: ${error.message}`);
//     }
//   }

//   /**
//    * 파일 정보 조회
//    */
//   async getInfo(key: string): Promise<FileInfoResult> {
//     const fullPath = this.clientProvider.validateAndCreatePath(key);

//     try {
//       const stats = await fs.stat(fullPath);
//       const ext = path.extname(key).toLowerCase();

//       return {
//         contentType: this.getMimeType(ext),
//         contentLength: stats.size,
//         createdAt: stats.birthtime,
//         lastModified: stats.mtime,
//       };
//     } catch (error) {
//       if (error.code === 'ENOENT') {
//         throw new NotFoundException(`파일을 찾을 수 없습니다: ${key}`);
//       }
//       throw new InternalServerErrorException(`정보 조회 실패: ${error.message}`);
//     }
//   }

//   /**
//    * 파일 목록 조회
//    */
//   async list(prefix?: string): Promise<FileListItemResult[]> {
//     const fullPath = this.clientProvider.validateAndCreatePath(prefix || '');

//     try {
//       const entries = await fs.readdir(fullPath, { withFileTypes: true });
//       const items: FileListItemResult[] = [];

//       for (const entry of entries) {
//         const entryPath = path.join(fullPath, entry.name);
//         try {
//           const stats = await fs.stat(entryPath);
//           const relativePath = this.clientProvider.createRelativePath(entryPath);
//           const fileType = entry.isFile() && entry.name.includes('.')
//             ? entry.name.split('.').pop()!
//             : null;

//           items.push({
//             key: relativePath,
//             fileName: entry.name,
//             fileType,
//             size: stats.size,
//             lastModified: stats.mtime,
//             type: entry.isDirectory() ? 'directory' : 'file',
//           });
//         } catch {
//           this.logger.warn(`⚠️ 파일 정보 조회 실패: ${entryPath}`);
//         }
//       }

//       // 디렉토리 먼저, 그 다음 파일 (이름순 정렬)
//       items.sort((a, b) => {
//         if (a.type !== b.type) {
//           return a.type === 'directory' ? -1 : 1;
//         }
//         return a.fileName.localeCompare(b.fileName);
//       });

//       return items;
//     } catch (error) {
//       if (error.code === 'ENOENT') {
//         throw new NotFoundException(`디렉토리를 찾을 수 없습니다: ${prefix}`);
//       }
//       throw new InternalServerErrorException(`목록 조회 실패: ${error.message}`);
//     }
//   }

//   /**
//    * 멀티 파일 업로드
//    */
//   async uploadMultiple(items: MultiUploadItemType[]): Promise<MultiUploadResultType> {
//     const results: MultiUploadResultType = {
//       success: [],
//       failed: [],
//     };

//     const uploadPromises = items.map(async (item) => {
//       try {
//         const result = await this.upload(item.key, item.body, item.contentType);
//         return { success: true, result };
//       } catch (error) {
//         return { success: false, key: item.key, error: error.message };
//       }
//     });

//     const uploadResults = await Promise.all(uploadPromises);

//     for (const result of uploadResults) {
//       if (result.success && 'result' in result) {
//         results.success.push(result.result!);
//       } else if ('key' in result && 'error' in result) {
//         results.failed.push({ key: result.key!, error: result.error! });
//       }
//     }

//     return results;
//   }

//   /**
//    * 멀티 파일 삭제
//    */
//   async deleteMultiple(keys: string[]): Promise<MultiDeleteResultType> {
//     const results: MultiDeleteResultType = {
//       success: [],
//       failed: [],
//       totalCount: keys.length,
//       successCount: 0,
//       failedCount: 0,
//     };

//     const deletePromises = keys.map(async (key) => {
//       try {
//         await this.delete(key);
//         return { success: true, key };
//       } catch (error) {
//         return { success: false, key, error: error.message };
//       }
//     });

//     const deleteResults = await Promise.all(deletePromises);

//     for (const result of deleteResults) {
//       if (result.success) {
//         results.success.push(result.key);
//         results.successCount++;
//       } else if ('error' in result) {
//         results.failed.push({ key: result.key, error: result.error! });
//         results.failedCount++;
//       }
//     }

//     return results;
//   }

//   // ==================== 추가 메서드 ====================

//   /**
//    * 파일 스트림 읽기 (대용량 파일용)
//    */
//   getReadStream(key: string): fsSync.ReadStream {
//     const fullPath = this.clientProvider.validateAndCreatePath(key);

//     if (!fsSync.existsSync(fullPath)) {
//       throw new NotFoundException(`파일을 찾을 수 없습니다: ${key}`);
//     }

//     return fsSync.createReadStream(fullPath);
//   }

//   /**
//    * 파일 스트리밍 다운로드 (메모리 효율적 - 전체 파일을 메모리에 로드하지 않음)
//    */
//   async downloadStream(key: string): Promise<FileDownloadResult> {
//     const fullPath = this.clientProvider.validateAndCreatePath(key);

//     try {
//       const stats = await fs.stat(fullPath);
      
//       // fs.createReadStream으로 진짜 스트리밍 (메모리에 전체 로드 안함)
//       const stream = fsSync.createReadStream(fullPath, {
//         highWaterMark: 64 * 1024, // 64KB 청크
//       });

//       const ext = path.extname(key).toLowerCase();

//       return {
//         stream,
//         contentType: this.getMimeType(ext),
//         contentLength: stats.size,
//         filename: path.basename(key),
//       };
//     } catch (error) {
//       if (error.code === 'ENOENT') {
//         throw new NotFoundException(`파일을 찾을 수 없습니다: ${key}`);
//       }
//       throw new InternalServerErrorException(`파일 읽기 실패: ${error.message}`);
//     }
//   }

//   /**
//    * 파일 Range 읽기 (멀티파트 병렬 전송용)
//    * @param key 파일 키
//    * @param start 시작 바이트 위치
//    * @param end 끝 바이트 위치 (포함)
//    */
//   async downloadRange(key: string, start: number, end: number): Promise<Buffer> {
//     const fullPath = this.clientProvider.validateAndCreatePath(key);

//     return new Promise((resolve, reject) => {
//       const chunks: Buffer[] = [];
//       const stream = fsSync.createReadStream(fullPath, { start, end });
      
//       stream.on('data', (chunk) => chunks.push(chunk as Buffer));
//       stream.on('end', () => resolve(Buffer.concat(chunks)));
//       stream.on('error', (error: NodeJS.ErrnoException) => {
//         if (error.code === 'ENOENT') {
//           reject(new NotFoundException(`파일을 찾을 수 없습니다: ${key}`));
//         } else {
//           reject(new InternalServerErrorException(`파일 읽기 실패: ${error.message}`));
//         }
//       });
//     });
//   }

//   /**
//    * 파일 크기 조회
//    */
//   async getFileSize(key: string): Promise<number> {
//     const fullPath = this.clientProvider.validateAndCreatePath(key);

//     try {
//       const stats = await fs.stat(fullPath);
//       return stats.size;
//     } catch (error) {
//       if (error.code === 'ENOENT') {
//         throw new NotFoundException(`파일을 찾을 수 없습니다: ${key}`);
//       }
//       throw new InternalServerErrorException(`파일 정보 조회 실패: ${error.message}`);
//     }
//   }

//   /**
//    * 파일 스트림 쓰기 (대용량 파일용)
//    * @param key 파일 키
//    * @param options 스트림 옵션 (highWaterMark 등)
//    */
//   getWriteStream(key: string, options?: { highWaterMark?: number }): fsSync.WriteStream {
//     const fullPath = this.clientProvider.validateAndCreatePath(key);

//     // 부모 디렉토리 생성
//     const parentDir = path.dirname(fullPath);
//     if (!fsSync.existsSync(parentDir)) {
//       fsSync.mkdirSync(parentDir, { recursive: true });
//     }

//     // 대용량 파일 최적화: 기본 highWaterMark = 4MB (기본값 64KB 대비 64배)
//     const highWaterMark = options?.highWaterMark || 4 * 1024 * 1024;

//     return fsSync.createWriteStream(fullPath, { highWaterMark });
//   }

//   /**
//    * 파일 해시 계산 (SHA-256)
//    */
//   async calculateHash(key: string): Promise<string> {
//     const fullPath = this.clientProvider.validateAndCreatePath(key);

//     try {
//       const content = await fs.readFile(fullPath);
//       return crypto.createHash('sha256').update(content).digest('hex');
//     } catch (error) {
//       if (error.code === 'ENOENT') {
//         throw new NotFoundException(`파일을 찾을 수 없습니다: ${key}`);
//       }
//       throw new InternalServerErrorException(`해시 계산 실패: ${error.message}`);
//     }
//   }

//   /**
//    * 파일 존재 여부 확인
//    */
//   async exists(key: string): Promise<boolean> {
//     try {
//       const fullPath = this.clientProvider.validateAndCreatePath(key);
//       await fs.access(fullPath, fs.constants.F_OK);
//       return true;
//     } catch {
//       return false;
//     }
//   }

//   private getMimeType(ext: string): string {
//     const mimeTypes: Record<string, string> = {
//       '.txt': 'text/plain',
//       '.json': 'application/json',
//       '.html': 'text/html',
//       '.css': 'text/css',
//       '.js': 'application/javascript',
//       '.png': 'image/png',
//       '.jpg': 'image/jpeg',
//       '.jpeg': 'image/jpeg',
//       '.gif': 'image/gif',
//       '.pdf': 'application/pdf',
//       '.zip': 'application/zip',
//     };
//     return mimeTypes[ext] || 'application/octet-stream';
//   }
// }


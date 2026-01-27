import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TrashMetadataOrmEntity } from '../entities/trash-metadata.orm-entity';
import { FileOrmEntity } from '../entities/file.orm-entity';
import { FolderOrmEntity } from '../entities/folder.orm-entity';
import { ITrashQueryService, TrashItemType } from '../../../domain/trash';

@Injectable()
export class TrashQueryRepository implements ITrashQueryService {
  constructor(
    @InjectRepository(TrashMetadataOrmEntity)
    private readonly trashRepository: Repository<TrashMetadataOrmEntity>,
    @InjectRepository(FileOrmEntity)
    private readonly fileRepository: Repository<FileOrmEntity>,
    @InjectRepository(FolderOrmEntity)
    private readonly folderRepository: Repository<FolderOrmEntity>,
  ) {}

  async getTrashList(options?: {
    sortBy?: string;
    order?: 'asc' | 'desc';
    page?: number;
    limit?: number;
  }): Promise<{
    items: Array<{
      type: TrashItemType;
      id: string;
      name: string;
      sizeBytes?: number;
      mimeType?: string;
      trashMetadataId: string;
      originalPath: string;
      deletedAt: Date;
      deletedBy: string;
      modifiedAt: Date;
      expiresAt: Date;
    }>;
    totalCount: number;
    totalSizeBytes: number;
  }> {
    const qb = this.trashRepository.createQueryBuilder('trash');
    
    // Join with File and Folder
    qb.leftJoinAndMapOne('trash.file', FileOrmEntity, 'file', 'file.id = trash.fileId');
    qb.leftJoinAndMapOne('trash.folder', FolderOrmEntity, 'folder', 'folder.id = trash.folderId');

    // Sort
    const sortBy = options?.sortBy || 'deletedAt';
    const order: 'ASC' | 'DESC' = options?.order?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    
    // 정렬용 가상 컬럼 추가
    qb.addSelect('COALESCE(file.name, folder.name)', 'item_name');
    qb.addSelect('COALESCE(file.sizeBytes, 0)', 'item_size');
    qb.addSelect('COALESCE(file.updatedAt, folder.updatedAt)', 'item_modified_at');
    
    if (sortBy === 'name') {
       qb.orderBy('item_name', order);
    } else if (sortBy === 'sizeBytes') {
       qb.orderBy('item_size', order);
    } else if (sortBy === 'modifiedAt') {
       qb.orderBy('item_modified_at', order);
    } else if (sortBy === 'originalPath') {
       qb.orderBy('trash.originalPath', order);
    } else {
       // deletedAt (기본값)
       qb.orderBy('trash.deletedAt', order);
    }

    // Pagination
    if (options?.page && options?.limit) {
      qb.skip((options.page - 1) * options.limit);
      qb.take(options.limit);
    }

    const [orms, totalCount] = await qb.getManyAndCount();

    // Calculate total size
    const totalSizeResult = await this.trashRepository
      .createQueryBuilder('trash')
      .leftJoin(FileOrmEntity, 'file', 'file.id = trash.fileId')
      .select('SUM(file.sizeBytes)', 'totalSize')
      .where('trash.fileId IS NOT NULL')
      .getRawOne();
    
    const totalSizeBytes = Number(totalSizeResult?.totalSize || 0);

    const items = orms.map((orm: any) => {
      const isFile = !!orm.fileId;
      const file = orm.file;
      const folder = orm.folder;
      
      return {
        type: isFile ? TrashItemType.FILE : TrashItemType.FOLDER,
        id: isFile ? orm.fileId : orm.folderId,
        name: isFile ? file?.name : folder?.name,
        sizeBytes: isFile ? Number(file?.sizeBytes || 0) : undefined,
        mimeType: isFile ? file?.mimeType : undefined,
        trashMetadataId: orm.id,
        originalPath: orm.originalPath,
        deletedAt: orm.deletedAt,
        deletedBy: orm.deletedBy,
        modifiedAt: isFile ? file?.updatedAt : folder?.updatedAt, // Assuming updatedAt exists
        expiresAt: orm.expiresAt,
      };
    });

    return {
      items,
      totalCount,
      totalSizeBytes,
    };
  }


}

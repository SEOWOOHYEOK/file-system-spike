import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FileShareOrmEntity } from '../entities/file-share.orm-entity';
import { IFileShareRepository } from '../../../domain/share/repositories/file-share.repository.interface';
import { FileShare } from '../../../domain/share/entities/file-share.entity';
import { FileShareMapper } from '../mapper/file-share.mapper';

/**
 * FileShare Repository 구현체
 *
 * TypeORM을 사용한 FileShare 영속성 관리
 */
@Injectable()
export class FileShareRepository implements IFileShareRepository {
  constructor(
    @InjectRepository(FileShareOrmEntity)
    private readonly repo: Repository<FileShareOrmEntity>,
  ) {}

  async save(share: FileShare): Promise<FileShare> {
    const ormEntity = FileShareMapper.toOrm(share);
    const saved = await this.repo.save(ormEntity);
    return FileShareMapper.toDomain(saved);
  }

  async findById(id: string): Promise<FileShare | null> {
    const found = await this.repo.findOne({
      where: { id },
    });
    return found ? FileShareMapper.toDomain(found) : null;
  }

  async findByRecipient(recipientId: string): Promise<FileShare[]> {
    const found = await this.repo.find({
      where: { recipientId },
    });
    return found.map(FileShareMapper.toDomain);
  }

  async findByOwner(ownerId: string): Promise<FileShare[]> {
    const found = await this.repo.find({
      where: { ownerId },
    });
    return found.map(FileShareMapper.toDomain);
  }

  async findByFileId(fileId: string): Promise<FileShare[]> {
    const found = await this.repo.find({
      where: { fileId },
    });
    return found.map(FileShareMapper.toDomain);
  }

  async findByFileAndRecipient(
    fileId: string,
    recipientId: string,
  ): Promise<FileShare | null> {
    const found = await this.repo.findOne({
      where: { fileId, recipientId },
    });
    return found ? FileShareMapper.toDomain(found) : null;
  }

  async delete(id: string): Promise<void> {
    await this.repo.delete(id);
  }
}

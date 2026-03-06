import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Folder } from './folder.entity';

@Injectable()
export class FolderService {
  constructor(
    @InjectRepository(Folder) private folderRepo: Repository<Folder>,
  ) {}

  async create(tenantId: string, data: { name: string; parentId?: string }) {
    const folder = this.folderRepo.create({ tenantId, name: data.name, parentId: data.parentId });
    return this.folderRepo.save(folder);
  }

  async findAll(tenantId: string) {
    return this.folderRepo.find({
      where: { tenantId },
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
  }

  async findOne(tenantId: string, id: string) {
    const folder = await this.folderRepo.findOne({ where: { id, tenantId } });
    if (!folder) throw new NotFoundException('Folder not found');
    return folder;
  }

  async update(tenantId: string, id: string, data: Partial<Folder>) {
    const folder = await this.findOne(tenantId, id);
    Object.assign(folder, data);
    return this.folderRepo.save(folder);
  }

  async remove(tenantId: string, id: string) {
    const folder = await this.findOne(tenantId, id);
    await this.folderRepo.remove(folder);
  }
}

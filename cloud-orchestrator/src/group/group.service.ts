import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Group } from './group.entity';

@Injectable()
export class GroupService {
  constructor(
    @InjectRepository(Group) private groupRepo: Repository<Group>,
  ) {}

  async create(tenantId: string, data: Partial<Group>) {
    const group = this.groupRepo.create({ ...data, tenantId });
    return this.groupRepo.save(group);
  }

  async findAll(tenantId: string) {
    return this.groupRepo.find({
      where: { tenantId },
      order: { updatedAt: 'DESC' },
    });
  }

  async findOne(tenantId: string, id: string) {
    const group = await this.groupRepo.findOne({ where: { id, tenantId } });
    if (!group) throw new NotFoundException('Group not found');
    return group;
  }

  async update(tenantId: string, id: string, data: Partial<Group>) {
    const group = await this.findOne(tenantId, id);
    Object.assign(group, data);
    return this.groupRepo.save(group);
  }

  async remove(tenantId: string, id: string) {
    const group = await this.findOne(tenantId, id);
    await this.groupRepo.remove(group);
  }
}

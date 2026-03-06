import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TestDataProfile } from './test-data-profile.entity';

@Injectable()
export class TestDataService {
  constructor(
    @InjectRepository(TestDataProfile) private profileRepo: Repository<TestDataProfile>,
  ) {}

  async create(tenantId: string, data: Partial<TestDataProfile>) {
    const profile = this.profileRepo.create({ ...data, tenantId });
    return this.profileRepo.save(profile);
  }

  async findAll(tenantId: string) {
    return this.profileRepo.find({
      where: { tenantId },
      select: ['id', 'name', 'description', 'createdAt', 'updatedAt'],
      order: { updatedAt: 'DESC' },
    });
  }

  async findOne(tenantId: string, id: string) {
    const profile = await this.profileRepo.findOne({ where: { id, tenantId } });
    if (!profile) throw new NotFoundException('Test data profile not found');
    return profile;
  }

  async update(tenantId: string, id: string, data: Partial<TestDataProfile>) {
    const profile = await this.findOne(tenantId, id);
    Object.assign(profile, data);
    return this.profileRepo.save(profile);
  }

  async remove(tenantId: string, id: string) {
    const profile = await this.findOne(tenantId, id);
    await this.profileRepo.remove(profile);
  }
}

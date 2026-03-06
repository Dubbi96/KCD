import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthProfile } from './auth-profile.entity';

@Injectable()
export class AuthProfileService {
  constructor(
    @InjectRepository(AuthProfile) private profileRepo: Repository<AuthProfile>,
  ) {}

  async create(tenantId: string, data: Partial<AuthProfile>) {
    const profile = this.profileRepo.create({ ...data, tenantId });
    return this.profileRepo.save(profile);
  }

  async findAll(tenantId: string) {
    return this.profileRepo.find({
      where: { tenantId },
      select: ['id', 'name', 'domain', 'domainPatterns', 'createdAt', 'updatedAt'],
      order: { updatedAt: 'DESC' },
    });
  }

  async findOne(tenantId: string, id: string) {
    const profile = await this.profileRepo.findOne({ where: { id, tenantId } });
    if (!profile) throw new NotFoundException('Auth profile not found');
    return profile;
  }

  async update(tenantId: string, id: string, data: Partial<AuthProfile>) {
    const profile = await this.findOne(tenantId, id);
    Object.assign(profile, data);
    return this.profileRepo.save(profile);
  }

  async remove(tenantId: string, id: string) {
    const profile = await this.findOne(tenantId, id);
    await this.profileRepo.remove(profile);
  }
}

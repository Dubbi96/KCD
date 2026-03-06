import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Stream } from './stream.entity';
import { StreamItem } from './stream-item.entity';

const VALID_MODES = ['AUTO', 'HUMAN'];

@Injectable()
export class StreamService {
  constructor(
    @InjectRepository(Stream) private streamRepo: Repository<Stream>,
    @InjectRepository(StreamItem) private itemRepo: Repository<StreamItem>,
  ) {}

  async create(
    tenantId: string,
    data: { name: string; mode?: string; description?: string; items?: { type: string; refId: string }[] },
  ) {
    const mode = data.mode || 'AUTO';
    if (!VALID_MODES.includes(mode)) {
      throw new BadRequestException(`Invalid mode "${mode}". Must be one of: ${VALID_MODES.join(', ')}`);
    }
    const stream = this.streamRepo.create({
      tenantId,
      name: data.name,
      mode: mode as any,
      description: data.description,
    });
    await this.streamRepo.save(stream);

    if (data.items?.length) {
      const items = data.items.map((it, i) =>
        this.itemRepo.create({
          streamId: stream.id,
          tenantId,
          type: it.type as any,
          refId: it.refId,
          orderNo: i,
        }),
      );
      await this.itemRepo.save(items);
    }

    return this.findOne(tenantId, stream.id);
  }

  async findAll(tenantId: string) {
    return this.streamRepo.find({
      where: { tenantId },
      relations: ['items'],
      order: { orderNo: 'ASC', createdAt: 'DESC' },
    });
  }

  async findOne(tenantId: string, id: string) {
    const stream = await this.streamRepo.findOne({
      where: { id, tenantId },
      relations: ['items'],
    });
    if (!stream) throw new NotFoundException('Stream not found');
    if (stream.items) {
      stream.items.sort((a, b) => a.orderNo - b.orderNo);
    }
    return stream;
  }

  async update(
    tenantId: string,
    id: string,
    data: { name?: string; mode?: string; description?: string; enabled?: boolean; items?: { type: string; refId: string }[] },
  ) {
    const stream = await this.findOne(tenantId, id);
    if (data.name !== undefined) stream.name = data.name;
    if (data.mode !== undefined) stream.mode = data.mode as any;
    if (data.description !== undefined) stream.description = data.description;
    if (data.enabled !== undefined) stream.enabled = data.enabled;
    await this.streamRepo.save(stream);

    if (data.items !== undefined) {
      await this.itemRepo.delete({ streamId: id });
      const items = data.items.map((it, i) =>
        this.itemRepo.create({
          streamId: id,
          tenantId,
          type: it.type as any,
          refId: it.refId,
          orderNo: i,
        }),
      );
      if (items.length) await this.itemRepo.save(items);
    }

    return this.findOne(tenantId, id);
  }

  async remove(tenantId: string, id: string) {
    const stream = await this.findOne(tenantId, id);
    await this.itemRepo.delete({ streamId: id });
    await this.streamRepo.remove(stream);
  }
}

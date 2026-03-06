import {
  Injectable,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../account/user.entity';
import { Tenant } from '../account/tenant.entity';
import { SignUpDto } from './dto/sign-up.dto';
import { SignInDto } from './dto/sign-in.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(Tenant) private tenantRepo: Repository<Tenant>,
    private jwtService: JwtService,
  ) {}

  async signUp(dto: SignUpDto) {
    const existing = await this.userRepo.findOne({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already registered');

    const slug = dto.tenantName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    const tenant = this.tenantRepo.create({ name: dto.tenantName, slug });
    await this.tenantRepo.save(tenant);

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = this.userRepo.create({
      tenantId: tenant.id,
      email: dto.email,
      passwordHash,
      name: dto.name,
      role: 'owner',
    });
    await this.userRepo.save(user);

    const token = this.generateToken(user);
    return {
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
    };
  }

  async signIn(dto: SignInDto) {
    const user = await this.userRepo.findOne({
      where: { email: dto.email, isActive: true },
      relations: ['tenant'],
    });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    const token = this.generateToken(user);
    return {
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      tenant: { id: user.tenantId, name: user.tenant.name, slug: user.tenant.slug },
    };
  }

  private generateToken(user: User): string {
    return this.jwtService.sign({
      sub: user.id,
      tenantId: user.tenantId,
      email: user.email,
      role: user.role,
    });
  }
}

import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

const baseDir = path.resolve(__dirname, '..');

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  username: process.env.DB_USERNAME || 'katab',
  password: process.env.DB_PASSWORD || 'katab_secret',
  database: process.env.DB_DATABASE || 'katab_orchestrator',
  entities: [path.join(baseDir, '**', '*.entity{.ts,.js}')],
  migrations: [path.join(__dirname, 'migrations', '*{.ts,.js}')],
  synchronize: false,
});

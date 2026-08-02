import { DataSource } from 'typeorm';
import * as path from 'path';
import * as fs from 'fs';

import { Merchant } from '../../src/entities/merchant.entity';
import { Store } from '../../src/entities/store.entity';
import { Employee } from '../../src/entities/employee.entity';
import { Order } from '../../src/entities/order.entity';
import { Payment } from '../../src/entities/payment.entity';
import { Refund } from '../../src/entities/refund.entity';
import { AuditLog } from '../../src/entities/audit-log.entity';
import { Role } from '../../src/entities/role.entity';
import { Menu } from '../../src/entities/menu.entity';

/**
 * 创建一个独立的 SQLite 测试 DataSource。
 *
 * 设计要点：
 * - 每次调用生成独立 db 文件（基于时间戳 + 随机），避免测试间状态污染（hermetic）。
 * - synchronize=true：测试期自动建表，无需迁移脚本。
 * - database=:memory: 在多事务并发场景下 better-sqlite3 不支持共享内存库，
 *   故使用临时文件以保证事务/锁行为贴近真实。
 *
 * 调用方必须在 afterAll 中调用 ds.destroy()。
 */
export async function createTestDataSource(): Promise<DataSource> {
  const tmpDir = path.resolve(process.cwd(), 'data');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const dbFile = path.join(
    tmpDir,
    `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.db`,
  );

  const ds = new DataSource({
    type: 'better-sqlite3',
    database: dbFile,
    synchronize: true,
    dropSchema: true,
    entities: [Merchant, Store, Employee, Order, Payment, Refund, AuditLog, Role, Menu],
    logging: false,
  });
  await ds.initialize();
  return ds;
}

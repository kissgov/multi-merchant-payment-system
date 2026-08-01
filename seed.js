/**
 * 云端调试用种子脚本
 * 创建一个平台商户 + 超级管理员账号，用于登录测试
 * 运行：DB_TYPE=sqlite DB_DATABASE=./data/payment.db node seed.js
 */
const path = require('path');
const bcrypt = require('bcryptjs');

async function main() {
  // 设置环境变量，确保实体装饰器读到 DB_TYPE=sqlite
  process.env.DB_TYPE = process.env.DB_TYPE || 'sqlite';
  process.env.DB_DATABASE = process.env.DB_DATABASE || './data/payment.db';

  const { DataSource } = require('typeorm');
  const { Employee, EmployeeRole, EmployeeStatus } = require('./dist/entities/employee.entity');
  const { Merchant, MerchantStatus } = require('./dist/entities/merchant.entity');
  const { Role } = require('./dist/entities/role.entity');

  const ds = new DataSource({
    type: 'sqlite',
    database: process.env.DB_DATABASE,
    entities: [__dirname + '/dist/entities/*.entity{.js,.ts}'],
    synchronize: false,
  });
  await ds.initialize();

  const merchantRepo = ds.getRepository(Merchant);
  const employeeRepo = ds.getRepository(Employee);
  const roleRepo = ds.getRepository(Role);

  // 1. 创建/复用平台商户
  let merchant = await merchantRepo.findOne({ where: { merchantNo: 'PLAT001' } });
  if (!merchant) {
    merchant = merchantRepo.create({
      name: '平台商户（测试）',
      merchantNo: 'PLAT001',
      contactPerson: '平台管理员',
      contactPhone: '13800000000',
      platformFeeRate: 0.0038,
      status: MerchantStatus.ACTIVE,
    });
    await merchantRepo.save(merchant);
    console.log('[seed] 创建商户:', merchant.id);
  } else {
    console.log('[seed] 商户已存在:', merchant.id);
  }

  // 2. 创建/复用超级管理员员工
  let admin = await employeeRepo.findOne({ where: { username: 'admin' } });
  const superRole = await roleRepo.findOne({ where: { code: 'super_admin' } });
  const hash = await bcrypt.hash('admin123', 10);

  if (!admin) {
    admin = employeeRepo.create({
      employeeNo: 'SUPER001',
      merchantId: merchant.id,
      storeId: null,
      name: '超级管理员',
      username: 'admin',
      password: hash,
      phone: '13800000000',
      role: EmployeeRole.SUPER_ADMIN,
      roleId: superRole?.id || null,
      status: EmployeeStatus.ACTIVE,
      canAcceptPayment: true,
      canRefund: true,
    });
    await employeeRepo.save(admin);
    console.log('[seed] 创建超级管理员: admin / admin123');
  } else {
    admin.password = hash;
    admin.role = EmployeeRole.SUPER_ADMIN;
    admin.roleId = superRole?.id || admin.roleId;
    admin.status = EmployeeStatus.ACTIVE;
    await employeeRepo.save(admin);
    console.log('[seed] 超级管理员已存在，密码已重置: admin / admin123');
  }

  await ds.destroy();
  console.log('[seed] 完成');
}

main().catch((e) => {
  console.error('[seed] 失败:', e);
  process.exit(1);
});

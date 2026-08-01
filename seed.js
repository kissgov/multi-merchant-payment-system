/**
 * 种子脚本 - 创建平台商户 + 超级管理员账号
 * SQLite 调试: DB_TYPE=sqlite DB_DATABASE=./data/payment.db node seed.js
 * MySQL 生产:  DB_TYPE=mysql DB_HOST=127.0.0.1 DB_USERNAME=payment_user DB_PASSWORD='Pay@2026#Secure' DB_DATABASE=payment_system node seed.js
 */
const path = require('path');
const bcrypt = require('bcryptjs');

async function main() {
  const dbType = (process.env.DB_TYPE || 'sqlite').toLowerCase();
  const { DataSource } = require('typeorm');
  const { Employee, EmployeeRole, EmployeeStatus } = require('./dist/entities/employee.entity');
  const { Merchant, MerchantStatus } = require('./dist/entities/merchant.entity');
  const { Role } = require('./dist/entities/role.entity');

  let dsConfig;
  if (dbType === 'mysql') {
    dsConfig = {
      type: 'mysql',
      host: process.env.DB_HOST || '127.0.0.1',
      port: parseInt(process.env.DB_PORT || '3306', 10),
      username: process.env.DB_USERNAME || 'payment_user',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_DATABASE || 'payment_system',
      entities: [__dirname + '/dist/entities/*.entity{.js,.ts}'],
      synchronize: false,
    };
  } else {
    process.env.DB_TYPE = 'sqlite';
    process.env.DB_DATABASE = process.env.DB_DATABASE || './data/payment.db';
    dsConfig = {
      type: 'sqlite',
      database: process.env.DB_DATABASE,
      entities: [__dirname + '/dist/entities/*.entity{.js,.ts}'],
      synchronize: false,
    };
  }

  const ds = new DataSource(dsConfig);
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

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
  Index,
} from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Merchant } from './merchant.entity';
import { Store } from './store.entity';
import { Order } from './order.entity';
import { Role } from './role.entity';

/**
 * 员工角色枚举
 * 权限由高到低
 */
export enum EmployeeRole {
  SUPER_ADMIN = 'super_admin',     // 平台超级管理员
  MERCHANT_OWNER = 'merchant_owner', // 商户所有者/老板
  MERCHANT_ADMIN = 'merchant_admin', // 商户管理员（财务/运营）
  STORE_MANAGER = 'store_manager',   // 门店店长
  CASHIER = 'cashier',               // 收银员（前台收款）
}

/**
 * 员工状态枚举
 */
export enum EmployeeStatus {
  ACTIVE = 'active',
  DISABLED = 'disabled',
  LOCKED = 'locked',
}

/**
 * 员工实体
 * 支持多角色权限体系
 */
@Entity('employees')
export class Employee {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 20, unique: true, comment: '员工工号' })
  employeeNo: string;

  @Column({ type: 'uuid', comment: '所属商户ID' })
  merchantId: string;

  @Column({ type: 'uuid', nullable: true, comment: '所属门店ID（商户管理员可为空）' })
  storeId: string;

  @Column({ type: 'varchar', length: 50, comment: '员工姓名' })
  name: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 50, comment: '登录账号（手机号/工号）' })
  username: string;

  @Column({ type: 'varchar', length: 255, comment: '登录密码（加密）' })
  password: string;

  @Column({ type: 'varchar', length: 20, nullable: true, comment: '手机号' })
  phone: string;

  @Column({ type: 'varchar', length: 200, nullable: true, comment: '头像URL' })
  avatar: string;

  @Column({
    type: 'enum',
    enum: EmployeeRole,
    default: EmployeeRole.CASHIER,
    comment: '员工内置角色（兼容字段，权限判断优先以 roleId 自定义角色为准）',
  })
  role: EmployeeRole;

  @Column({ type: 'uuid', nullable: true, comment: '自定义角色ID（优先使用）' })
  roleId: string;

  @Column({
    type: 'enum',
    enum: EmployeeStatus,
    default: EmployeeStatus.ACTIVE,
    comment: '员工状态',
  })
  status: EmployeeStatus;

  @Column({ type: 'int', default: 0, comment: '登录失败次数（超过阈值锁定）' })
  loginFailCount: number;

  @Column({ type: 'datetime', nullable: true, comment: '最后登录时间' })
  lastLoginAt: Date;

  @Column({ type: 'varchar', length: 50, nullable: true, comment: '最后登录IP' })
  lastLoginIp: string;

  // 收款权限开关
  @Column({ type: 'boolean', default: true, comment: '是否允许收款' })
  canAcceptPayment: boolean;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
    comment: '单笔收款限额(0表示不限)',
  })
  singlePaymentLimit: number;

  @Column({
    type: 'decimal',
    precision: 14,
    scale: 2,
    default: 0,
    comment: '每日收款限额(0表示不限)',
  })
  dailyPaymentLimit: number;

  // 退款权限
  @Column({ type: 'boolean', default: false, comment: '是否允许退款' })
  canRefund: boolean;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
    comment: '单笔退款限额(0表示不限)',
  })
  singleRefundLimit: number;

  @Column({ type: 'varchar', length: 500, nullable: true, comment: '备注' })
  remark: string;

  @CreateDateColumn({ comment: '创建时间' })
  createdAt: Date;

  @UpdateDateColumn({ comment: '更新时间' })
  updatedAt: Date;

  // ===== 关联关系 =====
  @ManyToOne(() => Merchant, (merchant) => merchant.employees, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'merchantId' })
  merchant: Merchant;

  @ManyToOne(() => Store, (store) => store.employees, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'storeId' })
  store: Store;

  @ManyToOne(() => Role, (role) => role.employees, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'roleId' })
  roleEntity: Role;

  @OneToMany(() => Order, (order) => order.employee)
  orders: Order[];

  // ===== 方法 =====
  /**
   * 验证密码
   */
  async comparePassword(plainPassword: string): Promise<boolean> {
    return bcrypt.compare(plainPassword, this.password);
  }

  /**
   * 加密密码
   */
  static async hashPassword(plainPassword: string): Promise<string> {
    const salt = await bcrypt.genSalt(10);
    return bcrypt.hash(plainPassword, salt);
  }

  /**
   * 检查是否有权限收款
   */
  canTakePayment(amount: number, dailyTotal: number): { allowed: boolean; reason?: string } {
    if (!this.canAcceptPayment) {
      return { allowed: false, reason: '该员工无收款权限' };
    }
    if (this.status !== EmployeeStatus.ACTIVE) {
      return { allowed: false, reason: '该员工账户已被禁用或锁定' };
    }
    if (this.singlePaymentLimit > 0 && amount > this.singlePaymentLimit) {
      return { allowed: false, reason: `超过单笔收款限额￥${this.singlePaymentLimit}` };
    }
    if (this.dailyPaymentLimit > 0 && dailyTotal + amount > this.dailyPaymentLimit) {
      return { allowed: false, reason: `超过今日收款限额￥${this.dailyPaymentLimit}` };
    }
    return { allowed: true };
  }
}

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { Store } from './store.entity';
import { Employee } from './employee.entity';
import { enumColType } from './enums';

/**
 * 商户状态枚举
 */
export enum MerchantStatus {
  ACTIVE = 'active',        // 正常营业
  SUSPENDED = 'suspended',  // 暂停
  CLOSED = 'closed',        // 关闭
}

/**
 * 商户实体
 * 平台顶层实体，管理多个门店
 */
@Entity('merchants')
export class Merchant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100, comment: '商户名称' })
  name: string;

  @Column({ type: 'varchar', length: 20, unique: true, comment: '商户编号' })
  merchantNo: string;

  @Column({ type: 'varchar', length: 200, nullable: true, comment: '商户LOGO' })
  logo: string;

  @Column({ type: 'varchar', length: 50, nullable: true, comment: '联系人' })
  contactPerson: string;

  @Column({ type: 'varchar', length: 20, nullable: true, comment: '联系电话' })
  contactPhone: string;

  @Column({ type: 'varchar', length: 200, nullable: true, comment: '地址' })
  address: string;

  // ===== 支付宝支付配置 =====
  @Column({ type: 'varchar', length: 100, nullable: true, comment: '支付宝APPID' })
  alipayAppId: string;

  @Column({ type: 'text', nullable: true, comment: '支付宝应用私钥' })
  alipayPrivateKey: string;

  @Column({ type: 'text', nullable: true, comment: '支付宝公钥' })
  alipayPublicKey: string;

  @Column({ type: 'boolean', default: false, comment: '支付宝沙箱环境' })
  alipaySandbox: boolean;

  // ===== 微信支付配置 =====
  @Column({ type: 'varchar', length: 100, nullable: true, comment: '微信商户号' })
  wechatMchId: string;

  @Column({ type: 'varchar', length: 100, nullable: true, comment: '微信公众号/小程序APPID' })
  wechatAppId: string;

  @Column({ type: 'text', nullable: true, comment: '微信API V3密钥' })
  wechatApiV3Key: string;

  @Column({ type: 'text', nullable: true, comment: '微信商户证书序列号' })
  wechatMchSerialNo: string;

  @Column({ type: 'text', nullable: true, comment: '微信商户私钥(PEM)' })
  wechatPrivateKey: string;

  @Column({ type: 'boolean', default: false, comment: '微信沙箱环境' })
  wechatSandbox: boolean;

  // ===== 分账与费率 =====
  @Column({
    type: 'decimal',
    precision: 5,
    scale: 4,
    default: 0.0038,
    comment: '平台费率(如0.0038即0.38%)',
  })
  platformFeeRate: number;

  @Column({
    type: enumColType(),
    enum: MerchantStatus,
    default: MerchantStatus.ACTIVE,
    comment: '商户状态',
  })
  status: MerchantStatus;

  @Column({ type: 'varchar', length: 500, nullable: true, comment: '备注' })
  remark: string;

  @CreateDateColumn({ comment: '创建时间' })
  createdAt: Date;

  @UpdateDateColumn({ comment: '更新时间' })
  updatedAt: Date;

  // ===== 关联关系 =====
  @OneToMany(() => Store, (store) => store.merchant)
  stores: Store[];

  @OneToMany(() => Employee, (employee) => employee.merchant)
  employees: Employee[];
}

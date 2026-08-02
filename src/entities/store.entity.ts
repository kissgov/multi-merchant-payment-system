import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { Merchant } from './merchant.entity';
import { Employee } from './employee.entity';
import { Order } from './order.entity';
import { enumColType } from './enums';

/**
 * 门店状态枚举
 */
export enum StoreStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  CLOSED = 'closed',
}

/**
 * 门店实体
 * 归属于某个商户，管理多个员工和订单
 */
@Entity('stores')
export class Store {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100, comment: '门店名称' })
  name: string;

  @Column({ type: 'varchar', length: 20, unique: true, comment: '门店编号' })
  storeNo: string;

  @Column({ type: 'uuid', comment: '所属商户ID' })
  merchantId: string;

  @Column({ type: 'varchar', length: 200, nullable: true, comment: '门店LOGO' })
  logo: string;

  @Column({ type: 'varchar', length: 50, nullable: true, comment: '店长姓名' })
  managerName: string;

  @Column({ type: 'varchar', length: 20, nullable: true, comment: '店长电话' })
  managerPhone: string;

  @Column({ type: 'varchar', length: 200, comment: '门店地址' })
  address: string;

  @Column({ type: 'varchar', length: 20, nullable: true, comment: '门店电话' })
  phone: string;

  @Column({ type: 'decimal', precision: 10, scale: 6, nullable: true, comment: '经度' })
  longitude: number;

  @Column({ type: 'decimal', precision: 10, scale: 6, nullable: true, comment: '纬度' })
  latitude: number;

  // ===== 门店独立支付配置（useIndependentPayment=true 时覆盖商户配置，未配置项回退商户） =====
  @Column({ type: 'boolean', default: false, comment: '是否启用独立支付配置（启用后下方字段生效，缺省项仍回退商户）' })
  useIndependentPayment: boolean;

  // ---- 支付宝 ----
  @Column({ type: 'varchar', length: 100, nullable: true, comment: '门店支付宝APPID' })
  alipayAppId: string;

  @Column({ type: 'text', nullable: true, comment: '门店支付宝应用私钥' })
  alipayPrivateKey: string;

  @Column({ type: 'text', nullable: true, comment: '门店支付宝公钥' })
  alipayPublicKey: string;

  @Column({ type: 'boolean', default: false, comment: '门店支付宝沙箱环境' })
  alipaySandbox: boolean;

  // ---- 微信支付 ----
  @Column({ type: 'varchar', length: 100, nullable: true, comment: '门店微信商户号' })
  wechatMchId: string;

  @Column({ type: 'varchar', length: 100, nullable: true, comment: '门店微信公众号/小程序APPID' })
  wechatAppId: string;

  @Column({ type: 'text', nullable: true, comment: '门店微信API V3密钥' })
  wechatApiV3Key: string;

  @Column({ type: 'text', nullable: true, comment: '门店微信商户证书序列号' })
  wechatMchSerialNo: string;

  @Column({ type: 'text', nullable: true, comment: '门店微信商户私钥(PEM)' })
  wechatPrivateKey: string;

  @Column({ type: 'boolean', default: false, comment: '门店微信沙箱环境' })
  wechatSandbox: boolean;

  @Column({
    type: enumColType(),
    enum: StoreStatus,
    default: StoreStatus.ACTIVE,
    comment: '门店状态',
  })
  status: StoreStatus;

  @Column({ type: 'varchar', length: 500, nullable: true, comment: '备注' })
  remark: string;

  @CreateDateColumn({ comment: '创建时间' })
  createdAt: Date;

  @UpdateDateColumn({ comment: '更新时间' })
  updatedAt: Date;

  // ===== 关联关系 =====
  @ManyToOne(() => Merchant, (merchant) => merchant.stores, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'merchantId' })
  merchant: Merchant;

  @OneToMany(() => Employee, (employee) => employee.store)
  employees: Employee[];

  @OneToMany(() => Order, (order) => order.store)
  orders: Order[];
}

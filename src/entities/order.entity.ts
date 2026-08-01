import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToOne,
  Index,
} from 'typeorm';
import { Merchant } from './merchant.entity';
import { Store } from './store.entity';
import { Employee } from './employee.entity';
import { Payment } from './payment.entity';
import { Refund } from './refund.entity';
import { PaymentChannel, enumColType } from './enums';

/**
 * 订单状态枚举
 */
export enum OrderStatus {
  PENDING = 'pending',           // 待支付（创建后）
  PAID = 'paid',                 // 已支付
  PARTIAL_REFUNDED = 'partial_refunded', // 部分退款
  REFUNDED = 'refunded',         // 全额退款
  CLOSED = 'closed',             // 已关闭（取消/超时）
  FAILED = 'failed',             // 支付失败
}

/**
 * 订单来源枚举
 */
export enum OrderSource {
  POS_APP = 'pos_app',           // 门店POS/前台APP
  QR_CODE = 'qr_code',           // 静态收款码（用户主扫）
  MANUAL = 'manual',             // 后台手动创建
}

/**
 * 订单实体
 * 核心业务实体：一笔交易订单
 */
@Entity('orders')
@Index('idx_merchant_created', ['merchantId', 'createdAt'])
@Index('idx_store_created', ['storeId', 'createdAt'])
@Index('idx_employee_created', ['employeeId', 'createdAt'])
@Index('idx_order_no', ['orderNo'], { unique: true })
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 32, unique: true, comment: '业务订单号(内部)' })
  orderNo: string;

  @Column({ type: 'uuid', comment: '商户ID' })
  merchantId: string;

  @Column({ type: 'uuid', comment: '门店ID' })
  storeId: string;

  @Column({ type: 'uuid', comment: '收款员工ID' })
  employeeId: string;

  // ===== 金额信息 =====
  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    comment: '订单总金额(元)',
  })
  totalAmount: number;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
    comment: '优惠金额(元)',
  })
  discountAmount: number;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    comment: '实收金额(元) = 总金额 - 优惠金额',
  })
  paidAmount: number;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
    comment: '已退款金额(元)',
  })
  refundedAmount: number;

  // ===== 支付信息 =====
  @Column({
    type: enumColType(),
    enum: PaymentChannel,
    nullable: true,
    comment: '支付渠道',
  })
  paymentChannel: PaymentChannel;

  @Column({
    type: enumColType(),
    enum: OrderStatus,
    default: OrderStatus.PENDING,
    comment: '订单状态',
  })
  status: OrderStatus;

  @Column({
    type: enumColType(),
    enum: OrderSource,
    default: OrderSource.POS_APP,
    comment: '订单来源',
  })
  source: OrderSource;

  // ===== 业务信息 =====
  @Column({ type: 'varchar', length: 200, nullable: true, comment: '商品/服务描述' })
  subject: string;

  @Column({ type: 'varchar', length: 500, nullable: true, comment: '订单备注' })
  body: string;

  @Column({ type: 'varchar', length: 50, nullable: true, comment: '操作员姓名(冗余)' })
  operatorName: string;

  @Column({ type: 'varchar', length: 100, nullable: true, comment: '客户姓名' })
  customerName: string;

  @Column({ type: 'varchar', length: 20, nullable: true, comment: '客户手机号' })
  customerPhone: string;

  // ===== 时间信息 =====
  @Column({ type: 'datetime', nullable: true, comment: '支付完成时间' })
  paidAt: Date;

  @Column({ type: 'datetime', nullable: true, comment: '订单过期时间' })
  expireAt: Date;

  @Column({ type: 'int', nullable: true, comment: '过期秒数' })
  expireSeconds: number;

  @CreateDateColumn({ comment: '创建时间' })
  createdAt: Date;

  @UpdateDateColumn({ comment: '更新时间' })
  updatedAt: Date;

  // ===== 关联关系 =====
  @ManyToOne(() => Merchant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'merchantId' })
  merchant: Merchant;

  @ManyToOne(() => Store, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'storeId' })
  store: Store;

  @ManyToOne(() => Employee, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'employeeId' })
  employee: Employee;

  @OneToOne(() => Payment, (payment) => payment.order)
  payment: Payment;

  @OneToOne(() => Refund, (refund) => refund.order)
  refund: Refund;
}

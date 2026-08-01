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
import { Order, PaymentChannel } from './order.entity';
import { Employee } from './employee.entity';

/**
 * 退款状态枚举
 */
export enum RefundStatus {
  PENDING = 'pending',           // 退款申请中
  PROCESSING = 'processing',     // 退款处理中
  SUCCESS = 'success',           // 退款成功
  FAILED = 'failed',             // 退款失败
  CLOSED = 'closed',             // 退款关闭
}

/**
 * 退款实体
 * 支持单笔订单多次部分退款
 */
@Entity('refunds')
@Index('idx_refund_no', ['refundNo'], { unique: true })
@Index('idx_order', ['orderId'])
export class Refund {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 32, unique: true, comment: '退款单号(内部)' })
  refundNo: string;

  @Column({ type: 'uuid', comment: '关联订单ID' })
  orderId: string;

  @Column({ type: 'uuid', comment: '退款操作员工ID' })
  operatorId: string;

  @Column({
    type: 'enum',
    enum: PaymentChannel,
    comment: '退款渠道（原路退回）',
  })
  paymentChannel: PaymentChannel;

  @Column({
    type: 'enum',
    enum: RefundStatus,
    default: RefundStatus.PENDING,
    comment: '退款状态',
  })
  status: RefundStatus;

  // ===== 金额 =====
  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    comment: '原订单总金额(元)',
  })
  originalOrderAmount: number;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    comment: '本次退款金额(元)',
  })
  refundAmount: number;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
    comment: '退款手续费(元)',
  })
  refundFee: number;

  // ===== 原因 =====
  @Column({ type: 'varchar', length: 50, nullable: true, comment: '退款原因编码' })
  reasonCode: string;

  @Column({ type: 'varchar', length: 500, comment: '退款原因说明' })
  reason: string;

  // ===== 三方渠道 =====
  @Column({ type: 'varchar', length: 100, nullable: true, comment: '三方渠道退款号' })
  outRefundNo: string;

  @Column({ type: 'text', nullable: true, comment: '退款请求原始数据' })
  requestPayload: string;

  @Column({ type: 'text', nullable: true, comment: '退款响应原始数据' })
  responsePayload: string;

  @Column({ type: 'text', nullable: true, comment: '退款回调原始数据' })
  notifyPayload: string;

  // ===== 错误 =====
  @Column({ type: 'varchar', length: 100, nullable: true, comment: '错误码' })
  errorCode: string;

  @Column({ type: 'varchar', length: 500, nullable: true, comment: '错误描述' })
  errorMessage: string;

  // ===== 时间 =====
  @Column({ type: 'datetime', nullable: true, comment: '退款发起时间' })
  refundInitiatedAt: Date;

  @Column({ type: 'datetime', nullable: true, comment: '退款成功时间' })
  refundSucceededAt: Date;

  @CreateDateColumn({ comment: '创建时间' })
  createdAt: Date;

  @UpdateDateColumn({ comment: '更新时间' })
  updatedAt: Date;

  // ===== 关联 =====
  @OneToOne(() => Order, (order) => order.refund, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orderId' })
  order: Order;

  @ManyToOne(() => Employee, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'operatorId' })
  operator: Employee;
}

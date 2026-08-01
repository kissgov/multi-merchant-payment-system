import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Order } from './order.entity';
import { PaymentChannel, enumColType } from './enums';

/**
 * 支付状态枚举
 */
export enum PaymentStatus {
  PENDING = 'pending',           // 待支付
  WAITING_PAYER = 'waiting_payer', // 等待用户付款（二维码已生成）
  SUCCESS = 'success',           // 支付成功
  FAILED = 'failed',             // 支付失败
  CLOSED = 'closed',             // 已关闭
  REFUNDING = 'refunding',       // 退款中
  REFUNDED = 'refunded',         // 已退款
}

/**
 * 支付方式（面对面收款细分）
 */
export enum PaymentMethod {
  // 支付宝
  ALIPAY_QR = 'alipay_qr',           // 支付宝被扫（商家扫用户付款码）
  ALIPAY_PRECREATE = 'alipay_precreate', // 支付宝主扫（用户扫商家收款码）
  // 微信
  WECHAT_MICROPAY = 'wechat_micropay',   // 微信付款码支付（被扫/刷卡支付）
  WECHAT_NATIVE = 'wechat_native',       // 微信扫码支付（主扫/Native）
}

/**
 * 支付记录实体
 * 与订单一对一，记录支付渠道返回的详细信息
 */
@Entity('payments')
@Index('idx_payment_no', ['paymentNo'], { unique: true })
@Index('idx_channel_trade', ['paymentChannel', 'outTradeNo'])
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 32, unique: true, comment: '支付单号(内部)' })
  paymentNo: string;

  @Column({ type: 'uuid', comment: '关联订单ID' })
  orderId: string;

  @Column({
    type: enumColType(),
    enum: PaymentChannel,
    comment: '支付渠道',
  })
  paymentChannel: PaymentChannel;

  @Column({
    type: enumColType(),
    enum: PaymentMethod,
    comment: '具体支付方式',
  })
  paymentMethod: PaymentMethod;

  @Column({
    type: enumColType(),
    enum: PaymentStatus,
    default: PaymentStatus.PENDING,
    comment: '支付状态',
  })
  status: PaymentStatus;

  // ===== 金额信息 =====
  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    comment: '支付金额(元)',
  })
  amount: number;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
    comment: '支付渠道手续费(元)',
  })
  channelFee: number;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
    comment: '平台分润金额(元)',
  })
  platformFee: number;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
    comment: '商户实际到账金额(元)',
  })
  merchantNetAmount: number;

  // ===== 三方支付渠道信息 =====
  @Column({ type: 'varchar', length: 100, nullable: true, comment: '支付宝/微信交易号(第三方)' })
  outTradeNo: string;

  @Column({ type: 'varchar', length: 100, nullable: true, comment: '付款方账号(脱敏后)' })
  payerAccount: string;

  @Column({ type: 'varchar', length: 50, nullable: true, comment: '付款方实名(脱敏后)' })
  payerName: string;

  @Column({ type: 'varchar', length: 32, nullable: true, comment: '用户付款码(被扫时传入)' })
  authCode: string;

  @Column({ type: 'text', nullable: true, comment: '二维码内容(主扫时生成)' })
  qrCodeContent: string;

  @Column({ type: 'varchar', length: 500, nullable: true, comment: '二维码图片URL' })
  qrCodeUrl: string;

  // ===== 回调与响应 =====
  @Column({ type: 'text', nullable: true, comment: '支付请求原始参数(JSON)' })
  requestPayload: string;

  @Column({ type: 'text', nullable: true, comment: '支付响应原始数据(JSON)' })
  responsePayload: string;

  @Column({ type: 'text', nullable: true, comment: '支付回调通知原始数据(JSON)' })
  notifyPayload: string;

  // ===== 错误信息 =====
  @Column({ type: 'varchar', length: 100, nullable: true, comment: '错误码' })
  errorCode: string;

  @Column({ type: 'varchar', length: 500, nullable: true, comment: '错误描述' })
  errorMessage: string;

  // ===== 时间 =====
  @Column({ type: 'datetime', nullable: true, comment: '支付发起时间' })
  payInitiatedAt: Date;

  @Column({ type: 'datetime', nullable: true, comment: '支付成功时间' })
  paySucceededAt: Date;

  @Column({ type: 'datetime', nullable: true, comment: '回调接收时间' })
  notifyReceivedAt: Date;

  @CreateDateColumn({ comment: '创建时间' })
  createdAt: Date;

  @UpdateDateColumn({ comment: '更新时间' })
  updatedAt: Date;

  // ===== 关联 =====
  @OneToOne(() => Order, (order) => order.payment, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orderId' })
  order: Order;
}

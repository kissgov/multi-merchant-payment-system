import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { enumColType } from './enums';

/**
 * 操作类型枚举
 */
export enum AuditAction {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  QUERY = 'query',
  EXPORT = 'export',
  IMPORT = 'import',
  LOGIN = 'login',
  LOGOUT = 'logout',
  PAYMENT = 'payment',
  REFUND = 'refund',
  CLOSE = 'close',
  APPROVE = 'approve',
  REJECT = 'reject',
  UPLOAD = 'upload',
  DOWNLOAD = 'download',
  OTHER = 'other',
}

/**
 * 操作审计日志
 * PC端所有关键操作留痕，用于安全审计和事后追溯
 */
@Entity('audit_logs')
@Index('idx_operator', ['operatorId'])
@Index('idx_merchant', ['merchantId'])
@Index('idx_module_action', ['module', 'action'])
@Index('idx_created', ['createdAt'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 50, comment: '业务模块：auth/merchant/store/employee/order/payment/refund/report/system' })
  module: string;

  @Column({
    type: enumColType(),
    enum: AuditAction,
    default: AuditAction.OTHER,
    comment: '操作类型',
  })
  action: AuditAction;

  @Column({ type: 'varchar', length: 200, comment: '操作描述(人类可读)' })
  description: string;

  // ===== 业务主键（便于关联查询） =====
  @Column({ type: 'uuid', nullable: true, comment: '关联商户ID' })
  merchantId: string;

  @Column({ type: 'uuid', nullable: true, comment: '关联门店ID' })
  storeId: string;

  @Column({ type: 'uuid', nullable: true, comment: '操作人-员工ID' })
  operatorId: string;

  @Column({ type: 'varchar', length: 50, nullable: true, comment: '操作人姓名' })
  operatorName: string;

  @Column({ type: 'varchar', length: 50, nullable: true, comment: '操作人工号' })
  operatorNo: string;

  @Column({ type: 'varchar', length: 50, nullable: true, comment: '目标资源类型：order/employee/role等' })
  targetType: string;

  @Column({ type: 'varchar', length: 100, nullable: true, comment: '目标资源ID/单号' })
  targetId: string;

  // ===== 数据 =====
  @Column({ type: 'text', nullable: true, comment: '变更前数据(JSON)' })
  beforeData: string;

  @Column({ type: 'text', nullable: true, comment: '变更后数据(JSON)' })
  afterData: string;

  @Column({ type: 'text', nullable: true, comment: '请求参数(JSON)' })
  requestParams: string;

  // ===== 网络信息 =====
  @Column({ type: 'varchar', length: 50, nullable: true, comment: '操作IP' })
  ip: string;

  @Column({ type: 'varchar', length: 500, nullable: true, comment: 'User-Agent' })
  userAgent: string;

  // ===== 结果 =====
  @Column({ type: 'boolean', default: true, comment: '操作是否成功' })
  success: boolean;

  @Column({ type: 'varchar', length: 500, nullable: true, comment: '失败原因/错误消息' })
  errorMessage: string;

  @Column({ type: 'int', default: 0, comment: '耗时(毫秒)' })
  costMs: number;

  @CreateDateColumn({ comment: '操作时间' })
  createdAt: Date;
}

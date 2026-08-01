import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, Like } from 'typeorm';
import { AuditLog, AuditAction } from '../../entities/audit-log.entity';

export { AuditAction };
import { EmployeePayload } from '../../common/decorators/current-employee.decorator';

export interface CreateAuditLogParams {
  module: string;
  action: AuditAction;
  description: string;
  operator?: EmployeePayload;
  merchantId?: string;
  storeId?: string;
  targetType?: string;
  targetId?: string;
  beforeData?: any;
  afterData?: any;
  requestParams?: any;
  ip?: string;
  userAgent?: string;
  success?: boolean;
  errorMessage?: string;
  startAt?: number;
}

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(
    @InjectRepository(AuditLog)
    private readonly auditRepo: Repository<AuditLog>,
  ) {}

  /** 记录一条审计日志（异步写入，不阻塞主流程） */
  async log(params: CreateAuditLogParams) {
    try {
      const endAt = params.startAt ?? Date.now();
      const costMs = params.startAt ? Date.now() - params.startAt : 0;

      const entity = this.auditRepo.create({
        module: params.module,
        action: params.action,
        description: params.description,
        merchantId: params.merchantId ?? params.operator?.merchantId,
        storeId: params.storeId ?? params.operator?.storeId,
        operatorId: params.operator?.id,
        operatorName: params.operator?.name,
        operatorNo: params.operator?.employeeNo,
        targetType: params.targetType,
        targetId: params.targetId,
        beforeData: params.beforeData != null ? JSON.stringify(params.beforeData) : null,
        afterData: params.afterData != null ? JSON.stringify(params.afterData) : null,
        requestParams:
          params.requestParams != null ? JSON.stringify(params.requestParams) : null,
        ip: params.ip,
        userAgent: params.userAgent,
        success: params.success ?? true,
        errorMessage: params.errorMessage,
        costMs,
      });
      // 异步写入
      this.auditRepo.save(entity).catch((e) => {
        this.logger.warn(`[审计日志] 写入失败: ${e.message}`);
      });
    } catch (e) {
      this.logger.warn(`[审计日志] 构造失败: ${e.message}`);
    }
  }

  /**
   * 查询审计日志列表（PC端后台）
   */
  async queryLogs(
    emp: EmployeePayload,
    dto: {
      page?: number;
      pageSize?: number;
      startDate?: string;
      endDate?: string;
      module?: string;
      action?: AuditAction;
      operatorId?: string;
      targetId?: string;
      keyword?: string;
      success?: boolean;
    },
  ) {
    const page = dto.page ?? 1;
    const pageSize = Math.min(dto.pageSize ?? 20, 200);
    const skip = (page - 1) * pageSize;

    const qb = this.auditRepo.createQueryBuilder('a');
    qb.where('a.merchantId = :mid OR a.merchantId IS NULL', { mid: emp.merchantId });

    // 平台管理员：可查全部
    if (emp.role === 'super_admin') {
      qb.where('1=1');
    }

    if (dto.module) qb.andWhere('a.module = :m', { m: dto.module });
    if (dto.action) qb.andWhere('a.action = :a', { a: dto.action });
    if (dto.operatorId) qb.andWhere('a.operatorId = :oid', { oid: dto.operatorId });
    if (dto.targetId) qb.andWhere('a.targetId = :tid', { tid: dto.targetId });
    if (dto.success !== undefined) qb.andWhere('a.success = :s', { s: dto.success });
    if (dto.startDate && dto.endDate) {
      qb.andWhere('a.createdAt BETWEEN :s AND :e', {
        s: new Date(dto.startDate),
        e: new Date(new Date(dto.endDate).getTime() + 24 * 3600 * 1000),
      });
    }
    if (dto.keyword) {
      qb.andWhere(
        '(a.description LIKE :kw OR a.targetId LIKE :kw OR a.operatorName LIKE :kw OR a.errorMessage LIKE :kw)',
        { kw: `%${dto.keyword}%` },
      );
    }

    qb.orderBy('a.createdAt', 'DESC').skip(skip).take(pageSize);
    const [list, total] = await qb.getManyAndCount();
    return { list, total, page, pageSize };
  }
}

import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In, Between, Brackets } from 'typeorm';
import * as dayjs from 'dayjs';
import * as crypto from 'crypto';

import { Order, OrderStatus } from '../../entities/order.entity';
import { PaymentChannel } from '../../entities/enums';
import { Payment, PaymentStatus } from '../../entities/payment.entity';
import { Refund, RefundStatus } from '../../entities/refund.entity';
import { Employee, EmployeeRole, EmployeeStatus } from '../../entities/employee.entity';
import { Merchant } from '../../entities/merchant.entity';
import { Store } from '../../entities/store.entity';
import { EmployeePayload } from '../../common/decorators/current-employee.decorator';
import { REFUND_APPROVAL_THRESHOLD, REFUND_REASON_CODES, RefundWorkflowStatus } from './refund-workflow.constant';
import { AuditLogService, AuditAction } from '../audit/audit-log.service';
import { RbacService } from '../rbac/rbac.service';
import { PaymentService } from '../payment/payment.service';
import { parsePagination } from '../../common/utils/page';
import { pessimisticWriteLock } from '../../common/utils/sql-dialect';

export interface CreateRefundDto {
  orderId: string;
  refundAmount: number;
  reasonCode: string;
  reason: string;
  evidenceImages?: string[];
  notifyCustomer?: boolean;
}

export interface QueryRefundDto {
  page?: number;
  pageSize?: number;
  startDate?: string;
  endDate?: string;
  status?: RefundStatus | RefundWorkflowStatus;
  channel?: PaymentChannel;
  keyword?: string;
  storeId?: string;
  operatorId?: string;
  reasonCode?: string;
  amountMin?: number;
  amountMax?: number;
  workflowStatus?: RefundWorkflowStatus;
}

@Injectable()
export class RefundService {
  private readonly logger = new Logger(RefundService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(Refund)
    private readonly refundRepo: Repository<Refund>,
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
    @InjectRepository(Merchant)
    private readonly merchantRepo: Repository<Merchant>,
    private readonly audit: AuditLogService,
    private readonly rbac: RbacService,
    private readonly paymentService: PaymentService,
  ) {}

  // ========== 1. 申请退款（独立接口） ==========
  async applyRefund(emp: EmployeePayload, dto: CreateRefundDto, ip?: string, ua?: string) {
    const startAt = Date.now();
    // 1. 校验员工权限
    const employee = await this.employeeRepo.findOneOrFail({ where: { id: emp.id } });
    if (!employee.canRefund) {
      throw new ForbiddenException('您没有退款权限，请联系店长或管理员');
    }
    if (employee.status !== EmployeeStatus.ACTIVE) {
      throw new ForbiddenException('员工账号已禁用');
    }
    if (employee.singleRefundLimit > 0 && dto.refundAmount > employee.singleRefundLimit) {
      throw new ForbiddenException(`超过单笔退款限额￥${employee.singleRefundLimit}`);
    }

    // 2. 数据范围：RBAC resolve
    const scope = await this.rbac.resolveDataScopeStoreIds(emp);

    // 3. 校验订单
    const order = await this.orderRepo.findOne({
      where: { id: dto.orderId, merchantId: emp.merchantId },
      relations: ['payment', 'employee', 'store'],
    });
    if (!order) throw new NotFoundException('订单不存在');
    // 数据权限校验
    if (scope.selfOnly && order.employeeId !== emp.id) {
      throw new ForbiddenException('您仅能退款自己操作的订单');
    }
    if (scope.storeIds && !scope.storeIds.includes(order.storeId)) {
      throw new ForbiddenException('您无权退该门店订单');
    }
    if (![OrderStatus.PAID, OrderStatus.PARTIAL_REFUNDED].includes(order.status)) {
      throw new BadRequestException(`订单状态[${order.status}]不允许退款`);
    }

    const payment = order.payment;
    if (!payment || payment.status !== PaymentStatus.SUCCESS) {
      throw new BadRequestException('订单未成功支付，无法退款');
    }

    // 4. 校验金额
    const remaining = Number(
      (Number(order.paidAmount) - Number(order.refundedAmount || 0)).toFixed(2),
    );
    const refundAmount = Number(dto.refundAmount.toFixed(2));
    if (refundAmount <= 0) throw new BadRequestException('退款金额必须大于0');
    if (refundAmount > remaining) {
      throw new BadRequestException(`退款金额超限，可退款￥${remaining}`);
    }

    // 5. 校验原因
    const reasonDef = REFUND_REASON_CODES.find((r) => r.code === dto.reasonCode);
    if (!reasonDef) throw new BadRequestException('无效的退款原因编码');

    // 6. 是否需要审批
    const needAudit =
      reasonDef.needApprove || refundAmount >= REFUND_APPROVAL_THRESHOLD;

    // 7. 生成退款单号（使用 crypto.randomBytes 替代 Math.random）
    const refundNo = `R${dayjs().format('YYYYMMDDHHmmss')}${crypto.randomBytes(4).toString('hex')}`;
    const merchant = await this.merchantRepo.findOneOrFail({ where: { id: emp.merchantId } });

    // 8. 如果无需审批，先在事务外调用渠道退款（避免长时间占用 DB 连接）
    let channelRefundNo: string | undefined;
    let channelError: string | undefined;

    if (!needAudit) {
      try {
        if (order.paymentChannel === PaymentChannel.ALIPAY) {
          channelRefundNo = await this.callAlipayRefund(merchant, order, refundAmount, refundNo);
        } else {
          channelRefundNo = await this.callWechatRefund(
            merchant, order, refundAmount, refundNo,
          );
        }
      } catch (e) {
        channelError = e.message;
      }
    }

    // 9. 事务内创建退款记录 + 更新订单（使用悲观锁防并发超退）
    return this.dataSource.transaction(async (mgr) => {
      // 悲观锁锁定订单行，防止并发退款超出可退金额
      const lockedOrder = await mgr.findOne(Order, {
        where: { id: order.id },
        lock: pessimisticWriteLock(),
      });
      if (!lockedOrder) throw new NotFoundException('订单不存在');

      // 重新校验可退金额（锁定后读取最新值）
      const currentRefunded = Number(lockedOrder.refundedAmount || 0);
      const currentRemaining = Number(
        (Number(lockedOrder.paidAmount) - currentRefunded).toFixed(2),
      );
      if (refundAmount > currentRemaining) {
        throw new BadRequestException(`退款金额超限，可退款￥${currentRemaining}（可能已被其他退款占用）`);
      }

      const refund = mgr.create(Refund, {
        refundNo,
        orderId: order.id,
        operatorId: emp.id,
        paymentChannel: order.paymentChannel,
        status: needAudit
          ? RefundStatus.PENDING
          : channelError
            ? RefundStatus.FAILED
            : RefundStatus.SUCCESS,
        originalOrderAmount: order.paidAmount,
        refundAmount,
        reasonCode: dto.reasonCode,
        reason: dto.reason + (dto.evidenceImages ? ` 凭证:${dto.evidenceImages.join(',')}` : ''),
        refundInitiatedAt: new Date(),
        outRefundNo: channelRefundNo,
        errorCode: channelError ? 'CHANNEL_ERROR' : undefined,
        errorMessage: channelError,
        refundSucceededAt: needAudit || channelError ? undefined : new Date(),
      });
      const saved = await mgr.save(refund);

      let workflowStatus: RefundWorkflowStatus;
      if (needAudit) {
        workflowStatus = RefundWorkflowStatus.PENDING_AUDIT;
      } else if (channelError) {
        // 渠道退款失败，不更新订单金额
        workflowStatus = RefundWorkflowStatus.FAILED;
      } else {
        await this.applyRefundSuccess(mgr, lockedOrder, saved, refundAmount, channelRefundNo!);
        workflowStatus = RefundWorkflowStatus.SUCCESS;
      }

      // 审计
      await this.audit.log({
        module: 'refund',
        action: AuditAction.REFUND,
        description: needAudit
          ? `提交退款申请 ￥${refundAmount}，待审核`
          : `发起退款￥${refundAmount} → ${workflowStatus}`,
        operator: emp,
        merchantId: emp.merchantId,
        storeId: order.storeId,
        targetType: 'refund',
        targetId: saved.id,
        requestParams: dto,
        afterData: { refundNo, orderNo: order.orderNo, amount: refundAmount, status: workflowStatus },
        ip,
        userAgent: ua,
        success: true,
        startAt,
      });

      return {
        refundId: saved.id,
        refundNo,
        orderId: order.id,
        orderNo: order.orderNo,
        amount: refundAmount,
        workflowStatus,
        message: needAudit ? '已提交，等待店长/管理员审批' : '退款成功',
      };
    });
  }

  private async applyRefundSuccess(mgr: any, order: Order, saved: Refund, refundAmount: number, outRefundNo?: string) {
    const newRefunded = Number(
      (Number(order.refundedAmount || 0) + refundAmount).toFixed(2),
    );
    const isFullRefund = Math.abs(newRefunded - Number(order.paidAmount)) < 0.01;
    await mgr.update(Refund, saved.id, {
      status: RefundStatus.SUCCESS,
      outRefundNo,
      refundSucceededAt: new Date(),
    });
    await mgr.update(Order, order.id, {
      refundedAmount: newRefunded,
      status: isFullRefund ? OrderStatus.REFUNDED : OrderStatus.PARTIAL_REFUNDED,
    });
    if (order.payment?.id) {
      await mgr.update(Payment, order.payment.id, {
        status: isFullRefund ? PaymentStatus.REFUNDED : PaymentStatus.REFUNDING,
      });
    }
  }

  private async callAlipayRefund(m: Merchant, order: Order, amount: number, refundNo: string) {
    const store = order.storeId
      ? await this.dataSource.getRepository(Store).findOne({ where: { id: order.storeId } })
      : null;
    return this.paymentService.alipayRefund(
      m,
      store,
      order.orderNo,
      amount,
      refundNo,
      '用户申请退款',
    );
  }

  private async callWechatRefund(m: Merchant, order: Order, amount: number, refundNo: string) {
    const store = order.storeId
      ? await this.dataSource.getRepository(Store).findOne({ where: { id: order.storeId } })
      : null;
    return this.paymentService.wechatRefund(
      m,
      store,
      order.orderNo,
      amount,
      Number(order.paidAmount),
      refundNo,
      '用户申请退款',
    );
  }

  // ========== 2. 审核 ==========
  async auditRefund(
    emp: EmployeePayload,
    refundId: string,
    decision: 'approve' | 'reject',
    rejectReason?: string,
    ip?: string,
    ua?: string,
  ) {
    const startAt = Date.now();
    // 只有店长/管理员可审核
    if (
      emp.role !== EmployeeRole.STORE_MANAGER &&
      emp.role !== EmployeeRole.MERCHANT_ADMIN &&
      emp.role !== EmployeeRole.MERCHANT_OWNER &&
      emp.role !== EmployeeRole.SUPER_ADMIN
    ) {
      throw new ForbiddenException('仅店长及以上级别可审批退款');
    }

    const refund = await this.refundRepo.findOne({
      where: { id: refundId },
      relations: ['order', 'order.store'],
    });
    if (!refund) throw new NotFoundException('退款单不存在');
    if ((refund as any).order.merchantId !== emp.merchantId) {
      throw new ForbiddenException('跨商户不可审批');
    }
    if (refund.status !== RefundStatus.PENDING) {
      throw new BadRequestException(`当前状态[${refund.status}]不可审批`);
    }
    // 店长只能审自己门店的
    if (emp.role === EmployeeRole.STORE_MANAGER && (refund as any).order.storeId !== emp.storeId) {
      throw new ForbiddenException('仅可审批本门店退款单');
    }

    if (decision === 'reject') {
      await this.refundRepo.update(refundId, {
        status: RefundStatus.FAILED,
        errorCode: 'AUDIT_REJECTED',
        errorMessage: rejectReason || '审批驳回',
      });
      await this.audit.log({
        module: 'refund', action: AuditAction.REJECT,
        description: `驳回退款￥${refund.refundAmount}，理由：${rejectReason || '无'}`,
        operator: emp, merchantId: emp.merchantId, storeId: (refund as any).order.storeId,
        targetType: 'refund', targetId: refundId,
        requestParams: { decision, rejectReason },
        ip, userAgent: ua, success: true, startAt,
      });
      return { workflowStatus: RefundWorkflowStatus.AUDIT_REJECTED, message: '已驳回' };
    }

    // 审批通过：先在事务外调用渠道退款（避免长时间占用 DB 连接）
    const order = (refund as any).order as Order;
    const merchant = await this.merchantRepo.findOneOrFail({ where: { id: emp.merchantId } });

    let channelRefundNo: string | undefined;
    let channelError: string | undefined;
    try {
      if (refund.paymentChannel === PaymentChannel.ALIPAY) {
        channelRefundNo = await this.callAlipayRefund(merchant, order, Number(refund.refundAmount), refund.refundNo);
      } else {
        channelRefundNo = await this.callWechatRefund(merchant, order, Number(refund.refundAmount), refund.refundNo);
      }
    } catch (e) {
      channelError = e.message;
    }

    // 事务内更新状态（使用悲观锁防并发）
    return this.dataSource.transaction(async (mgr) => {
      if (channelError) {
        await mgr.update(Refund, refundId, {
          status: RefundStatus.FAILED,
          errorCode: 'CHANNEL_ERROR',
          errorMessage: channelError,
        });
        await this.audit.log({
          module: 'refund', action: AuditAction.APPROVE,
          description: `审批通过但渠道退款失败: ${channelError}`,
          operator: emp, merchantId: emp.merchantId, storeId: order.storeId,
          targetType: 'refund', targetId: refundId,
          success: false, errorMessage: channelError, startAt,
        });
        throw new BadRequestException(`渠道退款失败: ${channelError}`);
      }

      // 悲观锁锁定订单行
      const lockedOrder = await mgr.findOne(Order, {
        where: { id: order.id },
        lock: pessimisticWriteLock(),
      });
      if (!lockedOrder) throw new NotFoundException('订单不存在');

      await mgr.update(Refund, refundId, { status: RefundStatus.SUCCESS, outRefundNo: channelRefundNo, refundSucceededAt: new Date() });
      await this.applyRefundSuccess(mgr, lockedOrder, refund, Number(refund.refundAmount), channelRefundNo);
      await this.audit.log({
        module: 'refund', action: AuditAction.APPROVE,
        description: `审批通过并完成退款￥${refund.refundAmount}`,
        operator: emp, merchantId: emp.merchantId, storeId: (refund as any).order.storeId,
        targetType: 'refund', targetId: refundId,
        afterData: { channelRefundNo },
        ip, userAgent: ua, success: true, startAt,
      });
      return { workflowStatus: RefundWorkflowStatus.SUCCESS, message: '退款成功' };
    });
  }

  // ========== 3. 退款列表（PC后台） ==========
  async queryList(emp: EmployeePayload, dto: QueryRefundDto) {
    const { page, pageSize, skip } = parsePagination(dto.page, dto.pageSize);

    const scope = await this.rbac.resolveDataScopeStoreIds(emp);

    const qb = this.refundRepo
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.order', 'o')
      .leftJoinAndSelect('r.operator', 'op')
      .leftJoinAndSelect('o.store', 'st')
      .where('o.merchantId = :mid', { mid: emp.merchantId });

    if (scope.selfOnly) qb.andWhere('r.operatorId = :eid', { eid: emp.id });
    if (scope.storeIds) qb.andWhere('o.storeId IN (:...sids)', { sids: scope.storeIds });
    if (dto.storeId) qb.andWhere('o.storeId = :sid', { sid: dto.storeId });
    if (dto.operatorId) qb.andWhere('r.operatorId = :oid', { oid: dto.operatorId });
    if (dto.status) qb.andWhere('r.status = :st', { st: dto.status });
    if (dto.channel) qb.andWhere('r.paymentChannel = :ch', { ch: dto.channel });
    if (dto.reasonCode) qb.andWhere('r.reasonCode = :rc', { rc: dto.reasonCode });
    if (dto.amountMin !== undefined) qb.andWhere('r.refundAmount >= :amin', { amin: dto.amountMin });
    if (dto.amountMax !== undefined) qb.andWhere('r.refundAmount <= :amax', { amax: dto.amountMax });
    if (dto.startDate && dto.endDate) {
      qb.andWhere('r.createdAt BETWEEN :s AND :e', {
        s: dayjs(dto.startDate).startOf('day').toDate(),
        e: dayjs(dto.endDate).endOf('day').toDate(),
      });
    }
    if (dto.keyword) {
      qb.andWhere(
        new Brackets((q) =>
          q
            .where('r.refundNo LIKE :kw', { kw: `%${dto.keyword}%` })
            .orWhere('o.orderNo LIKE :kw', { kw: `%${dto.keyword}%` })
            .orWhere('r.outRefundNo LIKE :kw', { kw: `%${dto.keyword}%` })
            .orWhere('r.reason LIKE :kw', { kw: `%${dto.keyword}%` }),
        ),
      );
    }
    qb.orderBy('r.createdAt', 'DESC').skip(skip).take(pageSize);
    const [list, total] = await qb.getManyAndCount();

    // 统计
    const stats = await this.refundRepo
      .createQueryBuilder('r')
      .leftJoin('r.order', 'o')
      .where('o.merchantId = :mid', { mid: emp.merchantId })
      .select('COUNT(1)', 'count')
      .addSelect('COALESCE(SUM(r.refundAmount),0)', 'amount')
      .getRawOne();

    return { list, total, page, pageSize, summary: { count: Number(stats.count || 0), amount: Number(stats.amount || 0) } };
  }

  // ========== 4. 退款详情 ==========
  async detail(emp: EmployeePayload, refundId: string) {
    const scope = await this.rbac.resolveDataScopeStoreIds(emp);
    const r = await this.refundRepo.findOne({
      where: { id: refundId },
      relations: ['order', 'order.store', 'order.payment', 'operator'],
    });
    if (!r) throw new NotFoundException('退款单不存在');
    if ((r as any).order.merchantId !== emp.merchantId) throw new ForbiddenException('跨商户');
    if (scope.selfOnly && r.operatorId !== emp.id) throw new ForbiddenException('无权查看');
    if (scope.storeIds && !scope.storeIds.includes((r as any).order.storeId)) throw new ForbiddenException('跨门店无权');
    return {
      ...r,
      reasonDef: REFUND_REASON_CODES.find((x) => x.code === r.reasonCode) || null,
      threshold: REFUND_APPROVAL_THRESHOLD,
    };
  }

  /** 退款原因字典（前端下拉） */
  listReasonCodes() {
    return { list: REFUND_REASON_CODES, approvalThreshold: REFUND_APPROVAL_THRESHOLD };
  }

  /** 待审批数量（PC端Badge） */
  async pendingAuditCount(emp: EmployeePayload) {
    const scope = await this.rbac.resolveDataScopeStoreIds(emp);
    if (
      emp.role !== EmployeeRole.STORE_MANAGER &&
      emp.role !== EmployeeRole.MERCHANT_ADMIN &&
      emp.role !== EmployeeRole.MERCHANT_OWNER &&
      emp.role !== EmployeeRole.SUPER_ADMIN
    ) {
      return { count: 0, totalAmount: 0 };
    }
    const qb = this.refundRepo
      .createQueryBuilder('r')
      .leftJoin('r.order', 'o')
      .where('o.merchantId = :mid', { mid: emp.merchantId })
      .andWhere("r.status = 'pending'");
    if (scope.storeIds) qb.andWhere('o.storeId IN (:...sids)', { sids: scope.storeIds });
    const row = await qb
      .select('COUNT(1)', 'count')
      .addSelect('COALESCE(SUM(r.refundAmount),0)', 'amount')
      .getRawOne();
    return { count: Number(row.count || 0), totalAmount: Number(row.amount || 0) };
  }
}

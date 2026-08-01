import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, Brackets } from 'typeorm';
import * as dayjs from 'dayjs';

import { Order, OrderStatus, PaymentChannel } from '../../entities/order.entity';
import { Payment } from '../../entities/payment.entity';
import { Refund, RefundStatus } from '../../entities/refund.entity';
import { Employee, EmployeeRole } from '../../entities/employee.entity';
import { Store } from '../../entities/store.entity';
import { EmployeePayload } from '../../common/decorators/current-employee.decorator';
import { RbacService } from '../rbac/rbac.service';
import { Inject } from '@nestjs/common';

export interface SummaryDto {
  startDate?: string;
  endDate?: string;
  storeId?: string;
  employeeId?: string;
}

@Injectable()
export class ReportService {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(Refund)
    private readonly refundRepo: Repository<Refund>,
    @InjectRepository(Store)
    private readonly storeRepo: Repository<Store>,
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
    @Inject(RbacService)
    private readonly rbac: RbacService,
  ) {}

  /**
   * 数据权限过滤条件附加
   */
  private appendDataPermission(
    qb: any,
    emp: EmployeePayload,
    alias = 'o',
  ) {
    qb.andWhere(`${alias}.merchantId = :mid`, { mid: emp.merchantId });
    if (emp.role === EmployeeRole.STORE_MANAGER && emp.storeId) {
      qb.andWhere(`${alias}.storeId = :sid`, { sid: emp.storeId });
    }
    if (emp.role === EmployeeRole.CASHIER) {
      qb.andWhere(`${alias}.employeeId = :eid`, { eid: emp.id });
    }
  }

  /**
   * 收款总览（今日/时间段汇总）
   */
  async summary(emp: EmployeePayload, dto: SummaryDto) {
    // 默认今日
    const start = dto.startDate ? dayjs(dto.startDate).startOf('day') : dayjs().startOf('day');
    const end = dto.endDate ? dayjs(dto.endDate).endOf('day') : dayjs().endOf('day');

    const qb = this.orderRepo.createQueryBuilder('o').leftJoin('o.payment', 'p');
    this.appendDataPermission(qb, emp);
    qb.andWhere('o.createdAt BETWEEN :start AND :end', {
      start: start.toDate(),
      end: end.toDate(),
    });

    if (dto.storeId) qb.andWhere('o.storeId = :sid', { sid: dto.storeId });
    if (dto.employeeId) qb.andWhere('o.employeeId = :eid', { eid: dto.employeeId });

    // 总体订单数与金额
    const overview = await qb
      .clone()
      .select('COUNT(DISTINCT o.id)', 'totalOrders')
      .addSelect(
        `SUM(CASE WHEN o.status IN ('paid','partial_refunded') THEN o.paidAmount ELSE 0 END)`,
        'totalPaidAmount',
      )
      .addSelect(
        `SUM(CASE WHEN o.status IN ('paid','partial_refunded') THEN 1 ELSE 0 END)`,
        'successOrders',
      )
      .addSelect('COALESCE(SUM(o.refundedAmount),0)', 'totalRefundAmount')
      .addSelect(
        `SUM(CASE WHEN o.status = 'refunded' THEN 1 WHEN o.status = 'partial_refunded' THEN 1 ELSE 0 END)`,
        'refundOrders',
      )
      .addSelect('COALESCE(AVG(CASE WHEN o.status IN (\'paid\',\'partial_refunded\') THEN o.paidAmount END),0)', 'avgOrderAmount')
      .getRawOne();

    // 按渠道分布
    const byChannel = await qb
      .clone()
      .select('o.paymentChannel', 'channel')
      .addSelect(
        `SUM(CASE WHEN o.status IN ('paid','partial_refunded') THEN o.paidAmount ELSE 0 END)`,
        'amount',
      )
      .addSelect(
        `SUM(CASE WHEN o.status IN ('paid','partial_refunded') THEN 1 ELSE 0 END)`,
        'count',
      )
      .andWhere('o.paymentChannel IS NOT NULL')
      .groupBy('o.paymentChannel')
      .getRawMany();

    // 按门店分布（商户管理员级别可见）
    let byStore: any[] = [];
    if (
      emp.role !== EmployeeRole.STORE_MANAGER &&
      emp.role !== EmployeeRole.CASHIER
    ) {
      byStore = await qb
        .clone()
        .leftJoin('o.store', 's')
        .select('s.id', 'storeId')
        .addSelect('s.name', 'storeName')
        .addSelect(
          `SUM(CASE WHEN o.status IN ('paid','partial_refunded') THEN o.paidAmount ELSE 0 END)`,
          'amount',
        )
        .addSelect(
          `SUM(CASE WHEN o.status IN ('paid','partial_refunded') THEN 1 ELSE 0 END)`,
          'count',
        )
        .groupBy('s.id')
        .orderBy('amount', 'DESC')
        .getRawMany();
    }

    // 按员工收款排行榜
    const byEmployee = await qb
      .clone()
      .leftJoin('o.employee', 'e')
      .select('e.id', 'employeeId')
      .addSelect('e.name', 'employeeName')
      .addSelect('e.employeeNo', 'employeeNo')
      .addSelect(
        `SUM(CASE WHEN o.status IN ('paid','partial_refunded') THEN o.paidAmount ELSE 0 END)`,
        'amount',
      )
      .addSelect(
        `SUM(CASE WHEN o.status IN ('paid','partial_refunded') THEN 1 ELSE 0 END)`,
        'count',
      )
      .groupBy('e.id')
      .orderBy('amount', 'DESC')
      .limit(20)
      .getRawMany();

    return {
      period: {
        startDate: start.format('YYYY-MM-DD'),
        endDate: end.format('YYYY-MM-DD'),
        today: start.isSame(dayjs(), 'day'),
      },
      overview: {
        totalOrders: Number(overview.totalOrders || 0),
        successOrders: Number(overview.successOrders || 0),
        totalPaidAmount: Number(overview.totalPaidAmount || 0),
        totalRefundAmount: Number(overview.totalRefundAmount || 0),
        refundOrders: Number(overview.refundOrders || 0),
        avgOrderAmount: Number(overview.avgOrderAmount || 0),
        netIncome: Number(
          (Number(overview.totalPaidAmount || 0) - Number(overview.totalRefundAmount || 0)).toFixed(2),
        ),
        successRate:
          Number(overview.totalOrders || 0) > 0
            ? Math.round(
                (Number(overview.successOrders || 0) / Number(overview.totalOrders || 1)) * 10000,
              ) / 100
            : 0,
      },
      byChannel,
      byStore,
      byEmployee,
    };
  }

  /**
   * 趋势图（按天/小时）
   */
  async trend(
    emp: EmployeePayload,
    dto: SummaryDto & { granularity?: 'day' | 'hour' },
  ) {
    const start = dto.startDate ? dayjs(dto.startDate).startOf('day') : dayjs().subtract(6, 'day').startOf('day');
    const end = dto.endDate ? dayjs(dto.endDate).endOf('day') : dayjs().endOf('day');
    const granularity = dto.granularity ?? 'day';

    const qb = this.orderRepo.createQueryBuilder('o');
    this.appendDataPermission(qb, emp);
    qb.andWhere('o.createdAt BETWEEN :start AND :end', {
      start: start.toDate(),
      end: end.toDate(),
    }).andWhere("o.status IN ('paid','partial_refunded')");

    if (dto.storeId) qb.andWhere('o.storeId = :sid', { sid: dto.storeId });

    let dateExpr: string;
    if (granularity === 'hour') {
      dateExpr = `DATE_FORMAT(o.createdAt, '%Y-%m-%d %H:00')`;
    } else {
      dateExpr = `DATE_FORMAT(o.createdAt, '%Y-%m-%d')`;
    }

    const rows = await qb
      .select(dateExpr, 'date')
      .addSelect('SUM(o.paidAmount)', 'amount')
      .addSelect('COUNT(o.id)', 'count')
      .groupBy('date')
      .orderBy('date', 'ASC')
      .getRawMany();

    return { granularity, startDate: start.format('YYYY-MM-DD'), endDate: end.format('YYYY-MM-DD'), list: rows };
  }

  /**
   * 收银员工作台首页概览（实时）
   */
  async cashierDashboard(emp: EmployeePayload) {
    const today = dayjs().startOf('day');
    const now = dayjs();

    // 今日：本人收款
    const myToday = await this.orderRepo
      .createQueryBuilder('o')
      .where('o.merchantId = :mid', { mid: emp.merchantId })
      .andWhere('o.employeeId = :eid', { eid: emp.id })
      .andWhere('o.createdAt >= :t', { t: today.toDate() })
      .select('COUNT(1)', 'orderCount')
      .addSelect(
        `SUM(CASE WHEN o.status IN ('paid','partial_refunded') THEN o.paidAmount ELSE 0 END)`,
        'amount',
      )
      .addSelect('COALESCE(SUM(o.refundedAmount),0)', 'refund')
      .getRawOne();

    // 门店：今日收款（若有门店）
    let storeToday = null;
    if (emp.storeId) {
      storeToday = await this.orderRepo
        .createQueryBuilder('o')
        .where('o.storeId = :sid', { sid: emp.storeId })
        .andWhere('o.createdAt >= :t', { t: today.toDate() })
        .select('COUNT(1)', 'orderCount')
        .addSelect(
          `SUM(CASE WHEN o.status IN ('paid','partial_refunded') THEN o.paidAmount ELSE 0 END)`,
          'amount',
        )
        .addSelect('COALESCE(SUM(o.refundedAmount),0)', 'refund')
        .getRawOne();
    }

    return {
      serverTime: now.format('YYYY-MM-DD HH:mm:ss'),
      myToday: {
        orderCount: Number(myToday.orderCount || 0),
        amount: Number(myToday.amount || 0),
        refund: Number(myToday.refund || 0),
        net: Number((Number(myToday.amount || 0) - Number(myToday.refund || 0)).toFixed(2)),
      },
      storeToday: storeToday
        ? {
            orderCount: Number(storeToday.orderCount || 0),
            amount: Number(storeToday.amount || 0),
            refund: Number(storeToday.refund || 0),
            net: Number((Number(storeToday.amount || 0) - Number(storeToday.refund || 0)).toFixed(2)),
          }
        : null,
    };
  }

  /**
   * PC端首页大屏总览（老板/管理员视角：今日/本月/本年 + 门店排行 + 渠道占比 + 实时流水）
   */
  async bigScreenDashboard(emp: EmployeePayload) {
    const scope = await this.rbac.resolveDataScopeStoreIds(emp);

    // ========== 时间范围 ==========
    const todayStart = dayjs().startOf('day');
    const todayEnd = dayjs().endOf('day');
    const monthStart = dayjs().startOf('month');
    const yearStart = dayjs().startOf('year');
    const yesterdayStart = dayjs().subtract(1, 'day').startOf('day');
    const yesterdayEnd = dayjs().subtract(1, 'day').endOf('day');

    // 通用过滤builder
    const buildQb = (s: dayjs.Dayjs, e: dayjs.Dayjs) => {
      const qb = this.orderRepo
        .createQueryBuilder('o')
        .where('o.merchantId = :mid', { mid: emp.merchantId })
        .andWhere('o.createdAt BETWEEN :s AND :e', { s: s.toDate(), e: e.toDate() });
      if (scope.selfOnly) qb.andWhere('o.employeeId = :eid', { eid: emp.id });
      if (scope.storeIds) qb.andWhere('o.storeId IN (:...sids)', { sids: scope.storeIds });
      return qb;
    };

    const rangeStat = async (s: dayjs.Dayjs, e: dayjs.Dayjs) => {
      const row = await buildQb(s, e)
        .select('COUNT(DISTINCT o.id)', 'orderCount')
        .addSelect(
          `SUM(CASE WHEN o.status IN ('paid','partial_refunded') THEN o.paidAmount ELSE 0 END)`,
          'paidAmount',
        )
        .addSelect(
          `SUM(CASE WHEN o.status IN ('paid','partial_refunded') THEN 1 ELSE 0 END)`,
          'successCount',
        )
        .addSelect('COALESCE(SUM(o.refundedAmount),0)', 'refundAmount')
        .addSelect(
          `SUM(CASE WHEN o.status IN ('refunded','partial_refunded') THEN 1 ELSE 0 END)`,
          'refundCount',
        )
        .getRawOne();
      const orderCount = Number(row.orderCount || 0);
      const paidAmount = Number(row.paidAmount || 0);
      const refundAmount = Number(row.refundAmount || 0);
      const successCount = Number(row.successCount || 0);
      return {
        orderCount,
        successCount,
        paidAmount,
        refundAmount,
        netAmount: Number((paidAmount - refundAmount).toFixed(2)),
        successRate: orderCount > 0 ? Math.round((successCount / orderCount) * 10000) / 100 : 0,
        avgOrderAmount: successCount > 0 ? Number((paidAmount / successCount).toFixed(2)) : 0,
      };
    };

    const [today, yesterday, thisMonth, thisYear] = await Promise.all([
      rangeStat(todayStart, todayEnd),
      rangeStat(yesterdayStart, yesterdayEnd),
      rangeStat(monthStart, todayEnd),
      rangeStat(yearStart, todayEnd),
    ]);

    // ========== 渠道占比（今日） ==========
    const channelDist = await buildQb(todayStart, todayEnd)
      .andWhere('o.paymentChannel IS NOT NULL')
      .leftJoin('o.payment', 'p')
      .select('o.paymentChannel', 'channel')
      .addSelect(
        `SUM(CASE WHEN o.status IN ('paid','partial_refunded') THEN o.paidAmount ELSE 0 END)`,
        'amount',
      )
      .addSelect('COUNT(DISTINCT o.id)', 'count')
      .groupBy('o.paymentChannel')
      .getRawMany();

    // ========== 门店排行（今日） ==========
    let storeRank: any[] = [];
    if (!scope.selfOnly) {
      const storeQb = buildQb(todayStart, todayEnd)
        .leftJoin('o.store', 'st')
        .select('st.id', 'storeId')
        .addSelect('st.name', 'storeName')
        .addSelect(
          `SUM(CASE WHEN o.status IN ('paid','partial_refunded') THEN o.paidAmount ELSE 0 END)`,
          'amount',
        )
        .addSelect(
          `SUM(CASE WHEN o.status IN ('paid','partial_refunded') THEN 1 ELSE 0 END)`,
          'count',
        );
      if (!scope.storeIds && (emp.role === EmployeeRole.MERCHANT_OWNER || emp.role === EmployeeRole.SUPER_ADMIN || emp.role === EmployeeRole.MERCHANT_ADMIN)) {
        storeQb.addSelect('COALESCE(SUM(o.refundedAmount),0)', 'refundAmount');
      }
      storeRank = await storeQb
        .groupBy('st.id')
        .orderBy('amount', 'DESC')
        .limit(10)
        .getRawMany();
    }

    // ========== 员工收款排行（今日） ==========
    const employeeRank = await buildQb(todayStart, todayEnd)
      .leftJoin('o.employee', 'e')
      .select('e.id', 'employeeId')
      .addSelect('e.name', 'employeeName')
      .addSelect('e.employeeNo', 'employeeNo')
      .addSelect(
        `SUM(CASE WHEN o.status IN ('paid','partial_refunded') THEN o.paidAmount ELSE 0 END)`,
        'amount',
      )
      .addSelect(
        `SUM(CASE WHEN o.status IN ('paid','partial_refunded') THEN 1 ELSE 0 END)`,
        'count',
      )
      .groupBy('e.id')
      .orderBy('amount', 'DESC')
      .limit(10)
      .getRawMany();

    // ========== 近7日趋势 ==========
    const days: { date: string; amount: number; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = dayjs().subtract(i, 'day');
      const s = d.startOf('day');
      const e = d.endOf('day');
      const row = await buildQb(s, e)
        .select(
          `SUM(CASE WHEN o.status IN ('paid','partial_refunded') THEN o.paidAmount ELSE 0 END)`,
          'amount',
        )
        .addSelect(
          `SUM(CASE WHEN o.status IN ('paid','partial_refunded') THEN 1 ELSE 0 END)`,
          'count',
        )
        .getRawOne();
      days.push({
        date: d.format('MM-DD'),
        amount: Number(row.amount || 0),
        count: Number(row.count || 0),
      });
    }

    // ========== 实时流水（最近10笔） ==========
    const recentQb = this.orderRepo
      .createQueryBuilder('o')
      .leftJoinAndSelect('o.employee', 'e')
      .leftJoinAndSelect('o.store', 's')
      .leftJoinAndSelect('o.payment', 'p')
      .where('o.merchantId = :mid', { mid: emp.merchantId })
      .andWhere("o.status IN ('paid','partial_refunded','refunded')");
    if (scope.selfOnly) recentQb.andWhere('o.employeeId = :eid', { eid: emp.id });
    if (scope.storeIds) recentQb.andWhere('o.storeId IN (:...sids)', { sids: scope.storeIds });
    const recentOrders = await recentQb
      .orderBy('o.paidAt', 'DESC')
      .limit(10)
      .getMany();

    // ========== 计数 ==========
    const storeCount = scope.selfOnly
      ? 0
      : await this.storeRepo.count({
          where: (emp.role === EmployeeRole.SUPER_ADMIN ? {} : { merchantId: emp.merchantId }) as any,
        });
    const employeeCount = await this.employeeRepo
      .createQueryBuilder('e')
      .where('e.merchantId = :mid', { mid: emp.merchantId })
      .andWhere("e.status = 'active'")
      .getCount();
    const pendingRefundCount = await this.refundRepo
      .createQueryBuilder('r')
      .leftJoin('r.order', 'o')
      .where('o.merchantId = :mid', { mid: emp.merchantId })
      .andWhere("r.status = 'pending'")
      .getCount();

    return {
      overviewCards: {
        today,
        yesterday,
        thisMonth,
        thisYear,
        // 环比
        todayVsYesterday: {
          paidAmountDelta: Number((today.paidAmount - yesterday.paidAmount).toFixed(2)),
          paidAmountRate:
            yesterday.paidAmount > 0
              ? Math.round(((today.paidAmount - yesterday.paidAmount) / yesterday.paidAmount) * 10000) / 100
              : today.paidAmount > 0
              ? 100
              : 0,
          orderCountDelta: today.orderCount - yesterday.orderCount,
        },
        storeCount,
        employeeCount,
        pendingRefundCount,
      },
      charts: {
        last7DaysTrend: days,
        channelDist,
        storeRank,
        employeeRank,
      },
      realtime: {
        recentOrders: recentOrders.map((o) => ({
          orderNo: o.orderNo,
          paidAmount: o.paidAmount,
          channel: o.paymentChannel,
          status: o.status,
          paidAt: o.paidAt || o.createdAt,
          employeeName: o.employee?.name,
          storeName: o.store?.name,
          outTradeNo: o.payment?.outTradeNo,
        })),
      },
      serverTime: new Date(),
    };
  }
}

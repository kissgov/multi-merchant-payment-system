import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, In } from 'typeorm';
import * as dayjs from 'dayjs';

import { Order, OrderStatus } from '../../entities/order.entity';
import { Payment, PaymentStatus } from '../../entities/payment.entity';

/**
 * 订单定时任务服务
 * - 每 2 分钟扫描一次超时未支付订单并自动关闭
 * - 关闭条件：status=pending 且 (expireAt 已过期 或 创建超过 30 分钟)
 * - 同步关闭关联的 payment 记录，避免脏数据
 */
@Injectable()
export class OrderSchedulerService {
  private readonly logger = new Logger(OrderSchedulerService.name);

  /** 兜底超时时间（分钟）：即使未设置 expireAt，创建超过该时长也关闭 */
  private readonly FALLBACK_TIMEOUT_MINUTES = 30;

  /** 单次批量处理上限，避免单次任务执行过久 */
  private readonly BATCH_SIZE = 500;

  constructor(
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
  ) {}

  /**
   * 每 2 分钟执行一次超时订单清理
   * Cron 表达式: 0 (每2分钟) * * * *
   */
  @Cron('0 */2 * * * *', {
    name: 'close-timeout-orders',
    timeZone: 'Asia/Shanghai',
  })
  async handleCloseTimeoutOrders() {
    const startAt = Date.now();
    try {
      const now = new Date();
      const fallback = dayjs(now)
        .subtract(this.FALLBACK_TIMEOUT_MINUTES, 'minute')
        .toDate();

      // 1) 关闭已过期订单（expireAt <= now）
      const expiredByExpireAt = await this.orderRepo.find({
        where: {
          status: OrderStatus.PENDING,
          expireAt: LessThan(now),
        },
        take: this.BATCH_SIZE,
        order: { createdAt: 'ASC' },
      });

      // 2) 兜底：无 expireAt 但创建超过 30 分钟的订单
      const expiredByFallback = await this.orderRepo.find({
        where: {
          status: OrderStatus.PENDING,
          expireAt: null as any,
          createdAt: LessThan(fallback),
        },
        take: this.BATCH_SIZE,
        order: { createdAt: 'ASC' },
      });

      // 合并去重
      const seen = new Set<string>();
      const orders = [...expiredByExpireAt, ...expiredByFallback].filter((o) => {
        if (seen.has(o.id)) return false;
        seen.add(o.id);
        return true;
      });

      if (orders.length === 0) return;

      const orderIds = orders.map((o) => o.id);
      const orderNos = orders.map((o) => o.orderNo);

      // 批量更新订单状态为 CLOSED
      await this.orderRepo.update(
        { id: In(orderIds) },
        { status: OrderStatus.CLOSED },
      );

      // 批量关闭关联的未完成支付记录（待支付/等待用户付款）
      const payResult = await this.paymentRepo.update(
        { orderId: In(orderIds), status: In([PaymentStatus.PENDING, PaymentStatus.WAITING_PAYER]) },
        { status: PaymentStatus.CLOSED },
      );

      const costMs = Date.now() - startAt;
      this.logger.log(
        `[定时任务] 关闭超时订单 ${orders.length} 笔，` +
          `关联支付记录 ${payResult.affected ?? 0} 条，` +
          `耗时 ${costMs}ms。订单号: ${orderNos.slice(0, 5).join(', ')}${orderNos.length > 5 ? '...' : ''}`,
      );
    } catch (e) {
      this.logger.error(
        `[定时任务] 关闭超时订单失败: ${e.message}`,
        e.stack,
      );
    }
  }
}

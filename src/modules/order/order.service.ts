import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, Between, In, Brackets } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import * as dayjs from 'dayjs';

import {
  Order,
  OrderStatus,
} from '../../entities/order.entity';
import { PaymentChannel } from '../../entities/enums';
import { Payment, PaymentStatus } from '../../entities/payment.entity';
import { Refund, RefundStatus } from '../../entities/refund.entity';
import { Employee, EmployeeStatus, EmployeeRole } from '../../entities/employee.entity';
import { Merchant } from '../../entities/merchant.entity';
import { EmployeePayload } from '../../common/decorators/current-employee.decorator';
import { parsePagination } from '../../common/utils/page';

export interface QueryOrdersDto {
  page?: number;
  pageSize?: number;
  startDate?: string;
  endDate?: string;
  status?: OrderStatus;
  channel?: PaymentChannel;
  keyword?: string;
  storeId?: string;
  employeeId?: string;
}

export interface QueryResult<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface RefundRequest {
  orderId: string;
  refundAmount: number;
  reasonCode?: string;
  reason: string;
}

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

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
  ) {}

  /**
   * 订单列表（支持多维度查询）
   * 权限：收银员只能看自己，店长看门店，商户管理员看全商户
   */
  async queryOrders(
    emp: EmployeePayload,
    dto: QueryOrdersDto,
  ): Promise<QueryResult<Order & { payment?: Payment }>> {
    const { page, pageSize, skip } = parsePagination(dto.page, dto.pageSize, {
      maxPageSize: 100,
    });

    const qb = this.orderRepo
      .createQueryBuilder('o')
      .leftJoinAndSelect('o.payment', 'p')
      .leftJoinAndSelect('o.employee', 'e')
      .leftJoinAndSelect('o.store', 's')
      .where('o.merchantId = :mid', { mid: emp.merchantId });

    // 数据权限
    if (emp.role === EmployeeRole.CASHIER) {
      qb.andWhere('o.employeeId = :eid', { eid: emp.id });
    } else if (
      emp.role === EmployeeRole.STORE_MANAGER &&
      emp.storeId
    ) {
      qb.andWhere('o.storeId = :sid', { sid: emp.storeId });
    } else if (dto.storeId) {
      qb.andWhere('o.storeId = :sid', { sid: dto.storeId });
    }
    if (dto.employeeId) {
      qb.andWhere('o.employeeId = :eid', { eid: dto.employeeId });
    }

    if (dto.status) qb.andWhere('o.status = :status', { status: dto.status });
    if (dto.channel) qb.andWhere('o.paymentChannel = :ch', { ch: dto.channel });

    if (dto.startDate && dto.endDate) {
      qb.andWhere('o.createdAt BETWEEN :start AND :end', {
        start: dayjs(dto.startDate).startOf('day').toDate(),
        end: dayjs(dto.endDate).endOf('day').toDate(),
      });
    }

    if (dto.keyword) {
      qb.andWhere(
        new Brackets((qb2) => {
          qb2
            .where('o.orderNo LIKE :kw', { kw: `%${dto.keyword}%` })
            .orWhere('p.outTradeNo LIKE :kw', { kw: `%${dto.keyword}%` })
            .orWhere('o.customerPhone LIKE :kw', { kw: `%${dto.keyword}%` });
        }),
      );
    }

    qb.orderBy('o.createdAt', 'DESC').skip(skip).take(pageSize);

    const [list, total] = await qb.getManyAndCount();
    return { list, total, page, pageSize };
  }

  /**
   * 订单详情
   */
  async getOrderDetail(orderId: string, emp: EmployeePayload): Promise<any> {
    const order = await this.orderRepo.findOne({
      where: { id: orderId, merchantId: emp.merchantId },
      relations: ['payment', 'employee', 'store', 'refund'],
    });
    if (!order) throw new NotFoundException('订单不存在');
    // 数据权限
    if (emp.role === EmployeeRole.CASHIER && order.employeeId !== emp.id) {
      throw new ForbiddenException('无权查看该订单');
    }
    if (
      emp.role === EmployeeRole.STORE_MANAGER &&
      order.storeId !== emp.storeId
    ) {
      throw new ForbiddenException('无权查看其他门店订单');
    }
    return order;
  }

  /**
   * 根据订单号查询
   */
  async getByOrderNo(orderNo: string, emp: EmployeePayload) {
    const order = await this.orderRepo.findOne({
      where: { orderNo, merchantId: emp.merchantId },
      relations: ['payment', 'employee', 'store'],
    });
    if (!order) throw new NotFoundException('订单不存在');
    return order;
  }

  /**
   * 发起退款
   */
  async refund(
    emp: EmployeePayload,
    req: RefundRequest,
  ): Promise<{
    refundId: string;
    refundNo: string;
    status: RefundStatus;
    refundAmount: number;
  }> {
    // 1. 校验员工退款权限
    const employee = await this.employeeRepo.findOneOrFail({
      where: { id: emp.id },
    });
    if (!employee.canRefund) {
      throw new ForbiddenException('您没有退款权限，请联系店长或管理员');
    }
    if (employee.status !== EmployeeStatus.ACTIVE) {
      throw new ForbiddenException('员工账号已禁用');
    }
    if (
      employee.singleRefundLimit > 0 &&
      req.refundAmount > employee.singleRefundLimit
    ) {
      throw new ForbiddenException(
        `超过单笔退款限额￥${employee.singleRefundLimit}`,
      );
    }

    // 2. 校验订单
    const order = await this.orderRepo.findOne({
      where: { id: req.orderId, merchantId: emp.merchantId },
      relations: ['payment'],
    });
    if (!order) throw new NotFoundException('订单不存在');

    if (
      ![OrderStatus.PAID, OrderStatus.PARTIAL_REFUNDED].includes(order.status)
    ) {
      throw new BadRequestException(
        `订单当前状态[${order.status}]不允许退款，仅已支付订单可退款`,
      );
    }

    const payment = order.payment;
    if (!payment || payment.status !== PaymentStatus.SUCCESS) {
      throw new BadRequestException('该订单未成功支付，无法退款');
    }

    // 3. 校验金额
    const remaining = Number(
      (Number(order.paidAmount) - Number(order.refundedAmount || 0)).toFixed(2),
    );
    const refundAmount = Number(req.refundAmount.toFixed(2));
    if (refundAmount <= 0) throw new BadRequestException('退款金额必须大于0');
    if (refundAmount > remaining) {
      throw new BadRequestException(
        `退款金额超限，当前可退款金额￥${remaining}`,
      );
    }

    // 4. 校验数据权限
    if (emp.role === EmployeeRole.CASHIER && order.employeeId !== emp.id) {
      throw new ForbiddenException('收银员只能退自己操作收款的订单');
    }
    if (
      emp.role === EmployeeRole.STORE_MANAGER &&
      order.storeId !== emp.storeId
    ) {
      throw new ForbiddenException('店长只能退回本门店的订单');
    }

    // 5. 生成退款单并调用渠道退款
    const refundNo = `R${dayjs().format('YYYYMMDDHHmmss')}${Math.floor(Math.random() * 1000000).toString().padStart(6, '0')}`;
    const merchant = await this.merchantRepo.findOneOrFail({
      where: { id: emp.merchantId },
    });

    return this.dataSource.transaction(async (manager) => {
      // 创建退款记录
      const refund = manager.create(Refund, {
        refundNo,
        orderId: order.id,
        operatorId: emp.id,
        paymentChannel: order.paymentChannel,
        status: RefundStatus.PROCESSING,
        originalOrderAmount: order.paidAmount,
        refundAmount,
        reasonCode: req.reasonCode,
        reason: req.reason,
        refundInitiatedAt: new Date(),
      });
      const savedRefund = await manager.save(refund);

      // 调用渠道退款接口
      let channelSuccess = true;
      let outRefundNo: string | undefined;
      try {
        if (order.paymentChannel === PaymentChannel.ALIPAY) {
          outRefundNo = await this.alipayRefund(merchant, order, refundAmount, refundNo);
        } else {
          outRefundNo = await this.wechatRefund(merchant, order, refundAmount, refundNo);
        }
      } catch (err) {
        this.logger.error(`[退款] 渠道退款失败: ${err.message}`);
        channelSuccess = false;
        await manager.update(
          Refund,
          savedRefund.id,
          {
            status: RefundStatus.FAILED,
            errorCode: 'CHANNEL_ERROR',
            errorMessage: err.message,
          },
        );
        throw new BadRequestException(`退款失败: ${err.message}`);
      }

      // 退款成功：更新退款记录 & 订单累计退款 & 订单状态
      const newRefunded = Number(
        (Number(order.refundedAmount || 0) + refundAmount).toFixed(2),
      );
      const isFullRefund = Math.abs(newRefunded - Number(order.paidAmount)) < 0.01;
      await manager.update(
        Refund,
        savedRefund.id,
        {
          status: channelSuccess ? RefundStatus.SUCCESS : RefundStatus.FAILED,
          outRefundNo,
          refundSucceededAt: new Date(),
        },
      );
      await manager.update(Order, order.id, {
        refundedAmount: newRefunded,
        status: isFullRefund ? OrderStatus.REFUNDED : OrderStatus.PARTIAL_REFUNDED,
      });
      await manager.update(Payment, payment.id, {
        status: isFullRefund ? PaymentStatus.REFUNDED : PaymentStatus.REFUNDING,
      });

      return {
        refundId: savedRefund.id,
        refundNo,
        status: RefundStatus.SUCCESS,
        refundAmount,
      };
    });
  }

  private async alipayRefund(
    merchant: Merchant,
    order: Order,
    amount: number,
    refundNo: string,
  ): Promise<string> {
    // 调用 alipay.trade.refund 接口
    // 实际代码请集成 alipay-sdk
    this.logger.log(`[支付宝退款] 订单=${order.orderNo} 金额=${amount} 退款号=${refundNo}`);
    return `ALIPAY_REFUND_${Date.now()}`; // mock
  }

  private async wechatRefund(
    merchant: Merchant,
    order: Order,
    amount: number,
    refundNo: string,
  ): Promise<string> {
    // 调用 /v3/refund/domestic/refunds
    this.logger.log(`[微信退款] 订单=${order.orderNo} 金额=${amount} 退款号=${refundNo}`);
    return `WECHAT_REFUND_${Date.now()}`; // mock
  }

  /**
   * 撤销/关闭未支付订单
   */
  async closeOrder(orderId: string, emp: EmployeePayload) {
    const order = await this.orderRepo.findOne({
      where: { id: orderId, merchantId: emp.merchantId },
      relations: ['payment'],
    });
    if (!order) throw new NotFoundException('订单不存在');
    if (![OrderStatus.PENDING].includes(order.status)) {
      throw new BadRequestException('只能关闭待支付订单');
    }
    if (emp.role === EmployeeRole.CASHIER && order.employeeId !== emp.id) {
      throw new ForbiddenException('无权关闭他人订单');
    }
    await this.orderRepo.update(order.id, { status: OrderStatus.CLOSED });
    if (order.payment) {
      await this.paymentRepo.update(order.payment.id, {
        status: PaymentStatus.CLOSED,
      });
    }
    return { message: '订单已关闭' };
  }
}

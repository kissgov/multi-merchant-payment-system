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
import { QueryOrdersDto } from './dto/query-orders.dto';
import { CreateRefundRequestDto } from '../refund/dto/create-refund.dto';
import { RefundService } from '../refund/refund.service';

export interface QueryResult<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
}

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly refundService: RefundService,
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
   * 发起退款（兼容旧接口）
   * 内部委托 RefundService.applyRefund，保证逻辑一致（含 RBAC 数据权限 + 审批工作流 + 审计）
   */
  async refund(
    emp: EmployeePayload,
    req: CreateRefundRequestDto & { orderId: string },
  ): Promise<{
    refundId: string;
    refundNo: string;
    status: RefundStatus;
    refundAmount: number;
  }> {
    // 兼容旧字段：reasonCode 在旧接口中是可选，新 DTO 是必填。若用户没传则用默认 "other"
    const reasonCode = req.reasonCode || 'other';
    const res = await this.refundService.applyRefund(
      emp,
      {
        orderId: req.orderId,
        refundAmount: req.refundAmount,
        reasonCode,
        reason: req.reason,
        evidenceImages: (req as any).evidenceImages,
        notifyCustomer: (req as any).notifyCustomer,
      },
    );
    return {
      refundId: res.refundId,
      refundNo: res.refundNo,
      status: res.workflowStatus === 'success' ? RefundStatus.SUCCESS : RefundStatus.PENDING,
      refundAmount: res.amount,
    };
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

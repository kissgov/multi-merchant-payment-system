import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { BadRequestException } from '@nestjs/common';

import { RefundService } from './refund.service';
import { PaymentService } from '../payment/payment.service';
import { RbacService } from '../rbac/rbac.service';
import { AuditLogService } from '../audit/audit-log.service';
import { Merchant } from '../../entities/merchant.entity';
import { Store } from '../../entities/store.entity';
import { Employee, EmployeeRole, EmployeeStatus } from '../../entities/employee.entity';
import { Order, OrderStatus, OrderSource } from '../../entities/order.entity';
import { Payment, PaymentStatus, PaymentMethod } from '../../entities/payment.entity';
import { Refund, RefundStatus } from '../../entities/refund.entity';
import { PaymentChannel } from '../../entities/enums';
import { createTestDataSource } from '../../../test/helpers/db';
import { EmployeePayload } from '../../common/decorators/current-employee.decorator';

/**
 * R2 风险测试：退款并发防超退（悲观锁 + 事务内重校验）
 *
 * 风险命名：并发退款场景下，若事务内不重新校验可退金额，两笔退款可分别通过早期检查后
 *          双双提交，导致 refundedAmount 超过 paidAmount（资金损失）。
 *          applyRefund 必须在事务内用悲观锁锁定订单行，并重新校验 currentRemaining。
 *
 * 测试设计（确定性，不依赖真实并发时序）：
 * - 早期检查读取 refundedAmount=0（refund 60 <= remaining 100，通过）
 * - 在渠道调用 mock 中更新 DB 订单 refundedAmount=60（模拟并发退款已提交）
 * - 事务内悲观锁重读 refundedAmount=60 → currentRemaining=40 → refund 60 > 40 → 抛异常
 * - 验证：退款单未创建（事务回滚），订单 refundedAmount 仍为 60
 *
 * R3 风险测试：渠道调用必须在事务外（避免长事务占用 DB 连接）
 * - 上述测试中渠道调用 mock 能在事务前更新 DB 并被事务读到，证明渠道调用在事务外。
 * - 额外断言：渠道调用 mock 被调用（即进入了事务前分支）。
 */
describe('RefundService.applyRefund (R2/R3: 并发防超退 + 渠道调用在事务外)', () => {
  let ds: DataSource;
  let service: RefundService;
  let paymentService: { alipayRefund: jest.Mock; wechatRefund: jest.Mock };

  const MERCHANT_ID = 'm-0001';
  const STORE_ID = 's-0001';
  const EMP_ID = 'e-0001';

  const emp: EmployeePayload = {
    id: EMP_ID,
    employeeNo: 'E001',
    merchantId: MERCHANT_ID,
    storeId: STORE_ID,
    name: '收银员甲',
    username: 'cashier01',
    role: EmployeeRole.CASHIER,
  };

  beforeAll(async () => {
    ds = await createTestDataSource();
  });

  afterAll(async () => {
    await ds.destroy();
  });

  beforeEach(async () => {
    // 清空表，保证每个测试独立
    await ds.getRepository(Refund).clear();
    await ds.getRepository(Payment).clear();
    await ds.getRepository(Order).clear();
    await ds.getRepository(Employee).clear();
    await ds.getRepository(Store).clear();
    await ds.getRepository(Merchant).clear();

    paymentService = {
      alipayRefund: jest.fn(),
      wechatRefund: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        RefundService,
        { provide: DataSource, useValue: ds },
        { provide: getRepositoryToken(Order), useValue: ds.getRepository(Order) },
        { provide: getRepositoryToken(Payment), useValue: ds.getRepository(Payment) },
        { provide: getRepositoryToken(Refund), useValue: ds.getRepository(Refund) },
        { provide: getRepositoryToken(Employee), useValue: ds.getRepository(Employee) },
        { provide: getRepositoryToken(Merchant), useValue: ds.getRepository(Merchant) },
        { provide: AuditLogService, useValue: { log: jest.fn() } },
        {
          provide: RbacService,
          useValue: {
            resolveDataScopeStoreIds: jest
              .fn()
              .mockResolvedValue({ storeIds: null, selfOnly: false }),
          },
        },
        { provide: PaymentService, useValue: paymentService },
      ],
    }).compile();
    service = moduleRef.get(RefundService);
  });

  /** 创建一套完整的已支付订单夹具 */
  async function seedPaidOrder(opts: { paidAmount?: number; refundedAmount?: number; channel?: PaymentChannel } = {}) {
    const paidAmount = opts.paidAmount ?? 100;
    const refundedAmount = opts.refundedAmount ?? 0;
    const channel = opts.channel ?? PaymentChannel.ALIPAY;

    await ds.getRepository(Merchant).save({
      id: MERCHANT_ID,
      name: '测试商户',
      merchantNo: 'M001',
      platformFeeRate: 0.0038,
    });
    await ds.getRepository(Store).save({
      id: STORE_ID,
      name: '测试门店',
      storeNo: 'S001',
      merchantId: MERCHANT_ID,
      address: '测试地址',
    });
    await ds.getRepository(Employee).save({
      id: EMP_ID,
      employeeNo: 'E001',
      merchantId: MERCHANT_ID,
      storeId: STORE_ID,
      name: '收银员甲',
      username: 'cashier01',
      password: '$2a$10$dummyhashdummyhashdummyhashdummyhashdummyhashdummy',
      role: EmployeeRole.CASHIER,
      status: EmployeeStatus.ACTIVE,
      canAcceptPayment: true,
      canRefund: true,
      singlePaymentLimit: 0,
      dailyPaymentLimit: 0,
      singleRefundLimit: 0,
    });

    const order = await ds.getRepository(Order).save({
      orderNo: 'O_TEST_0001',
      merchantId: MERCHANT_ID,
      storeId: STORE_ID,
      employeeId: EMP_ID,
      totalAmount: paidAmount,
      discountAmount: 0,
      paidAmount,
      refundedAmount,
      paymentChannel: channel,
      status: refundedAmount > 0 ? OrderStatus.PARTIAL_REFUNDED : OrderStatus.PAID,
      source: OrderSource.POS_APP,
      subject: '测试订单',
      operatorName: '收银员甲',
    });

    await ds.getRepository(Payment).save({
      paymentNo: 'P_TEST_0001',
      orderId: order.id,
      paymentChannel: channel,
      paymentMethod: PaymentMethod.ALIPAY_QR,
      status: PaymentStatus.SUCCESS,
      amount: paidAmount,
      channelFee: 0,
      platformFee: 0,
      merchantNetAmount: paidAmount,
    });

    return order;
  }

  it('R2: 事务内重校验捕获并发超退 → 抛异常且不创建退款单', async () => {
    const order = await seedPaidOrder({ paidAmount: 100, refundedAmount: 0 });

    // 渠道调用 mock：在事务前更新订单 refundedAmount=60（模拟并发退款已提交）
    // 早期检查读到 refunded=0（通过），事务内重读 refunded=60 → remaining=40 → refund 60 > 40 → 抛异常
    paymentService.alipayRefund.mockImplementation(async () => {
      await ds.getRepository(Order).update(order.id, { refundedAmount: 60, status: OrderStatus.PARTIAL_REFUNDED });
      return 'mock-channel-refund-no';
    });

    await expect(
      service.applyRefund(emp, {
        orderId: order.id,
        refundAmount: 60,
        reasonCode: 'GOODS_DEFECT',
        reason: '商品质量问题',
      }),
    ).rejects.toThrow(/退款金额超限.*可能已被其他退款占用/);

    // 验证：退款单未创建（事务回滚）
    const refunds = await ds.getRepository(Refund).find();
    expect(refunds).toHaveLength(0);

    // 订单 refundedAmount 保持渠道调用 mock 设置的 60（事务回滚不影响已提交的并发退款）
    const finalOrder = await ds.getRepository(Order).findOne({ where: { id: order.id } });
    expect(Number(finalOrder!.refundedAmount)).toBe(60);
  });

  it('R3: 渠道调用在事务外执行（mock 被调用，且能在事务前修改 DB）', async () => {
    const order = await seedPaidOrder({ paidAmount: 100, refundedAmount: 0 });

    paymentService.alipayRefund.mockImplementation(async () => {
      // 若渠道调用在事务内，此处的独立 update 会死锁或被事务隔离；
      // 能成功更新并返回，证明渠道调用在事务外
      await ds.getRepository(Order).update(order.id, { refundedAmount: 60 });
      return 'mock-channel-refund-no';
    });

    await expect(
      service.applyRefund(emp, {
        orderId: order.id,
        refundAmount: 60,
        reasonCode: 'GOODS_DEFECT',
        reason: '商品质量问题',
      }),
    ).rejects.toThrow();

    // R3 断言：渠道调用 mock 确实被调用（说明进入了"事务前渠道调用"分支）
    expect(paymentService.alipayRefund).toHaveBeenCalledTimes(1);
  });

  it('R2 正向：无并发时退款成功，订单 refundedAmount 与状态正确更新', async () => {
    const order = await seedPaidOrder({ paidAmount: 100, refundedAmount: 0 });

    paymentService.alipayRefund.mockResolvedValue('mock-channel-refund-no');

    const result = await service.applyRefund(emp, {
      orderId: order.id,
      refundAmount: 60,
      reasonCode: 'GOODS_DEFECT',
      reason: '商品质量问题',
    });

    expect(result.workflowStatus).toBe('success');
    expect(result.amount).toBe(60);

    // 订单 refundedAmount=60，状态为部分退款
    const finalOrder = await ds.getRepository(Order).findOne({ where: { id: order.id } });
    expect(Number(finalOrder!.refundedAmount)).toBe(60);
    expect(finalOrder!.status).toBe(OrderStatus.PARTIAL_REFUNDED);

    // 退款单已创建且状态为 success
    const refunds = await ds.getRepository(Refund).find();
    expect(refunds).toHaveLength(1);
    expect(refunds[0].status).toBe(RefundStatus.SUCCESS);
    expect(Number(refunds[0].refundAmount)).toBe(60);
    expect(refunds[0].outRefundNo).toBe('mock-channel-refund-no');
  });

  it('R2 早期检查：退款金额超过可退余额 → 早期拒绝（不调用渠道）', async () => {
    const order = await seedPaidOrder({ paidAmount: 100, refundedAmount: 0 });

    await expect(
      service.applyRefund(emp, {
        orderId: order.id,
        refundAmount: 150, // 超过 paidAmount=100
        reasonCode: 'GOODS_DEFECT',
        reason: '商品质量问题',
      }),
    ).rejects.toThrow(/退款金额超限，可退款￥100/);

    // 早期拒绝：不应调用渠道
    expect(paymentService.alipayRefund).not.toHaveBeenCalled();
  });

  it('R2 部分退款后再退剩余金额 → 成功（验证累计 refundedAmount 正确）', async () => {
    // 已退 60，再退 40（remaining=40）
    const order = await seedPaidOrder({ paidAmount: 100, refundedAmount: 60 });

    paymentService.alipayRefund.mockResolvedValue('mock-channel-refund-no-2');

    const result = await service.applyRefund(emp, {
      orderId: order.id,
      refundAmount: 40,
      reasonCode: 'GOODS_DEFECT',
      reason: '继续退款',
    });

    expect(result.workflowStatus).toBe('success');

    const finalOrder = await ds.getRepository(Order).findOne({ where: { id: order.id } });
    expect(Number(finalOrder!.refundedAmount)).toBe(100);
    expect(finalOrder!.status).toBe(OrderStatus.REFUNDED); // 全额退款
  });
});

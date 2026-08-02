import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { PaymentService } from './payment.service';
import { Merchant, MerchantStatus } from '../../entities/merchant.entity';
import { Store, StoreStatus } from '../../entities/store.entity';
import { Employee, EmployeeRole, EmployeeStatus } from '../../entities/employee.entity';
import { Order, OrderStatus, OrderSource } from '../../entities/order.entity';
import { Payment, PaymentStatus, PaymentMethod } from '../../entities/payment.entity';
import { PaymentChannel } from '../../entities/enums';
import { AuditLogService } from '../audit/audit-log.service';
import { createTestDataSource } from '../../../test/helpers/db';

// Mock alipay-sdk：构造函数返回带 checkNotifySign 的实例，验签始终通过
const mockCheckNotifySign = jest.fn().mockReturnValue(true);
jest.mock('alipay-sdk', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      checkNotifySign: mockCheckNotifySign,
      exec: jest.fn(),
    })),
  };
});
jest.mock('alipay-sdk/lib/form', () => ({ __esModule: true, default: class {} }));

/**
 * R4 风险测试：支付回调幂等（乐观锁防重复入账）
 *
 * 风险命名：支付渠道会对同一笔交易发送多次回调通知（重试机制）。若回调处理非幂等，
 *          重复通知会导致订单状态被反复更新、payment 反复写入，极端情况下重复入账。
 *          handleAlipayNotify 必须用乐观锁（WHERE status=pending）确保只处理一次。
 *
 * 测试设计：
 * - 第一次回调：订单 pending → paid，payment → success，写入 outTradeNo
 * - 第二次回调（重复通知）：乐观锁 affected=0，跳过处理，不重复写入
 * - 验证：payment.outTradeNo/payerAccount 仅被设置一次，订单 paidAt 不变
 */
describe('PaymentService.handleAlipayNotify (R4: 回调幂等防重复入账)', () => {
  let ds: DataSource;
  let service: PaymentService;

  const MERCHANT_ID = 'm-notify-001';
  const STORE_ID = 's-notify-001';
  const EMP_ID = 'e-notify-001';

  beforeAll(async () => {
    ds = await createTestDataSource();
  });

  afterAll(async () => {
    await ds.destroy();
  });

  beforeEach(async () => {
    await ds.getRepository(Payment).clear();
    await ds.getRepository(Order).clear();
    await ds.getRepository(Employee).clear();
    await ds.getRepository(Store).clear();
    await ds.getRepository(Merchant).clear();
    mockCheckNotifySign.mockClear();
  });

  /**
   * 手动构造 PaymentService：注入真实 DataSource 下的 repo 与 mock ConfigService，
   * 避免完整 Nest module 装配的开销，同时让事务/乐观锁走真实 sqlite 路径。
   */
  async function buildService(notifyBaseUrl = 'https://pay.example.com'): Promise<PaymentService> {
    const configService: any = {
      get: (k: string) => (k === 'PAYMENT_NOTIFY_BASE_URL' ? notifyBaseUrl : undefined),
    };
    const auditLogService: any = { log: jest.fn() };
    const svc: any = new (PaymentService as any)(
      ds,
      configService,
      auditLogService,
      ds.getRepository(Merchant),
      ds.getRepository(Store),
      ds.getRepository(Employee),
      ds.getRepository(Order),
      ds.getRepository(Payment),
    );
    return svc;
  }

  async function seedPendingOrder() {
    await ds.getRepository(Merchant).save({
      id: MERCHANT_ID,
      name: '回调测试商户',
      merchantNo: 'MN001',
      alipayAppId: 'alipay-appid-001',
      alipayPrivateKey: 'fake-private-key',
      alipayPublicKey: 'fake-public-key',
      alipaySandbox: false,
      platformFeeRate: 0.0038,
      status: MerchantStatus.ACTIVE,
    });
    await ds.getRepository(Store).save({
      id: STORE_ID,
      name: '回调测试门店',
      storeNo: 'SN001',
      merchantId: MERCHANT_ID,
      address: '测试地址',
      status: StoreStatus.ACTIVE,
    });
    await ds.getRepository(Employee).save({
      id: EMP_ID,
      employeeNo: 'E001',
      merchantId: MERCHANT_ID,
      storeId: STORE_ID,
      name: '收银员',
      username: 'cashier',
      password: '$2a$10$dummy',
      role: EmployeeRole.CASHIER,
      status: EmployeeStatus.ACTIVE,
      canAcceptPayment: true,
      canRefund: true,
    });

    const order = await ds.getRepository(Order).save({
      orderNo: 'O_NOTIFY_0001',
      merchantId: MERCHANT_ID,
      storeId: STORE_ID,
      employeeId: EMP_ID,
      totalAmount: 88.5,
      discountAmount: 0,
      paidAmount: 88.5,
      refundedAmount: 0,
      paymentChannel: PaymentChannel.ALIPAY,
      status: OrderStatus.PENDING,
      source: OrderSource.POS_APP,
      subject: '回调测试订单',
      operatorName: '收银员',
    });

    await ds.getRepository(Payment).save({
      paymentNo: 'P_NOTIFY_0001',
      orderId: order.id,
      paymentChannel: PaymentChannel.ALIPAY,
      paymentMethod: PaymentMethod.ALIPAY_QR,
      status: PaymentStatus.PENDING,
      amount: 88.5,
      channelFee: 0,
      platformFee: 0,
      merchantNetAmount: 0,
    });

    return order;
  }

  const buildNotifyParams = (overrides: Partial<any> = {}) => ({
    out_trade_no: 'O_NOTIFY_0001',
    trade_no: 'ALIPAY_TRADE_2026080200001',
    trade_status: 'TRADE_SUCCESS',
    gmt_payment: '2026-08-02 10:00:00',
    buyer_logon_id: '138****0001',
    buyer_user_name: '张三',
    ...overrides,
  });

  it('第一次回调：订单 pending → paid，payment → success，写入 outTradeNo', async () => {
    await seedPendingOrder();
    service = await buildService();

    const result = await service.handleAlipayNotify(buildNotifyParams());
    expect(result).toBe(true);

    const order = await ds.getRepository(Order).findOne({ where: { orderNo: 'O_NOTIFY_0001' } });
    expect(order!.status).toBe(OrderStatus.PAID);
    expect(order!.paidAt).toBeTruthy();

    const payment = await ds.getRepository(Payment).findOne({ where: { paymentNo: 'P_NOTIFY_0001' } });
    expect(payment!.status).toBe(PaymentStatus.SUCCESS);
    expect(payment!.outTradeNo).toBe('ALIPAY_TRADE_2026080200001');
    expect(payment!.payerAccount).toBe('138****0001');
  });

  it('R4: 重复回调（第二次带不同 trade_no）→ 乐观锁 affected=0，第一次单号被保留不覆盖', async () => {
    await seedPendingOrder();
    service = await buildService();

    // 第一次回调：trade_no = TRADE_001
    await service.handleAlipayNotify(buildNotifyParams({ trade_no: 'TRADE_001' }));

    // 第二次回调：渠道重发，trade_no 不同（模拟渠道侧重新分配）
    const result2 = await service.handleAlipayNotify(buildNotifyParams({ trade_no: 'TRADE_002' }));
    expect(result2).toBe(true);

    // 验证：幂等 —— 第一次的 trade_no 被保留，第二次未覆盖
    const payment = await ds.getRepository(Payment).findOne({ where: { paymentNo: 'P_NOTIFY_0001' } });
    expect(payment!.outTradeNo).toBe('TRADE_001');

    // 验签被调用两次（每次回调都验签），但乐观锁保证业务只处理一次
    expect(mockCheckNotifySign).toHaveBeenCalledTimes(2);
  });

  it('R4: 非 TRADE_SUCCESS 状态（如 WAIT_BUYER_PAY）→ 不更新订单', async () => {
    await seedPendingOrder();
    service = await buildService();

    await service.handleAlipayNotify(buildNotifyParams({ trade_status: 'WAIT_BUYER_PAY' }));

    const order = await ds.getRepository(Order).findOne({ where: { orderNo: 'O_NOTIFY_0001' } });
    expect(order!.status).toBe(OrderStatus.PENDING); // 仍是待支付
    const payment = await ds.getRepository(Payment).findOne({ where: { paymentNo: 'P_NOTIFY_0001' } });
    expect(payment!.status).toBe(PaymentStatus.PENDING);
  });

  it('R4: 订单不存在 → 返回 true（避免渠道重复通知）', async () => {
    service = await buildService();
    const result = await service.handleAlipayNotify(buildNotifyParams({ out_trade_no: 'O_NOT_EXIST' }));
    expect(result).toBe(true);
  });

  it('R4: 验签失败 → 返回 false（拒绝伪造回调）', async () => {
    await seedPendingOrder();
    service = await buildService();
    mockCheckNotifySign.mockReturnValueOnce(false);

    const result = await service.handleAlipayNotify(buildNotifyParams());
    expect(result).toBe(false);

    // 验签失败：订单不应被更新
    const order = await ds.getRepository(Order).findOne({ where: { orderNo: 'O_NOTIFY_0001' } });
    expect(order!.status).toBe(OrderStatus.PENDING);
  });
});

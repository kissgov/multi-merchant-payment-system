import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { PaymentService } from './payment.service';
import { Merchant } from '../../entities/merchant.entity';
import { Store } from '../../entities/store.entity';
import { Employee } from '../../entities/employee.entity';
import { Order } from '../../entities/order.entity';
import { Payment } from '../../entities/payment.entity';
import { AuditLogService } from '../audit/audit-log.service';

/**
 * R1 风险测试：多租户支付配置优先级
 *
 * 风险命名：门店启用独立配置后，若某字段门店未配，必须回退商户值；
 *          历史 bug 是只替换了 appId/mchId，私钥仍用商户的 → 签名失败 / 串单。
 *
 * 这些测试直接覆盖 resolvePaymentConfig 的逐字段优先策略，
 * 防止任何「图省事整体替换」的回归。
 */
describe('PaymentService.resolvePaymentConfig (R1: 多租户支付配置优先级)', () => {
  let service: PaymentService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        PaymentService,
        { provide: DataSource, useValue: { transaction: jest.fn() } },
        {
          provide: ConfigService,
          useValue: { get: jest.fn((k: string) => (k === 'PAYMENT_NOTIFY_BASE_URL' ? 'https://pay.example.com' : undefined)) },
        },
        { provide: AuditLogService, useValue: { log: jest.fn() } },
        { provide: getRepositoryToken(Merchant), useValue: {} },
        { provide: getRepositoryToken(Store), useValue: {} },
        { provide: getRepositoryToken(Employee), useValue: {} },
        { provide: getRepositoryToken(Order), useValue: {} },
        { provide: getRepositoryToken(Payment), useValue: {} },
      ],
    }).compile();
    service = moduleRef.get(PaymentService);
  });

  /** 构造一个完整商户配置 */
  const merchantConfig = (): Partial<Merchant> => ({
    alipayAppId: 'm-alipay-appid',
    alipayPrivateKey: 'm-alipay-private',
    alipayPublicKey: 'm-alipay-public',
    alipaySandbox: false,
    wechatMchId: 'm-wx-mchid',
    wechatAppId: 'm-wx-appid',
    wechatApiV3Key: 'm-wx-apiv3',
    wechatMchSerialNo: 'm-wx-serial',
    wechatPrivateKey: 'm-wx-private',
    wechatSandbox: false,
    platformFeeRate: 0.0038,
  });

  it('门店未启用独立配置 → 全部取商户值', () => {
    const merchant = merchantConfig() as Merchant;
    const store = {
      useIndependentPayment: false,
      alipayAppId: 's-alipay-appid',
      wechatMchId: 's-wx-mchid',
    } as Store;

    const cfg = (service as any).resolvePaymentConfig(merchant, store);

    expect(cfg.alipayAppId).toBe('m-alipay-appid');
    expect(cfg.alipayPrivateKey).toBe('m-alipay-private');
    expect(cfg.wechatMchId).toBe('m-wx-mchid');
    expect(cfg.wechatPrivateKey).toBe('m-wx-private');
    expect(cfg.configSource).toBe('merchant');
  });

  it('门店启用独立配置且全量配置 → 全部取门店值', () => {
    const merchant = merchantConfig() as Merchant;
    const store = {
      useIndependentPayment: true,
      alipayAppId: 's-alipay-appid',
      alipayPrivateKey: 's-alipay-private',
      alipayPublicKey: 's-alipay-public',
      alipaySandbox: true,
      wechatMchId: 's-wx-mchid',
      wechatAppId: 's-wx-appid',
      wechatApiV3Key: 's-wx-apiv3',
      wechatMchSerialNo: 's-wx-serial',
      wechatPrivateKey: 's-wx-private',
      wechatSandbox: true,
    } as Store;

    const cfg = (service as any).resolvePaymentConfig(merchant, store);

    expect(cfg.alipayAppId).toBe('s-alipay-appid');
    expect(cfg.alipayPrivateKey).toBe('s-alipay-private');
    expect(cfg.alipayPublicKey).toBe('s-alipay-public');
    expect(cfg.wechatMchId).toBe('s-wx-mchid');
    expect(cfg.wechatPrivateKey).toBe('s-wx-private');
    expect(cfg.wechatApiV3Key).toBe('s-wx-apiv3');
    expect(cfg.configSource).toBe('store');
  });

  it('门店启用独立配置但仅部分字段配置 → 缺省项回退商户值（防历史 bug 复发）', () => {
    const merchant = merchantConfig() as Merchant;
    // 门店只配了 appId 与 mchId，私钥/公钥/序列号等留空 → 必须回退商户
    const store = {
      useIndependentPayment: true,
      alipayAppId: 's-alipay-appid',
      alipayPrivateKey: '',
      alipayPublicKey: null,
      wechatMchId: 's-wx-mchid',
      wechatAppId: undefined,
      wechatApiV3Key: 's-wx-apiv3',
    } as Store;

    const cfg = (service as any).resolvePaymentConfig(merchant, store);

    // 门店已配字段
    expect(cfg.alipayAppId).toBe('s-alipay-appid');
    expect(cfg.wechatMchId).toBe('s-wx-mchid');
    expect(cfg.wechatApiV3Key).toBe('s-wx-apiv3');
    // 门店留空字段 → 回退商户（关键防回归点）
    expect(cfg.alipayPrivateKey).toBe('m-alipay-private');
    expect(cfg.alipayPublicKey).toBe('m-alipay-public');
    expect(cfg.wechatAppId).toBe('m-wx-appid');
    expect(cfg.wechatMchSerialNo).toBe('m-wx-serial');
    expect(cfg.wechatPrivateKey).toBe('m-wx-private');
    expect(cfg.configSource).toBe('store');
  });

  it('平台费率始终取商户（门店不配费率）', () => {
    const merchant = { ...merchantConfig(), platformFeeRate: 0.0066 } as Merchant;
    const store = {
      useIndependentPayment: true,
      alipayAppId: 's-alipay-appid',
    } as Store;

    const cfg = (service as any).resolvePaymentConfig(merchant, store);

    expect(cfg.platformFeeRate).toBe(0.0066);
  });

  it('无门店（store=undefined）→ 全部取商户值，configSource=merchant', () => {
    const merchant = merchantConfig() as Merchant;

    const cfg = (service as any).resolvePaymentConfig(merchant, undefined);

    expect(cfg.alipayAppId).toBe('m-alipay-appid');
    expect(cfg.wechatPrivateKey).toBe('m-wx-private');
    expect(cfg.configSource).toBe('merchant');
  });
});

/**
 * R5 风险测试：PAYMENT_NOTIFY_BASE_URL 占位符拒绝
 *
 * 风险命名：若 .env 中 NOTIFY_BASE_URL 仍为 your-domain/your-public 等占位符，
 *          沙箱/错误配置会被带进生产，渠道回调打到错误地址 → 永远收不到回调。
 *          getNotifyUrl 必须在占位符场景抛 InternalServerErrorException，让问题在
 *          发起支付时立即暴露，而不是默默用错地址。
 */
describe('PaymentService.getNotifyUrl (R5: NOTIFY_BASE_URL 占位符拒绝)', () => {
  let buildService: (notifyBaseUrl: string | undefined) => Promise<PaymentService>;

  beforeEach(async () => {
    buildService = async (notifyBaseUrl) => {
      const moduleRef = await Test.createTestingModule({
        providers: [
          PaymentService,
          { provide: DataSource, useValue: { transaction: jest.fn() } },
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn((k: string) =>
                k === 'PAYMENT_NOTIFY_BASE_URL' ? notifyBaseUrl : undefined,
              ),
            },
          },
          { provide: AuditLogService, useValue: { log: jest.fn() } },
          { provide: getRepositoryToken(Merchant), useValue: {} },
          { provide: getRepositoryToken(Store), useValue: {} },
          { provide: getRepositoryToken(Employee), useValue: {} },
          { provide: getRepositoryToken(Order), useValue: {} },
          { provide: getRepositoryToken(Payment), useValue: {} },
        ],
      }).compile();
      return moduleRef.get(PaymentService);
    };
  });

  it('NOTIFY_BASE_URL 为 undefined → 抛 InternalServerErrorException', async () => {
    const svc = await buildService(undefined);
    expect(() => (svc as any).getNotifyUrl('/api/payment/notify/alipay')).toThrow(
      /PAYMENT_NOTIFY_BASE_URL 未配置/,
    );
  });

  it('NOTIFY_BASE_URL 含 your-domain 占位符 → 抛异常', async () => {
    const svc = await buildService('https://your-domain.com');
    expect(() => (svc as any).getNotifyUrl('/api/payment/notify/wechat')).toThrow(
      /PAYMENT_NOTIFY_BASE_URL 未配置/,
    );
  });

  it('NOTIFY_BASE_URL 含 your-public 占位符 → 抛异常', async () => {
    const svc = await buildService('https://your-public-ip.com');
    expect(() => (svc as any).getNotifyUrl('/api/payment/notify/wechat')).toThrow(
      /PAYMENT_NOTIFY_BASE_URL 未配置/,
    );
  });

  it('NOTIFY_BASE_URL 为合法域名 → 返回完整回调地址', async () => {
    const svc = await buildService('https://pay.kxrdyf.cn');
    const url = (svc as any).getNotifyUrl('/api/payment/notify/alipay');
    expect(url).toBe('https://pay.kxrdyf.cn/api/payment/notify/alipay');
  });
});

/**
 * R8 风险测试：订单号/退款单号生成唯一性
 *
 * 风险命名：旧实现用 Math.random，高并发下存在碰撞风险，
 *          可能生成重复订单号导致数据库唯一约束冲突或串单。
 *          现使用 crypto.randomBytes，1000 次生成必须 100% 唯一。
 */
describe('PaymentService.generateOrderNo (R8: crypto 随机数唯一性)', () => {
  let service: PaymentService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        PaymentService,
        { provide: DataSource, useValue: { transaction: jest.fn() } },
        {
          provide: ConfigService,
          useValue: { get: jest.fn(() => 'https://pay.example.com') },
        },
        { provide: AuditLogService, useValue: { log: jest.fn() } },
        { provide: getRepositoryToken(Merchant), useValue: {} },
        { provide: getRepositoryToken(Store), useValue: {} },
        { provide: getRepositoryToken(Employee), useValue: {} },
        { provide: getRepositoryToken(Order), useValue: {} },
        { provide: getRepositoryToken(Payment), useValue: {} },
      ],
    }).compile();
    service = moduleRef.get(PaymentService);
  });

  it('生成 1000 个订单号全部唯一', () => {
    const nos = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      nos.add((service as any).generateOrderNo('O'));
    }
    expect(nos.size).toBe(1000);
  });

  it('订单号包含指定前缀', () => {
    const no = (service as any).generateOrderNo('P');
    expect(no.startsWith('P')).toBe(true);
  });

  it('订单号长度合理（前缀 + 14位时间 + 6位hex）', () => {
    const no = (service as any).generateOrderNo('O');
    // O + YYYYMMDDHHmmss(14) + 6 hex = 21
    expect(no.length).toBe(21);
  });
});

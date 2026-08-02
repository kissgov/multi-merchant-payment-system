import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, MoreThan } from 'typeorm';
import AlipaySdk from 'alipay-sdk';
import * as AlipayFormData from 'alipay-sdk/lib/form';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import * as dayjs from 'dayjs';
import * as crypto from 'crypto';

import { Merchant } from '../../entities/merchant.entity';
import { Store } from '../../entities/store.entity';
import { Employee, EmployeeStatus } from '../../entities/employee.entity';
import {
  Order,
  OrderStatus,
  OrderSource,
} from '../../entities/order.entity';
import { PaymentChannel } from '../../entities/enums';
import {
  Payment,
  PaymentStatus,
  PaymentMethod,
} from '../../entities/payment.entity';
import { Refund, RefundStatus } from '../../entities/refund.entity';
import { CreateMicropayDto, CreateQrCodeDto } from './dto/create-payment.dto';
import { EmployeePayload } from '../../common/decorators/current-employee.decorator';
import { AuditLogService } from '../audit/audit-log.service';
import { AuditAction } from '../../entities/audit-log.entity';
import { WechatPayV3Client, WechatPayConfig } from './wechat-pay-v3.client';

/**
 * 支付结果接口
 */
export interface PaymentResult {
  success: boolean;
  orderId: string;
  orderNo: string;
  paymentNo: string;
  status: PaymentStatus;
  amount: number;
  channel: PaymentChannel;
  // 被扫模式：直接返回结果
  paidAt?: Date;
  outTradeNo?: string;
  payerAccount?: string;
  payerName?: string;
  // 主扫模式：返回二维码
  qrCodeContent?: string;
  qrCodeUrl?: string;
  codeExpireAt?: Date;
  message?: string;
}

@Injectable()
export class PaymentService {
  readonly logger = new Logger(PaymentService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly auditLogService: AuditLogService,
    @InjectRepository(Merchant)
    private readonly merchantRepo: Repository<Merchant>,
    @InjectRepository(Store)
    private readonly storeRepo: Repository<Store>,
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
  ) {}

  // =============== 工具：生成订单号 ===============
  private generateOrderNo(prefix: string): string {
    const now = dayjs().format('YYYYMMDDHHmmss');
    // 使用 crypto.randomBytes 替代 Math.random，避免高并发下碰撞
    const random = crypto.randomBytes(3).toString('hex');
    return `${prefix}${now}${random}`;
  }

  // =============== 工具：解析最终生效的支付配置 ===============
  /**
   * 门店启用独立配置(useIndependentPayment=true)时，逐字段优先取门店值；
   * 门店字段为空则回退商户值。门店未启用独立配置时，全部取商户值。
   * 修复历史 bug：旧逻辑只替换了 appId/mchId，私钥等仍用商户的 → 签名失败。
   */
  private resolvePaymentConfig(merchant: Merchant, store?: Store) {
    const useStore = !!store?.useIndependentPayment;
    const pick = <K extends keyof Merchant & keyof Store>(
      field: K,
    ): string | boolean | undefined => {
      if (useStore) {
        const sv = (store as any)[field];
        if (sv !== undefined && sv !== null && sv !== '') return sv as any;
      }
      return (merchant as any)[field] as any;
    };

    return {
      alipayAppId: pick('alipayAppId') as string | undefined,
      alipayPrivateKey: pick('alipayPrivateKey') as string | undefined,
      alipayPublicKey: pick('alipayPublicKey') as string | undefined,
      alipaySandbox: pick('alipaySandbox') as boolean,
      wechatMchId: pick('wechatMchId') as string | undefined,
      wechatAppId: pick('wechatAppId') as string | undefined,
      wechatApiV3Key: pick('wechatApiV3Key') as string | undefined,
      wechatMchSerialNo: pick('wechatMchSerialNo') as string | undefined,
      wechatPrivateKey: pick('wechatPrivateKey') as string | undefined,
      wechatSandbox: pick('wechatSandbox') as boolean,
      // 费率始终取商户（门店不配费率）
      platformFeeRate: merchant.platformFeeRate,
      // 标识本次支付实际命中的配置来源（便于日志/排查）
      configSource: useStore ? 'store' : 'merchant',
    };
  }

  // =============== 工具：获取支付宝实例 ===============
  private getAlipayInstance(merchant: Merchant, store?: Store): any {
    const cfg = this.resolvePaymentConfig(merchant, store);
    if (!cfg.alipayAppId || !cfg.alipayPrivateKey || !cfg.alipayPublicKey) {
      throw new BadRequestException('支付宝支付未配置，请先完善支付配置');
    }
    return new AlipaySdk({
      appId: cfg.alipayAppId,
      privateKey: cfg.alipayPrivateKey,
      alipayPublicKey: cfg.alipayPublicKey,
      charset: 'utf-8',
      version: '1.0',
      signType: 'RSA2',
      gateway: cfg.alipaySandbox
        ? 'https://openapi-sandbox.dl.alipaydev.com/gateway.do'
        : 'https://openapi.alipay.com/gateway.do',
    });
  }

  // =============== 工具：获取支付回调地址 ===============
  private getNotifyUrl(path: string): string {
    const baseUrl = this.configService.get<string>('PAYMENT_NOTIFY_BASE_URL');
    if (!baseUrl || baseUrl.includes('your-domain') || baseUrl.includes('your-public')) {
      throw new InternalServerErrorException(
        'PAYMENT_NOTIFY_BASE_URL 未配置或为占位符，请在 .env 中设置公网 HTTPS 域名',
      );
    }
    return `${baseUrl}${path}`;
  }

  // =============== 工具：获取微信支付V3客户端 ===============
  private getWechatClient(merchant: Merchant, store?: Store): WechatPayV3Client {
    const cfg = this.resolvePaymentConfig(merchant, store);
    if (
      !cfg.wechatMchId ||
      !cfg.wechatAppId ||
      !cfg.wechatApiV3Key ||
      !cfg.wechatPrivateKey ||
      !cfg.wechatMchSerialNo
    ) {
      throw new BadRequestException('微信支付未配置，请先完善支付配置（需商户号、AppID、APIv3密钥、商户证书序列号、商户私钥）');
    }
    const wxConfig: WechatPayConfig = {
      appId: cfg.wechatAppId,
      mchId: cfg.wechatMchId,
      apiV3Key: cfg.wechatApiV3Key,
      mchSerialNo: cfg.wechatMchSerialNo,
      privateKey: cfg.wechatPrivateKey,
      sandbox: cfg.wechatSandbox,
    };
    return new WechatPayV3Client(wxConfig);
  }

  // =============== 工具：检查员工收款权限与限额 ===============
  private async checkEmployeePermission(
    employee: Employee,
    amount: number,
  ): Promise<void> {
    // 统计今日已收款金额
    const todayStart = dayjs().startOf('day').toDate();
    const todayOrders = await this.orderRepo
      .createQueryBuilder('o')
      .where('o.employeeId = :eid', { eid: employee.id })
      .andWhere('o.createdAt >= :start', { start: todayStart })
      .andWhere('o.status IN (:...statuses)', {
        statuses: [OrderStatus.PAID, OrderStatus.PARTIAL_REFUNDED],
      })
      .select('COALESCE(SUM(o.paidAmount), 0)', 'total')
      .getRawOne<{ total: string }>();

    const dailyTotal = parseFloat(todayOrders?.total || '0');
    const check = employee.canTakePayment(amount, dailyTotal);
    if (!check.allowed) {
      throw new ForbiddenException(check.reason);
    }
  }

  // =============== 公共：创建订单与支付记录 ===============
  private async createOrderAndPayment(
    emp: EmployeePayload,
    dto: {
      channel: PaymentChannel;
      amount: number;
      subject?: string;
      body?: string;
      expireSeconds?: number;
      source?: OrderSource;
    },
    paymentMethod: PaymentMethod,
    authCode?: string,
  ): Promise<{ order: Order; payment: Payment; employee: Employee; merchant: Merchant; store: Store }> {
    // 获取员工完整信息
    const employee = await this.employeeRepo.findOneOrFail({
      where: { id: emp.id },
    });
    if (employee.status !== EmployeeStatus.ACTIVE) {
      throw new ForbiddenException('员工账号已被禁用');
    }

    // 检查权限
    await this.checkEmployeePermission(employee, dto.amount);

    // 获取商户 & 门店
    const merchant = await this.merchantRepo.findOneOrFail({
      where: { id: emp.merchantId },
    });
    const store = await this.storeRepo.findOneOrFail({
      where: { id: emp.storeId },
    });

    // 计算金额
    const totalAmount = Number(dto.amount.toFixed(2));
    const paidAmount = totalAmount; // 简化版：无折扣
    const discountAmount = 0;

    // 生成单号
    const orderNo = this.generateOrderNo('O');
    const paymentNo = this.generateOrderNo('P');
    const expireSeconds = dto.expireSeconds ?? 300;

    // 使用事务创建
    return this.dataSource.transaction(async (manager) => {
      const order = manager.create(Order, {
        orderNo,
        merchantId: merchant.id,
        storeId: store.id,
        employeeId: employee.id,
        totalAmount,
        discountAmount,
        paidAmount,
        refundedAmount: 0,
        paymentChannel: dto.channel,
        status: OrderStatus.PENDING,
        source: dto.source ?? OrderSource.POS_APP,
        subject: dto.subject ?? '门店商品消费',
        body: dto.body,
        operatorName: employee.name,
        expireSeconds,
        expireAt: dayjs().add(expireSeconds, 'second').toDate(),
      });
      const savedOrder = await manager.save(order);

      const payment = manager.create(Payment, {
        paymentNo,
        orderId: savedOrder.id,
        paymentChannel: dto.channel,
        paymentMethod,
        status: PaymentStatus.PENDING,
        amount: paidAmount,
        channelFee: 0,
        platformFee: Number((paidAmount * (merchant.platformFeeRate || 0)).toFixed(2)),
        merchantNetAmount: 0,
        authCode,
        payInitiatedAt: new Date(),
      });
      const savedPayment = await manager.save(payment);

      return {
        order: savedOrder,
        payment: savedPayment,
        employee,
        merchant,
        store,
      };
    });
  }

  // =============== 1. 被扫模式：商家扫用户付款码 ===============
  async micropay(emp: EmployeePayload, dto: CreateMicropayDto): Promise<PaymentResult> {
    const startAt = Date.now();
    this.logger.log(
      `[被扫收款] 员工=${emp.name}(${emp.id}) 渠道=${dto.channel} 金额=${dto.amount} 付款码=${dto.authCode?.substring(0, 6)}***`,
    );

    // 确定支付方式
    const paymentMethod =
      dto.channel === PaymentChannel.ALIPAY
        ? PaymentMethod.ALIPAY_QR
        : PaymentMethod.WECHAT_MICROPAY;

    // 创建订单
    const { order, payment, merchant, store } = await this.createOrderAndPayment(
      emp,
      dto,
      paymentMethod,
      dto.authCode,
    );

    try {
      let result: PaymentResult;

      if (dto.channel === PaymentChannel.ALIPAY) {
        result = await this.executeAlipayMicropay(
          merchant,
          store,
          order,
          payment,
          dto.authCode,
        );
      } else {
        result = await this.executeWechatMicropay(
          merchant,
          store,
          order,
          payment,
          dto.authCode,
        );
      }

      // 审计日志：被扫收款结果
      this.auditLogService.log({
        module: 'payment',
        action: AuditAction.PAYMENT,
        description: `被扫收款 ${result.success ? '成功' : '处理中'} 订单=${order.orderNo} 渠道=${dto.channel} 金额=${dto.amount}`,
        operator: emp,
        merchantId: merchant.id,
        storeId: store.id,
        targetType: 'order',
        targetId: order.id,
        requestParams: { channel: dto.channel, amount: dto.amount, authCode: dto.authCode?.substring(0, 6) + '***' },
        afterData: { status: result.status, outTradeNo: result.outTradeNo },
        success: true,
        startAt,
      });

      return result;
    } catch (err) {
      this.logger.error(`[被扫收款] 失败: ${err.message}`, err.stack);
      // 更新支付记录错误信息
      await this.paymentRepo.update(payment.id, {
        status: PaymentStatus.FAILED,
        errorCode: err.code || 'UNKNOWN',
        errorMessage: err.message,
      });
      await this.orderRepo.update(order.id, { status: OrderStatus.FAILED });

      // 审计日志：被扫收款失败
      this.auditLogService.log({
        module: 'payment',
        action: AuditAction.PAYMENT,
        description: `被扫收款失败 订单=${order.orderNo} 渠道=${dto.channel} 金额=${dto.amount}`,
        operator: emp,
        merchantId: merchant.id,
        storeId: store.id,
        targetType: 'order',
        targetId: order.id,
        requestParams: { channel: dto.channel, amount: dto.amount },
        success: false,
        errorMessage: err.message,
        startAt,
      });

      throw new BadRequestException(err.message || '支付失败，请重试');
    }
  }

  // =============== 支付宝被扫实现（条码支付） ===============
  private async executeAlipayMicropay(
    merchant: Merchant,
    store: Store,
    order: Order,
    payment: Payment,
    authCode: string,
  ): Promise<PaymentResult> {
    const alipaySdk = this.getAlipayInstance(merchant, store);

    const notifyUrl = this.getNotifyUrl('/api/payment/notify/alipay');

    const bizContent = {
      out_trade_no: order.orderNo,
      total_amount: order.paidAmount.toFixed(2),
      subject: order.subject,
      scene: 'bar_code',
      auth_code: authCode,
      store_id: store.storeNo,
      body: order.body || undefined,
      timeout_express: `${order.expireSeconds || 300}m`,
    };

    this.logger.debug(`[支付宝被扫] 请求参数: ${JSON.stringify(bizContent)}`);

    try {
      const resp = await alipaySdk.exec(
        'alipay.trade.pay',
        {},
        {
          bizContent,
          notifyUrl,
        },
      );

      this.logger.debug(`[支付宝被扫] 响应: ${JSON.stringify(resp)}`);

      if (resp.code === '10000') {
        // 支付成功
        const paidAt = new Date();
        const outTradeNo = resp.tradeNo;
        const payerAccount = resp.buyerLogonId || resp.buyerUserId;
        const payerName = resp.buyerUserName || '';

        // 更新订单 & 支付
        const channelFee = Number((order.paidAmount * 0.0038).toFixed(2)); // 估算，实际以对账单为准
        const platformFee = Number(
          (order.paidAmount * (merchant.platformFeeRate || 0)).toFixed(2),
        );
        await this.orderRepo.update(order.id, {
          status: OrderStatus.PAID,
          paidAt,
        });
        await this.paymentRepo.update(payment.id, {
          status: PaymentStatus.SUCCESS,
          outTradeNo,
          payerAccount,
          payerName,
          channelFee,
          merchantNetAmount: Number((order.paidAmount - channelFee - platformFee).toFixed(2)),
          paySucceededAt: paidAt,
          responsePayload: JSON.stringify(resp),
        });

        return {
          success: true,
          orderId: order.id,
          orderNo: order.orderNo,
          paymentNo: payment.paymentNo,
          status: PaymentStatus.SUCCESS,
          amount: order.paidAmount,
          channel: PaymentChannel.ALIPAY,
          paidAt,
          outTradeNo,
          payerAccount,
          payerName,
          message: '支付成功',
        };
      } else if (resp.code === '10003') {
        // 用户支付中，需要轮询查询
        return {
          success: false,
          orderId: order.id,
          orderNo: order.orderNo,
          paymentNo: payment.paymentNo,
          status: PaymentStatus.WAITING_PAYER,
          amount: order.paidAmount,
          channel: PaymentChannel.ALIPAY,
          message: '等待用户付款中，请稍后查询结果',
        };
      } else {
        throw new Error(resp.subMsg || resp.msg || '支付宝支付失败');
      }
    } catch (err) {
      this.logger.error(`[支付宝被扫] 异常: ${err.message}`);
      throw err;
    }
  }

  // =============== 微信被扫实现（付款码/刷卡支付） ===============
  private async executeWechatMicropay(
    merchant: Merchant,
    store: Store,
    order: Order,
    payment: Payment,
    authCode: string,
  ): Promise<PaymentResult> {
    const wxClient = this.getWechatClient(merchant, store);
    const notifyUrl = this.getNotifyUrl('/api/payment/notify/wechat');

    this.logger.debug(
      `[微信被扫] 订单=${order.orderNo} 金额=${order.paidAmount} 付款码=${authCode.substring(0, 6)}***`,
    );

    const result = await wxClient.micropay({
      description: order.subject,
      outTradeNo: order.orderNo,
      amount: order.paidAmount,
      authCode,
      notifyUrl,
    });

    // tradeState: SUCCESS / REFUND / NOTPAY / CLOSED / REVOKED / USERPAYING / PAYERROR
    if (result.tradeState === 'SUCCESS') {
      const paidAt = new Date();
      const channelFee = Number((order.paidAmount * 0.0038).toFixed(2));
      const platformFee = Number(
        (order.paidAmount * (merchant.platformFeeRate || 0)).toFixed(2),
      );
      await this.orderRepo.update(order.id, { status: OrderStatus.PAID, paidAt });
      await this.paymentRepo.update(payment.id, {
        status: PaymentStatus.SUCCESS,
        outTradeNo: result.transactionId,
        payerAccount: result.payerOpenid,
        channelFee,
        merchantNetAmount: Number((order.paidAmount - channelFee - platformFee).toFixed(2)),
        paySucceededAt: paidAt,
        responsePayload: JSON.stringify(result),
      });
      return {
        success: true,
        orderId: order.id,
        orderNo: order.orderNo,
        paymentNo: payment.paymentNo,
        status: PaymentStatus.SUCCESS,
        amount: order.paidAmount,
        channel: PaymentChannel.WECHAT,
        paidAt,
        outTradeNo: result.transactionId,
        payerAccount: result.payerOpenid,
        message: '支付成功',
      };
    } else if (result.tradeState === 'USERPAYING') {
      // 用户支付中，需要轮询查询
      return {
        success: false,
        orderId: order.id,
        orderNo: order.orderNo,
        paymentNo: payment.paymentNo,
        status: PaymentStatus.WAITING_PAYER,
        amount: order.paidAmount,
        channel: PaymentChannel.WECHAT,
        message: '等待用户输入密码，请稍后查询',
      };
    } else {
      // NOTPAY / CLOSED / REVOKED / PAYERROR
      throw new Error(result.tradeStateDesc || result.tradeState || '微信支付失败');
    }
  }

  // =============== 2. 主扫模式：生成收款二维码（用户扫码） ===============
  async createQrCode(emp: EmployeePayload, dto: CreateQrCodeDto): Promise<PaymentResult> {
    const startAt = Date.now();
    this.logger.log(
      `[主扫收款] 员工=${emp.name} 渠道=${dto.channel} 金额=${dto.amount}`,
    );

    const paymentMethod =
      dto.channel === PaymentChannel.ALIPAY
        ? PaymentMethod.ALIPAY_PRECREATE
        : PaymentMethod.WECHAT_NATIVE;

    const { order, payment, merchant, store } = await this.createOrderAndPayment(
      emp,
      dto,
      paymentMethod,
    );

    try {
      let qrCodeContent: string;
      let qrCodeUrl: string | undefined;

      if (dto.channel === PaymentChannel.ALIPAY) {
        qrCodeContent = await this.createAlipayQrCode(merchant, store, order);
      } else {
        qrCodeContent = await this.createWechatQrCode(merchant, store, order);
      }

      // 生成二维码图片URL（可使用免费二维码API或前端生成）
      qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(qrCodeContent)}`;

      // 更新支付记录
      await this.paymentRepo.update(payment.id, {
        status: PaymentStatus.WAITING_PAYER,
        qrCodeContent,
        qrCodeUrl,
      });

      // 审计日志：主扫二维码生成
      this.auditLogService.log({
        module: 'payment',
        action: AuditAction.PAYMENT,
        description: `主扫生成二维码 订单=${order.orderNo} 渠道=${dto.channel} 金额=${dto.amount}`,
        operator: emp,
        merchantId: merchant.id,
        storeId: store.id,
        targetType: 'order',
        targetId: order.id,
        requestParams: { channel: dto.channel, amount: dto.amount },
        success: true,
        startAt,
      });

      return {
        success: true,
        orderId: order.id,
        orderNo: order.orderNo,
        paymentNo: payment.paymentNo,
        status: PaymentStatus.WAITING_PAYER,
        amount: order.paidAmount,
        channel: dto.channel,
        qrCodeContent,
        qrCodeUrl,
        codeExpireAt: order.expireAt,
        message: '请使用对应APP扫描二维码完成支付',
      };
    } catch (err) {
      this.logger.error(`[主扫收款] 失败: ${err.message}`);
      await this.paymentRepo.update(payment.id, {
        status: PaymentStatus.FAILED,
        errorMessage: err.message,
      });
      await this.orderRepo.update(order.id, { status: OrderStatus.FAILED });

      // 审计日志：主扫二维码生成失败
      this.auditLogService.log({
        module: 'payment',
        action: AuditAction.PAYMENT,
        description: `主扫生成二维码失败 订单=${order.orderNo} 渠道=${dto.channel} 金额=${dto.amount}`,
        operator: emp,
        merchantId: merchant.id,
        storeId: store.id,
        targetType: 'order',
        targetId: order.id,
        success: false,
        errorMessage: err.message,
        startAt,
      });

      throw new BadRequestException(err.message || '生成二维码失败');
    }
  }

  private async createAlipayQrCode(
    merchant: Merchant,
    store: Store,
    order: Order,
  ): Promise<string> {
    const alipaySdk = this.getAlipayInstance(merchant, store);
    const notifyUrl = this.getNotifyUrl('/api/payment/notify/alipay');

    const bizContent = {
      out_trade_no: order.orderNo,
      total_amount: order.paidAmount.toFixed(2),
      subject: order.subject,
      store_id: store.storeNo,
      body: order.body || undefined,
      timeout_express: `${order.expireSeconds || 300}m`,
    };

    try {
      const resp = await alipaySdk.exec(
        'alipay.trade.precreate',
        {},
        { bizContent, notifyUrl },
      );
      if (resp.code === '10000') {
        return resp.qrCode;
      }
      throw new Error(resp.subMsg || '支付宝预下单失败');
    } catch (err) {
      // 沙箱或无配置时返回模拟二维码串
      this.logger.warn(`[支付宝预下单] 异常，返回模拟二维码: ${err.message}`);
      return `https://qr.alipay.com/demo_mock_${order.orderNo}`;
    }
  }

  private async createWechatQrCode(
    merchant: Merchant,
    store: Store,
    order: Order,
  ): Promise<string> {
    const wxClient = this.getWechatClient(merchant, store);
    const notifyUrl = this.getNotifyUrl('/api/payment/notify/wechat');

    this.logger.debug(`[微信主扫] 订单=${order.orderNo} 金额=${order.paidAmount}`);

    const result = await wxClient.nativePay({
      description: order.subject,
      outTradeNo: order.orderNo,
      amount: order.paidAmount,
      notifyUrl,
    });

    this.logger.log(`[微信主扫] 二维码生成成功 订单=${order.orderNo}`);
    return result.codeUrl;
  }

  // =============== 3. 主动查询支付状态（轮询用） ===============
  async queryPayment(orderId: string, emp: EmployeePayload): Promise<PaymentResult> {
    const order = await this.orderRepo.findOne({
      where: { id: orderId, merchantId: emp.merchantId },
      relations: ['payment'],
    });
    if (!order) throw new BadRequestException('订单不存在');
    const p = order.payment;
    if (!p) throw new BadRequestException('支付记录不存在');

    // 如果已经是终态，直接返回
    if (
      [PaymentStatus.SUCCESS, PaymentStatus.FAILED, PaymentStatus.CLOSED].includes(
        p.status,
      )
    ) {
      return {
        success: p.status === PaymentStatus.SUCCESS,
        orderId: order.id,
        orderNo: order.orderNo,
        paymentNo: p.paymentNo,
        status: p.status,
        amount: p.amount,
        channel: p.paymentChannel,
        paidAt: p.paySucceededAt,
        outTradeNo: p.outTradeNo,
        payerAccount: p.payerAccount,
        payerName: p.payerName,
        message:
          p.status === PaymentStatus.SUCCESS
            ? '支付成功'
            : p.status === PaymentStatus.FAILED
            ? '支付失败'
            : '订单已关闭',
      };
    }

    // 非终态：向渠道查询
    const merchant = await this.merchantRepo.findOneOrFail({
      where: { id: emp.merchantId },
    });
    const store = order.storeId
      ? await this.storeRepo.findOne({ where: { id: order.storeId } })
      : null;

    let queryResult: { success: boolean; tradeNo?: string; payer?: string; message?: string };
    try {
      if (p.paymentChannel === PaymentChannel.ALIPAY) {
        queryResult = await this.queryAlipay(merchant, store, order);
      } else {
        queryResult = await this.queryWechat(merchant, store, order);
      }
    } catch (err) {
      return {
        success: false,
        orderId: order.id,
        orderNo: order.orderNo,
        paymentNo: p.paymentNo,
        status: p.status,
        amount: p.amount,
        channel: p.paymentChannel,
        message: `查询中: ${err.message}`,
      };
    }

    if (queryResult.success) {
      const paidAt = new Date();
      await this.orderRepo.update(order.id, { status: OrderStatus.PAID, paidAt });
      const channelFee = Number((order.paidAmount * 0.0038).toFixed(2));
      const platformFee = Number(
        (order.paidAmount * (merchant.platformFeeRate || 0)).toFixed(2),
      );
      await this.paymentRepo.update(p.id, {
        status: PaymentStatus.SUCCESS,
        outTradeNo: queryResult.tradeNo,
        payerAccount: queryResult.payer,
        channelFee,
        merchantNetAmount: Number((order.paidAmount - channelFee - platformFee).toFixed(2)),
        paySucceededAt: paidAt,
      });

      // 审计日志：轮询确认支付成功
      this.auditLogService.log({
        module: 'payment',
        action: AuditAction.PAYMENT,
        description: `轮询确认支付成功 订单=${order.orderNo} 渠道=${p.paymentChannel} 金额=${order.paidAmount}`,
        operator: emp,
        merchantId: emp.merchantId,
        storeId: order.storeId,
        targetType: 'order',
        targetId: order.id,
        afterData: { status: PaymentStatus.SUCCESS, outTradeNo: queryResult.tradeNo, paidAt },
        success: true,
      });

      return {
        success: true,
        orderId: order.id,
        orderNo: order.orderNo,
        paymentNo: p.paymentNo,
        status: PaymentStatus.SUCCESS,
        amount: p.amount,
        channel: p.paymentChannel,
        paidAt,
        outTradeNo: queryResult.tradeNo,
        payerAccount: queryResult.payer,
        message: '支付成功',
      };
    }

    return {
      success: false,
      orderId: order.id,
      orderNo: order.orderNo,
      paymentNo: p.paymentNo,
      status: p.status,
      amount: p.amount,
      channel: p.paymentChannel,
      message: queryResult.message || '等待用户付款中...',
    };
  }

  private async queryAlipay(merchant, store, order) {
    try {
      const alipaySdk = this.getAlipayInstance(merchant, store);
      const resp = await alipaySdk.exec('alipay.trade.query', {
        bizContent: { out_trade_no: order.orderNo },
      });
      if (resp.code === '10000' && resp.tradeStatus === 'TRADE_SUCCESS') {
        return { success: true, tradeNo: resp.tradeNo, payer: resp.buyerLogonId };
      }
      return { success: false, message: resp.tradeStatus || '支付处理中' };
    } catch {
      return { success: false, message: '查询失败，稍后重试' };
    }
  }

  private async queryWechat(merchant, store, order) {
    try {
      const wxClient = this.getWechatClient(merchant, store);
      const result = await wxClient.queryByOutTradeNo(order.orderNo);

      if (result.tradeState === 'SUCCESS') {
        return {
          success: true,
          tradeNo: result.transactionId,
          payer: result.payerOpenid,
        };
      }
      return {
        success: false,
        message: result.tradeStateDesc || result.tradeState || '支付处理中',
      };
    } catch (err) {
      this.logger.warn(`[微信查询] 异常: ${err.message}`);
      return { success: false, message: '查询失败，稍后重试' };
    }
  }

  // =============== 4. 支付宝退款（供 RefundService 调用） ===============
  async alipayRefund(
    merchant: Merchant,
    store: Store | null,
    orderNo: string,
    refundAmount: number,
    refundNo: string,
    reason?: string,
  ): Promise<string> {
    const alipaySdk = this.getAlipayInstance(merchant, store || undefined);

    const bizContent = {
      out_trade_no: orderNo,
      refund_amount: refundAmount.toFixed(2),
      out_request_no: refundNo,
      refund_reason: reason || '用户申请退款',
    };

    this.logger.log(`[支付宝退款] 订单=${orderNo} 金额=${refundAmount} 退款单号=${refundNo}`);

    const resp = await alipaySdk.exec('alipay.trade.refund', {
      bizContent: JSON.stringify(bizContent),
    });

    if (resp.code === '10000') {
      this.logger.log(`[支付宝退款] 成功 退款单号=${refundNo}`);
      return resp.tradeNo || refundNo;
    }
    throw new Error(resp.subMsg || resp.msg || '支付宝退款失败');
  }

  // =============== 5. 微信退款（供 RefundService 调用） ===============
  async wechatRefund(
    merchant: Merchant,
    store: Store | null,
    orderNo: string,
    refundAmount: number,
    totalAmount: number,
    refundNo: string,
    reason?: string,
  ): Promise<string> {
    const wxClient = this.getWechatClient(merchant, store || undefined);
    const notifyUrl = this.getNotifyUrl('/api/payment/notify/wechat/refund');

    this.logger.log(`[微信退款] 订单=${orderNo} 退款金额=${refundAmount} 退款单号=${refundNo}`);

    const result = await wxClient.refund({
      outTradeNo: orderNo,
      outRefundNo: refundNo,
      refundAmount,
      totalAmount,
      reason,
      notifyUrl,
    });

    if (result.status === 'SUCCESS' || result.status === 'PROCESSING') {
      this.logger.log(`[微信退款] ${result.status} 退款单号=${refundNo} 微信退款单号=${result.refundId}`);
      return result.refundId || refundNo;
    }
    throw new Error(`微信退款状态: ${result.status}`);
  }

  // =============== 6. 回调处理（供 Controller 调用） ===============

  /** 处理支付宝回调 */
  async handleAlipayNotify(params: any): Promise<boolean> {
    try {
      const orderNo = params.out_trade_no;
      if (!orderNo) {
        this.logger.warn('[支付宝回调] 缺少 out_trade_no');
        return false;
      }

      // 1) 通过订单号查找订单 → 找到商户 → 用商户公钥验签
      const order = await this.orderRepo.findOne({ where: { orderNo } });
      if (!order) {
        this.logger.warn(`[支付宝回调] 订单不存在: ${orderNo}`);
        return true; // 返回 success 避免重复通知
      }

      const merchant = await this.merchantRepo.findOneOrFail({ where: { id: order.merchantId } });
      const alipaySdk = this.getAlipayInstance(merchant);

      // 2) 验签（防止伪造回调）
      const signVerified = alipaySdk.checkNotifySign(params);
      if (!signVerified) {
        this.logger.warn(`[支付宝回调] 验签失败 订单=${orderNo}`);
        return false;
      }

      const tradeStatus = params.trade_status;

      if (tradeStatus === 'TRADE_SUCCESS' || tradeStatus === 'TRADE_FINISHED') {
        // 3) 乐观锁：仅当 status=pending 时才更新，防止并发重复处理
        const result = await this.orderRepo.update(
          { id: order.id, status: OrderStatus.PENDING },
          { status: OrderStatus.PAID, paidAt: new Date(params.gmt_payment || new Date()) },
        );
        if (result.affected === 0) {
          this.logger.log(`[支付宝回调] 订单已处理，跳过: ${orderNo}`);
          return true;
        }

        const channelFee = Number((order.paidAmount * 0.0038).toFixed(2));
        const platformFee = Number(
          (order.paidAmount * (merchant.platformFeeRate || 0)).toFixed(2),
        );

        await this.paymentRepo.update(
          { orderId: order.id },
          {
            status: PaymentStatus.SUCCESS,
            outTradeNo: params.trade_no,
            payerAccount: params.buyer_logon_id,
            payerName: params.buyer_user_name,
            channelFee,
            merchantNetAmount: Number((order.paidAmount - channelFee - platformFee).toFixed(2)),
            paySucceededAt: new Date(params.gmt_payment || new Date()),
            responsePayload: JSON.stringify(params),
          },
        );

        this.logger.log(`[支付宝回调] 处理成功 订单=${orderNo} 交易号=${params.trade_no}`);
      }

      return true;
    } catch (err) {
      this.logger.error(`[支付宝回调] 处理异常: ${err.message}`, err.stack);
      return false;
    }
  }

  /** 处理微信回调 */
  async handleWechatNotify(
    body: any,
    headers: any,
  ): Promise<{ code: string; message: string }> {
    try {
      const { resource } = body;

      if (!resource) {
        return { code: 'FAIL', message: '无 resource 数据' };
      }

      // 1) 验签：使用微信回调 headers 中的时间戳、随机串、签名和平台证书序列号
      const timestamp = headers['wechatpay-timestamp'] as string;
      const nonce = headers['wechatpay-nonce'] as string;
      const signature = headers['wechatpay-signature'] as string;
      const serial = headers['wechatpay-serial'] as string;

      // 2) 遍历商户解密通知（APIv3 密钥是商户级）
      const merchants = await this.merchantRepo.find({
        where: { wechatApiV3Key: MoreThan('') as any },
      });

      let decrypted: any = null;
      let matchedMerchant: Merchant | null = null;
      let matchedClient: WechatPayV3Client | null = null;

      for (const m of merchants) {
        if (!m.wechatApiV3Key) continue;
        try {
          const wxClient = this.getWechatClient(m);

          // 先验签（如果有序书缓存），验签失败直接跳过此商户
          if (timestamp && nonce && signature && serial) {
            const bodyStr = JSON.stringify(body);
            const signOk = wxClient.verifyNotifySignature(timestamp, nonce, bodyStr, signature, serial);
            if (!signOk) {
              this.logger.warn(`[微信回调] 验签失败 商户=${m.id} serial=${serial}`);
              continue;
            }
          }

          decrypted = wxClient.decryptNotifyResource(
            resource.ciphertext,
            resource.nonce,
            resource.associated_data,
          );
          matchedMerchant = m;
          matchedClient = wxClient;
          break;
        } catch {
          continue;
        }
      }

      if (!decrypted || !matchedMerchant) {
        this.logger.warn(`[微信回调] 无法解密通知，尝试了 ${merchants.length} 个商户`);
        return { code: 'FAIL', message: '无法解密回调数据' };
      }

      const orderNo = decrypted.out_trade_no;
      const order = await this.orderRepo.findOne({
        where: { orderNo },
        relations: ['payment'],
      });
      if (!order) {
        this.logger.warn(`[微信回调] 订单不存在: ${orderNo}`);
        return { code: 'SUCCESS', message: 'OK' };
      }

      if (decrypted.trade_state === 'SUCCESS') {
        // 3) 乐观锁：仅当 status=pending 时才更新，防止并发重复处理
        const paidAt = new Date(decrypted.success_time || new Date());
        const result = await this.orderRepo.update(
          { id: order.id, status: OrderStatus.PENDING },
          { status: OrderStatus.PAID, paidAt },
        );
        if (result.affected === 0) {
          this.logger.log(`[微信回调] 订单已处理，跳过: ${orderNo}`);
          return { code: 'SUCCESS', message: 'OK' };
        }

        const channelFee = Number((order.paidAmount * 0.0038).toFixed(2));
        const platformFee = Number(
          (order.paidAmount * (matchedMerchant.platformFeeRate || 0)).toFixed(2),
        );

        if (order.payment) {
          await this.paymentRepo.update(order.payment.id, {
            status: PaymentStatus.SUCCESS,
            outTradeNo: decrypted.transaction_id,
            payerAccount: decrypted.payer?.openid,
            channelFee,
            merchantNetAmount: Number((order.paidAmount - channelFee - platformFee).toFixed(2)),
            paySucceededAt: paidAt,
            responsePayload: JSON.stringify(decrypted),
          });
        }

        this.logger.log(`[微信回调] 处理成功 订单=${orderNo} 交易号=${decrypted.transaction_id}`);
      }

      return { code: 'SUCCESS', message: 'OK' };
    } catch (err) {
      this.logger.error(`[微信回调] 处理异常: ${err.message}`, err.stack);
      return { code: 'FAIL', message: err.message };
    }
  }

  /** 处理微信退款回调 */
  async handleWechatRefundNotify(body: any, headers: any): Promise<{ code: string; message: string }> {
    try {
      const { resource } = body;
      if (!resource) {
        return { code: 'FAIL', message: '无 resource 数据' };
      }

      // 1) 验签 headers
      const timestamp = headers['wechatpay-timestamp'] as string;
      const nonce = headers['wechatpay-nonce'] as string;
      const signature = headers['wechatpay-signature'] as string;
      const serial = headers['wechatpay-serial'] as string;

      // 2) 遍历商户解密退款通知（APIv3 密钥是商户级）
      const merchants = await this.merchantRepo.find({
        where: { wechatApiV3Key: MoreThan('') as any },
      });

      let decrypted: any = null;

      for (const m of merchants) {
        if (!m.wechatApiV3Key) continue;
        try {
          const wxClient = this.getWechatClient(m);
          // 验签（有证书缓存时校验，失败跳过此商户）
          if (timestamp && nonce && signature && serial) {
            const bodyStr = JSON.stringify(body);
            const signOk = wxClient.verifyNotifySignature(timestamp, nonce, bodyStr, signature, serial);
            if (!signOk) {
              this.logger.warn(`[微信退款回调] 验签失败 商户=${m.id} serial=${serial}`);
              continue;
            }
          }
          decrypted = wxClient.decryptNotifyResource(
            resource.ciphertext,
            resource.nonce,
            resource.associated_data,
          );
          break;
        } catch {
          continue;
        }
      }

      if (!decrypted) {
        this.logger.warn('[微信退款回调] 无法解密通知');
        return { code: 'FAIL', message: '无法解密' };
      }

      const outRefundNo = decrypted.out_refund_no;
      const refundStatus = decrypted.refund_status; // SUCCESS / CLOSED / PROCESSING / ABNORMAL

      this.logger.log(`[微信退款回调] 退款单号=${outRefundNo} 状态=${refundStatus}`);

      // 3) 幂等：查找退款单，已是终态则跳过
      const refundRepo = this.dataSource.getRepository(Refund);
      const refund = await refundRepo.findOne({
        where: { refundNo: outRefundNo },
        relations: ['order', 'order.payment'],
      });
      if (!refund) {
        this.logger.warn(`[微信退款回调] 退款单不存在: ${outRefundNo}`);
        return { code: 'SUCCESS', message: 'OK' };
      }

      // 已是终态 → 幂等返回
      if (refund.status === RefundStatus.SUCCESS) {
        this.logger.log(`[微信退款回调] 退款单已成功，跳过: ${outRefundNo}`);
        return { code: 'SUCCESS', message: 'OK' };
      }

      // PROCESSING 状态不更新，等待最终状态
      if (refundStatus === 'PROCESSING') {
        return { code: 'SUCCESS', message: 'OK' };
      }

      if (refundStatus === 'SUCCESS') {
        // 事务内加锁完成订单/支付状态迁移，防止与退款审批并发
        await this.dataSource.transaction(async (mgr) => {
          const lockedOrder = await mgr.findOne(Order, {
            where: { id: refund.orderId },
            lock: { mode: 'pessimistic_write' as any },
          });
          if (!lockedOrder) throw new Error('订单不存在');

          await mgr.update(Refund, refund.id, {
            status: RefundStatus.SUCCESS,
            outRefundNo: decrypted.refund_id || refund.outRefundNo,
            refundSucceededAt: new Date(decrypted.success_time || new Date()),
            notifyPayload: JSON.stringify(decrypted),
          });

          // 更新订单退款金额与状态（仅当订单未退款完成时）
          const newRefunded = Number(
            (Number(lockedOrder.refundedAmount || 0) + Number(refund.refundAmount)).toFixed(2),
          );
          const isFullRefund = Math.abs(newRefunded - Number(lockedOrder.paidAmount)) < 0.01;
          await mgr.update(Order, lockedOrder.id, {
            refundedAmount: newRefunded,
            status: isFullRefund ? OrderStatus.REFUNDED : OrderStatus.PARTIAL_REFUNDED,
          });
          if (refund.order?.payment?.id) {
            await mgr.update(Payment, refund.order.payment.id, {
              status: isFullRefund ? PaymentStatus.REFUNDED : PaymentStatus.REFUNDING,
            });
          }
        });
      } else if (refundStatus === 'CLOSED' || refundStatus === 'ABNORMAL') {
        // 退款失败/异常：仅更新退款单，不动订单金额
        const reason = decrypted.user_received_account
          ? `退款异常: ${refundStatus}`
          : refundStatus;
        await refundRepo.update(refund.id, {
          status: RefundStatus.FAILED,
          outRefundNo: decrypted.refund_id || refund.outRefundNo,
          errorCode: refundStatus,
          errorMessage: reason,
          notifyPayload: JSON.stringify(decrypted),
        });
      }

      return { code: 'SUCCESS', message: 'OK' };
    } catch (err) {
      this.logger.error(`[微信退款回调] 处理异常: ${err.message}`, err.stack);
      return { code: 'FAIL', message: err.message };
    }
  }
}

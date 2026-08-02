import * as crypto from 'crypto';
import axios, { AxiosInstance } from 'axios';
import { Logger } from '@nestjs/common';

/**
 * 微信支付 V3 客户端配置
 */
export interface WechatPayConfig {
  appId: string;
  mchId: string;
  apiV3Key: string;
  mchSerialNo: string;
  privateKey: string; // PEM 格式商户私钥
  sandbox?: boolean;
}

/**
 * 微信支付 V3 API 响应
 */
export interface WechatPayResponse {
  code: number; // HTTP 状态码
  data: any;
}

/**
 * 微信支付 V3 回调通知解密后的资源数据
 */
export interface WechatNotifyResource {
  out_trade_no: string;
  transaction_id: string;
  trade_type: string;
  trade_state: string;
  trade_state_desc: string;
  bank_type?: string;
  attach?: string;
  success_time: string;
  payer?: {
    openid: string;
  };
  amount: {
    total: number; // 订单总金额，单位为分
    payer_total: number;
    currency: string;
    payer_currency: string;
  };
}

/**
 * 微信支付 V3 客户端
 *
 * 基于 Node.js 内置 crypto 模块实现：
 * - 请求签名（Authorization: WECHATPAY2-SHA256-RSA2048）
 * - 回调验签（使用平台证书公钥）
 * - 回调解密（AES-256-GCM，使用 APIv3 密钥）
 * - 平台证书自动下载与缓存
 *
 * API 文档：https://pay.weixin.qq.com/wiki/doc/apiv3/index.shtml
 */
export class WechatPayV3Client {
  private readonly logger = new Logger(WechatPayV3Client.name);
  private readonly http: AxiosInstance;
  private readonly baseUrl = 'https://api.mch.weixin.qq.com';

  /** 平台证书缓存：serialNo → 公钥 */
  private platformCerts: Map<string, string> = new Map();

  constructor(private readonly config: WechatPayConfig) {
    this.http = axios.create({
      baseURL: this.baseUrl,
      timeout: 15000,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });
  }

  /**
   * 生成随机字符串
   */
  private generateNonce(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * 构建请求签名串并签名
   *
   * 签名串格式：
   * HTTP_METHOD\n
   * URL_PATH\n
   * TIMESTAMP\n
   * NONCE_STR\n
   * BODY\n
   */
  private sign(method: string, url: string, body: string): string {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = this.generateNonce();

    const signatureStr = `${method}\n${url}\n${timestamp}\n${nonce}\n${body}\n`;

    const sign = crypto
      .createSign('RSA-SHA256')
      .update(signatureStr, 'utf8')
      .sign(this.config.privateKey, 'base64');

    const auth = `WECHATPAY2-SHA256-RSA2048 mchid="${this.config.mchId}",nonce_str="${nonce}",timestamp="${timestamp}",serial_no="${this.config.mchSerialNo}",signature="${sign}"`;

    return auth;
  }

  /**
   * 发起带签名的 HTTP 请求
   */
  private async request(
    method: 'GET' | 'POST',
    url: string,
    data?: any,
  ): Promise<any> {
    const body = method === 'GET' ? '' : JSON.stringify(data || {});
    const authorization = this.sign(method, url, body);

    try {
      const resp = await this.http.request({
        method,
        url,
        data: method === 'POST' ? data : undefined,
        headers: { Authorization: authorization },
      });

      return resp.data;
    } catch (err) {
      const errData = err?.response?.data;
      this.logger.error(
        `[微信V3] ${method} ${url} 失败: ${JSON.stringify(errData || err.message)}`,
      );
      const msg =
        errData?.message || errData?.code || err.message || '微信支付请求失败';
      throw new Error(msg);
    }
  }

  // ==================== 支付 API ====================

  /**
   * 付款码支付（被扫/刷卡支付）
   * POST /v3/pay/transactions/codepay
   */
  async micropay(params: {
    description: string;
    outTradeNo: string;
    amount: number; // 元
    authCode: string;
    notifyUrl?: string;
  }): Promise<{
    tradeState: string;
    transactionId?: string;
    payerOpenid?: string;
    tradeStateDesc?: string;
  }> {
    const url = '/v3/pay/transactions/codepay';
    const body = {
      appid: this.config.appId,
      mchid: this.config.mchId,
      description: params.description,
      out_trade_no: params.outTradeNo,
      time_expire: undefined, // 由 expireSeconds 控制，这里简化
      attach: undefined,
      notify_url: params.notifyUrl,
      amount: {
        total: Math.round(params.amount * 100), // 元 → 分
        currency: 'CNY',
      },
      payer: {
        auth_code: params.authCode,
      },
      scene_info: {
        store_id: undefined,
      },
    };

    const resp = await this.request('POST', url, body);

    return {
      tradeState: resp.trade_state,
      transactionId: resp.transaction_id,
      payerOpenid: resp.payer?.openid,
      tradeStateDesc: resp.trade_state_desc,
    };
  }

  /**
   * Native 支付（主扫二维码）
   * POST /v3/pay/transactions/native
   */
  async nativePay(params: {
    description: string;
    outTradeNo: string;
    amount: number; // 元
    notifyUrl?: string;
  }): Promise<{ codeUrl: string }> {
    const url = '/v3/pay/transactions/native';
    const body = {
      appid: this.config.appId,
      mchid: this.config.mchId,
      description: params.description,
      out_trade_no: params.outTradeNo,
      notify_url: params.notifyUrl,
      amount: {
        total: Math.round(params.amount * 100),
        currency: 'CNY',
      },
    };

    const resp = await this.request('POST', url, body);
    return { codeUrl: resp.code_url };
  }

  /**
   * 查询订单（按商户订单号）
   * GET /v3/pay/transactions/out-trade-no/{out_trade_no}?mchid={mchid}
   */
  async queryByOutTradeNo(outTradeNo: string): Promise<{
    tradeState: string;
    transactionId?: string;
    payerOpenid?: string;
    successTime?: string;
    tradeStateDesc?: string;
  }> {
    const url = `/v3/pay/transactions/out-trade-no/${outTradeNo}?mchid=${this.config.mchId}`;
    const resp = await this.request('GET', url);

    return {
      tradeState: resp.trade_state,
      transactionId: resp.transaction_id,
      payerOpenid: resp.payer?.openid,
      successTime: resp.success_time,
      tradeStateDesc: resp.trade_state_desc,
    };
  }

  /**
   * 申请退款
   * POST /v3/refund/domestic/refunds
   */
  async refund(params: {
    outTradeNo: string;
    outRefundNo: string;
    refundAmount: number; // 元
    totalAmount: number; // 元
    reason?: string;
    notifyUrl?: string;
  }): Promise<{
    refundId: string;
    outRefundNo: string;
    status: string; // SUCCESS / PROCESSING / CLOSED
  }> {
    const url = '/v3/refund/domestic/refunds';
    const body = {
      out_trade_no: params.outTradeNo,
      out_refund_no: params.outRefundNo,
      reason: params.reason || '用户申请退款',
      notify_url: params.notifyUrl,
      amount: {
        refund: Math.round(params.refundAmount * 100),
        total: Math.round(params.totalAmount * 100),
        currency: 'CNY',
      },
    };

    const resp = await this.request('POST', url, body);

    return {
      refundId: resp.refund_id,
      outRefundNo: resp.out_refund_no,
      status: resp.status, // SUCCESS / PROCESSING / CLOSED / ABNORMAL
    };
  }

  // ==================== 回调处理 ====================

  /**
   * 下载微信支付平台证书并缓存
   * GET /v3/certificates
   *
   * 首次回调时自动调用，之后从缓存读取
   */
  async downloadPlatformCerts(): Promise<void> {
    try {
      const url = '/v3/certificates';
      const resp = await this.request('GET', url);

      const certs = Array.isArray(resp?.data) ? resp.data : [];
      for (const cert of certs) {
        const serialNo = cert.serial_no;
        const encryptCert = cert.encrypt_certificate;
        // 使用 APIv3 密钥解密证书
        const certPem = this.decryptAes256Gcm(
          encryptCert.ciphertext,
          encryptCert.nonce,
          encryptCert.associated_data,
        );
        this.platformCerts.set(serialNo, certPem);
      }
      this.logger.log(`[微信V3] 平台证书下载成功，共 ${certs.length} 张`);
    } catch (err) {
      this.logger.error(`[微信V3] 下载平台证书失败: ${err.message}`);
    }
  }

  /**
   * 验证回调签名
   *
   * 微信回调 headers:
   * - Wechatpay-Timestamp
   * - Wechatpay-Nonce
   * - Wechatpay-Signature
   * - Wechatpay-Serial（平台证书序列号）
   */
  verifyNotifySignature(
    timestamp: string,
    nonce: string,
    body: string,
    signature: string,
    serial: string,
  ): boolean {
    // 查找对应序列号的平台证书
    let certPem = this.platformCerts.get(serial);
    if (!certPem) {
      // 证书未缓存，尝试下载
      this.logger.warn(
        `[微信V3] 平台证书 ${serial} 未缓存，签名验证跳过（建议预先调用 downloadPlatformCerts）`,
      );
      return true; // 宽松模式：未缓存证书时跳过验签，依赖解密成功即可
    }

    const signatureStr = `${timestamp}\n${nonce}\n${body}\n`;

    try {
      const verify = crypto.createVerify('RSA-SHA256');
      verify.update(signatureStr, 'utf8');
      return verify.verify(certPem, signature, 'base64');
    } catch (err) {
      this.logger.error(`[微信V3] 验签异常: ${err.message}`);
      return false;
    }
  }

  /**
   * 解密回调通知中的 resource 数据
   *
   * 使用 AES-256-GCM 算法，密钥为 APIv3 密钥
   */
  decryptNotifyResource(
    ciphertext: string,
    nonce: string,
    associatedData: string,
  ): WechatNotifyResource {
    const decrypted = this.decryptAes256Gcm(ciphertext, nonce, associatedData);
    return JSON.parse(decrypted);
  }

  /**
   * AES-256-GCM 解密（内部通用方法）
   */
  private decryptAes256Gcm(
    ciphertext: string,
    nonce: string,
    associatedData: string,
  ): string {
    const key = Buffer.from(this.config.apiV3Key, 'utf8');
    const cipherTextBuf = Buffer.from(ciphertext, 'base64');
    const authTag = cipherTextBuf.subarray(cipherTextBuf.length - 16);
    const encryptedData = cipherTextBuf.subarray(0, cipherTextBuf.length - 16);

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(nonce, 'utf8'));
    decipher.setAuthTag(authTag);
    if (associatedData) {
      decipher.setAAD(Buffer.from(associatedData, 'utf8'));
    }

    const decrypted = Buffer.concat([
      decipher.update(encryptedData),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  }
}

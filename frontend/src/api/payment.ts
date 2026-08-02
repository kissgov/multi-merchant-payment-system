import request from './request';

/** 被扫收款（商家扫用户付款码） */
export const micropay = (data: {
  channel: 'alipay' | 'wechat';
  amount: number;
  authCode: string;
  subject?: string;
  body?: string;
  expireSeconds?: number;
}) => request.post('/api/payment/micropay', data);

/** 生成收款二维码（主扫） */
export const createQrCode = (data: {
  channel: 'alipay' | 'wechat';
  amount: number;
  subject?: string;
  body?: string;
  expireSeconds?: number;
}) => request.post('/api/payment/qrcode', data);

/** 查询支付状态（收银台轮询用：静默请求，不显示 loading/不弹错误，不取消重复） */
export const queryPayment = (orderId: string) =>
  request.get(`/api/payment/${orderId}/query`, {
    showLoading: false,
    showError: false,
    cancelDuplicate: false,
  } as any);

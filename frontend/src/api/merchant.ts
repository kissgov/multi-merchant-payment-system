import request from './request';

export const getMyMerchant = () => request.get('/api/merchants/my');

export const updatePaymentConfig = (data: any) =>
  request.patch('/api/merchants/my/payment-config', data);

export const updateMerchantBasicInfo = (data: any) =>
  request.patch('/api/merchants/my/basic-info', data);

export const getMerchantList = (params: {
  page?: number;
  pageSize?: number;
  keyword?: string;
  status?: string;
}) => request.get('/api/merchants', { params });

export const createMerchant = (data: any) =>
  request.post('/api/merchants', data);

export const updateMerchantStatus = (id: string, status: string) =>
  request.patch(`/api/merchants/${id}/status`, { status });

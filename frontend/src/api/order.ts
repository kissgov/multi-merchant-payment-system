import request from './request';

export interface OrderQuery {
  page?: number;
  pageSize?: number;
  startDate?: string;
  endDate?: string;
  status?: string;
  channel?: string;
  keyword?: string;
  storeId?: string;
  employeeId?: string;
}

export const getOrderList = (params: OrderQuery) =>
  request.get('/api/orders', { params });

export const getOrderDetail = (orderId: string) =>
  request.get(`/api/orders/${orderId}`);

export const refundOrder = (data: {
  orderId: string;
  refundAmount: number;
  reasonCode?: string;
  reason: string;
}) => request.post('/api/orders/refund', data);

export const closeOrder = (orderId: string) =>
  request.patch(`/api/orders/${orderId}/close`);

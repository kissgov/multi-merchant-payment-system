import request from './request';

export interface RefundQuery {
  page?: number;
  pageSize?: number;
  startDate?: string;
  endDate?: string;
  status?: string;
  channel?: string;
  keyword?: string;
  storeId?: string;
  operatorId?: string;
  reasonCode?: string;
  amountMin?: number;
  amountMax?: number;
}

export const getRefundList = (params: RefundQuery) =>
  request.get('/api/refunds', { params });

export const getRefundDetail = (refundId: string) =>
  request.get(`/api/refunds/${refundId}`);

export const applyRefund = (data: {
  orderId: string;
  refundAmount: number;
  reasonCode: string;
  reason: string;
  evidenceImages?: string[];
}) => request.post('/api/refunds', data);

export const auditRefund = (
  refundId: string,
  data: { decision: 'approve' | 'reject'; rejectReason?: string },
) => request.post(`/api/refunds/${refundId}/audit`, data);

export const getReasonCodes = () =>
  request.get('/api/refunds/reason-codes');

export const getPendingCount = () =>
  request.get('/api/refunds/pending-count');

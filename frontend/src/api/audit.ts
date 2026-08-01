import request from './request';

export const getAuditLogs = (params: {
  page?: number;
  pageSize?: number;
  startDate?: string;
  endDate?: string;
  module?: string;
  action?: string;
  operatorId?: string;
  keyword?: string;
  success?: boolean;
}) => request.get('/api/audit-logs', { params });

import request from './request';

export const getSummary = (params: {
  startDate?: string;
  endDate?: string;
  storeId?: string;
  employeeId?: string;
}) => request.get('/api/reports/summary', { params });

export const getTrend = (params: {
  startDate?: string;
  endDate?: string;
  granularity?: 'day' | 'hour';
  storeId?: string;
}) => request.get('/api/reports/trend', { params });

/** 大屏数据：silent=true 时静默请求（定时轮询不显示 loading/不弹错误） */
export const getBigScreen = (silent = false) =>
  request.get('/api/reports/big-screen', {
    showLoading: !silent,
    showError: !silent,
    cancelDuplicate: false,
  } as any);

export const getCashierDashboard = () =>
  request.get('/api/reports/cashier-dashboard');

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

export const getBigScreen = () => request.get('/api/reports/big-screen');

export const getCashierDashboard = () =>
  request.get('/api/reports/cashier-dashboard');

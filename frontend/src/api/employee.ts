import request from './request';

export const getEmployeeList = (params: {
  page?: number;
  pageSize?: number;
  keyword?: string;
  role?: string;
  status?: string;
  storeId?: string;
}) => request.get('/api/employees', { params });

export const getEmployeeDetail = (id: string) =>
  request.get(`/api/employees/${id}`);

export const createEmployee = (data: any) =>
  request.post('/api/employees', data);

export const updateEmployee = (id: string, data: any) =>
  request.patch(`/api/employees/${id}`, data);

export const resetPassword = (id: string, newPassword: string) =>
  request.post(`/api/employees/${id}/reset-password`, { newPassword });

export const toggleEmployeeStatus = (id: string, status: string) =>
  request.patch(`/api/employees/${id}/status`, { status });

import request from './request';

export const getStoreList = (params: {
  page?: number;
  pageSize?: number;
  keyword?: string;
  status?: string;
}) => request.get('/api/stores', { params });

export const getStoreDropdown = () => request.get('/api/stores/dropdown');

export const getStoreDetail = (id: string) =>
  request.get(`/api/stores/${id}`);

export const createStore = (data: any) => request.post('/api/stores', data);

export const updateStore = (id: string, data: any) =>
  request.patch(`/api/stores/${id}`, data);

export const updateStoreStatus = (id: string, status: string) =>
  request.patch(`/api/stores/${id}/status`, { status });

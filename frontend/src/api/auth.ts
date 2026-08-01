import request from './request';

export interface LoginDto {
  username: string;
  password: string;
}

export interface LoginResult {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  employee: {
    id: string;
    employeeNo: string;
    name: string;
    role: string;
    roleId?: string;
    merchantId: string;
    storeId: string;
    avatar: string;
    phone?: string;
    username: string;
  };
}

export const login = (data: LoginDto) =>
  request.post<any, LoginResult>('/api/auth/login', data);

export const getMe = () => request.get('/api/auth/me');

export const changePassword = (oldPassword: string, newPassword: string) =>
  request.patch('/api/auth/password', { oldPassword, newPassword });

import axios, { type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useUserStore } from '@/stores/user';
import router from '@/router';
import { getApiBaseUrl } from '@/utils/desktop';

const service: AxiosInstance = axios.create({
  baseURL: getApiBaseUrl(),
  timeout: 30000,
});

// 请求拦截器：附加 JWT Token
service.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const userStore = useUserStore();
    if (userStore.token) {
      config.headers.Authorization = `Bearer ${userStore.token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// 响应拦截器：统一处理错误
service.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const { response } = error;
    if (response) {
      const { status, data } = response;
      const message = data?.message || '请求失败';

      if (status === 401) {
        const userStore = useUserStore();
        ElMessageBox.confirm('登录状态已过期，请重新登录', '提示', {
          confirmButtonText: '重新登录',
          cancelButtonText: '取消',
          type: 'warning',
        }).then(() => {
          userStore.logout();
          router.push('/login');
        });
      } else if (status === 403) {
        ElMessage.error(message || '无权限执行此操作');
      } else if (status === 400) {
        ElMessage.error(message);
      } else if (status >= 500) {
        ElMessage.error('服务器异常，请稍后重试');
      } else {
        ElMessage.error(message);
      }
    } else {
      ElMessage.error('网络异常，请检查网络连接');
    }
    return Promise.reject(error);
  },
);

export default service;

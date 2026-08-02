import axios, { type AxiosInstance, type InternalAxiosRequestConfig, type AxiosResponse, type Canceler } from 'axios';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useUserStore } from '@/stores/user';
import { useAppStore } from '@/stores/app';
import router from '@/router';
import { getApiBaseUrl } from '@/utils/desktop';

/**
 * 扩展 Axios 请求配置：允许自定义请求级别行为
 * - showLoading: 是否显示全局 loading（默认 true）
 * - showError: 是否自动弹出错误消息（默认 true）
 * - cancelDuplicate: 是否取消同 URL+Method 的正在进行请求（默认 true，防止重复提交）
 */
interface RequestConfig extends InternalAxiosRequestConfig {
  showLoading?: boolean;
  showError?: boolean;
  cancelDuplicate?: boolean;
}

/** 后端统一响应结构（来自 TransformInterceptor） */
interface ApiResponse<T = any> {
  code: number;
  message: string;
  data: T;
  path?: string;
  timestamp?: string;
}

const service: AxiosInstance = axios.create({
  baseURL: getApiBaseUrl(),
  timeout: 30000,
});

// ========== 重复请求取消 ==========
// key = method + url，value = cancel 函数
const pendingRequests = new Map<string, Canceler>();

function getRequestKey(config: InternalAxiosRequestConfig): string {
  return `${config.method?.toUpperCase() || 'GET'}:${config.url || ''}`;
}

function addPending(config: InternalAxiosRequestConfig) {
  const key = getRequestKey(config);
  if (pendingRequests.has(key)) {
    // 取消上一个相同请求
    const cancel = pendingRequests.get(key)!;
    cancel('duplicate_request_cancelled');
  }
  // eslint-disable-next-line no-param-reassign
  config.signal = config.signal || AbortSignal.timeout?.(30000);
  const controller = new AbortController();
  // eslint-disable-next-line no-param-reassign
  config.signal = controller.signal;
  pendingRequests.set(key, (reason?: string) => controller.abort(reason));
}

function removePending(config: InternalAxiosRequestConfig) {
  const key = getRequestKey(config);
  pendingRequests.delete(key);
}

// ========== 请求拦截器 ==========
service.interceptors.request.use(
  (config: RequestConfig) => {
    // 默认值
    if (config.showLoading === undefined) config.showLoading = true;
    if (config.showError === undefined) config.showError = true;
    if (config.cancelDuplicate === undefined) config.cancelDuplicate = true;

    // 1) 重复请求取消
    if (config.cancelDuplicate) addPending(config);

    // 2) 全局 loading
    if (config.showLoading) {
      useAppStore().startLoading();
    }

    // 3) 附加 JWT Token
    const userStore = useUserStore();
    if (userStore.token) {
      config.headers.Authorization = `Bearer ${userStore.token}`;
    }
    return config;
  },
  (error) => {
    useAppStore().endLoading();
    return Promise.reject(error);
  },
);

// ========== 响应拦截器 ==========
service.interceptors.response.use(
  (response: AxiosResponse<ApiResponse>) => {
    const config = response.config as RequestConfig;
    removePending(config);
    if (config.showLoading) useAppStore().endLoading();

    const body = response.data;

    // 旧响应兼容：后端有些老接口尚未包装 code/message/data → 原样透传
    if (
      body === null ||
      typeof body !== 'object' ||
      !('code' in body) ||
      typeof (body as any).code !== 'number'
    ) {
      return body as any;
    }

    // code === 200 / 201 → 成功，只返回 data 字段（简化业务层）
    if (body.code >= 200 && body.code < 300) {
      return body.data;
    }

    // 非 2xx code → 业务层错误
    if (config.showError) {
      ElMessage.error(body.message || '请求失败');
    }
    return Promise.reject(
      Object.assign(new Error(body.message || 'request failed'), {
        response,
        code: body.code,
        bizData: body.data,
      }),
    );
  },
  (error: any) => {
    const config = error?.config as RequestConfig | undefined;
    if (config) {
      removePending(config);
      if (config.showLoading) useAppStore().endLoading();
    }

    // 被主动取消的请求（duplicate_request_cancelled）→ 静默忽略，不弹提示
    if (axios.isCancel(error) || error?.code === 'ERR_CANCELED') {
      return Promise.reject(error);
    }

    const { response } = error;
    let message = error?.message || '请求失败';

    if (response) {
      const { status, data } = response;
      message = (data as any)?.message || message;

      if (status === 401) {
        const userStore = useUserStore();
        // 防止重复弹窗
        if (!(window as any).__loginExpiredShown) {
          (window as any).__loginExpiredShown = true;
          ElMessageBox.confirm('登录状态已过期，请重新登录', '提示', {
            confirmButtonText: '重新登录',
            cancelButtonText: '取消',
            type: 'warning',
          })
            .then(() => {
              userStore.logout();
              router.push('/login');
            })
            .finally(() => {
              (window as any).__loginExpiredShown = false;
            });
        }
      } else if (status === 403) {
        if (config?.showError !== false) {
          ElMessage.error(message || '无权限执行此操作');
        }
      } else if (status === 400) {
        if (config?.showError !== false) ElMessage.error(message);
      } else if (status >= 500) {
        if (config?.showError !== false) ElMessage.error('服务器异常，请稍后重试');
      } else if (config?.showError !== false) {
        ElMessage.error(message);
      }
    } else if (config?.showError !== false) {
      ElMessage.error('网络异常，请检查网络连接');
    }
    return Promise.reject(error);
  },
);

export default service;

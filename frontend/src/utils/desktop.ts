/**
 * 桌面端环境检测与适配
 */

/** 是否运行在 Electron 桌面应用中 */
export const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI;

/** 获取桌面端环境信息 */
export function getDesktopInfo() {
  if (isElectron) {
    return (window as any).electronAPI;
  }
  return { isElectron: false, platform: 'web' };
}

/**
 * 获取 API Base URL
 * - 桌面端：从本地配置或默认地址读取（因为桌面端不走 Vite 代理）
 * - Web 端：使用 Vite 环境变量
 */
export function getApiBaseUrl(): string {
  if (isElectron) {
    // 桌面端：默认连接本地后端，可扩展为从配置文件读取
    return localStorage.getItem('apiBaseUrl') || 'https://pay.kxrdyf.cn';
  }
  // Web 开发模式用 Vite proxy（返回空字符串走代理）
  return import.meta.env.VITE_API_BASE_URL || '';
}

/** 设置 API Base URL（桌面端配置页面用） */
export function setApiBaseUrl(url: string) {
  localStorage.setItem('apiBaseUrl', url);
}

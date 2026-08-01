const { contextBridge } = require('electron');

// 通过 contextBridge 暴露安全 API 给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  isElectron: true,
  appVersion: '1.0.0',
});

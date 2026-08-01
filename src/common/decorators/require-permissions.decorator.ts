import { SetMetadata } from '@nestjs/common';

/**
 * 功能权限点装饰器
 *
 * 使用示例：
 *   @RequirePermissions('order:list', 'order:refund')
 *   // 需要同时拥有 order:list 权限
 * 且  order:refund 权限
 *
 * 若只需其中一个请传第二个参数为 'or'（默认 'and'）
 */
export const PERMISSIONS_KEY = 'require_permissions';
export const PERMISSIONS_MODE_KEY = 'require_permissions_mode';

export type PermissionsMode = 'and' | 'or';

export const RequirePermissions = (
  permKeys: string[],
  mode: PermissionsMode = 'and',
) => {
  return (target: any, propertyKey?: string, descriptor?: PropertyDescriptor) => {
    SetMetadata(PERMISSIONS_KEY, permKeys)(target, propertyKey, descriptor);
    SetMetadata(PERMISSIONS_MODE_KEY, mode)(target, propertyKey, descriptor);
  };
};

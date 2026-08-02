import { SetMetadata } from '@nestjs/common';

/**
 * 标记接口为公开（无需 JWT 认证）。
 * JwtAuthGuard 检查 'isPublic' 元数据，标记了的路由直接放行。
 */
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

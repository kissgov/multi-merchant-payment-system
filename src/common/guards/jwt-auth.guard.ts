import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';

/**
 * 全局 JWT 认证守卫
 *
 * 设计说明：
 * - 作为 APP_GUARD 注册在 PermissionGuard 之前，确保受保护路由在权限判断前
 *   已完成 JWT 认证并将 req.user 注入上下文。
 * - 通过 @Public() 装饰器或 PUBLIC_PATHS 白名单放行公开接口（如登录）。
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  /** 不需要认证的公开路由前缀 */
  private static PUBLIC_PATHS = ['/api/auth/login'];

  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    const path: string = req.path || '';

    // 1) 公开路由白名单直接放行
    if (
      JwtAuthGuard.PUBLIC_PATHS.some(
        (p) => path === p || path.startsWith(p + '/'),
      )
    ) {
      return true;
    }

    // 2) @Public() 装饰器标记的接口放行
    const isPublic = this.reflector.getAllAndOverride<boolean>('isPublic', [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    // 3) 其余接口走 JWT 认证
    return super.canActivate(context);
  }
}

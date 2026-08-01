import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { EmployeeRole } from '../../entities/employee.entity';

/**
 * 角色权限守卫
 * 按权限层级判断，高权限自动拥有低权限能力
 */
@Injectable()
export class RolesGuard implements CanActivate {
  // 角色权限层级（数字越大权限越高）
  private readonly roleHierarchy: Record<EmployeeRole, number> = {
    [EmployeeRole.SUPER_ADMIN]: 100,
    [EmployeeRole.MERCHANT_OWNER]: 80,
    [EmployeeRole.MERCHANT_ADMIN]: 60,
    [EmployeeRole.STORE_MANAGER]: 40,
    [EmployeeRole.CASHIER]: 20,
  };

  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<EmployeeRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // 没有声明权限要求则放行
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    if (!user) {
      throw new ForbiddenException('未登录或登录已过期');
    }

    const userRoleLevel = this.roleHierarchy[user.role] ?? 0;
    const hasPermission = requiredRoles.some(
      (requiredRole) => userRoleLevel >= this.roleHierarchy[requiredRole],
    );

    if (!hasPermission) {
      throw new ForbiddenException(`无权限执行此操作，需要角色: ${requiredRoles.join(' / ')}`);
    }

    return true;
  }
}

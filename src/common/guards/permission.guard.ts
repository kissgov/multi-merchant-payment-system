import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
  Inject,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  PERMISSIONS_KEY,
  PERMISSIONS_MODE_KEY,
  PermissionsMode,
} from '../decorators/require-permissions.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { Employee, EmployeeRole } from '../../entities/employee.entity';
import { Role } from '../../entities/role.entity';
import { Menu } from '../../entities/menu.entity';

// 角色权限层级映射（兼容旧的 Roles 守卫）
const ROLE_LEVEL: Record<EmployeeRole, number> = {
  [EmployeeRole.SUPER_ADMIN]: 100,
  [EmployeeRole.MERCHANT_OWNER]: 80,
  [EmployeeRole.MERCHANT_ADMIN]: 60,
  [EmployeeRole.STORE_MANAGER]: 40,
  [EmployeeRole.CASHIER]: 20,
};

/**
 * 统一权限守卫：同时支持
 *   1. @Roles(EmployeeRole.XXX)   → 角色层级权限
 *   2. @RequirePermissions(['a','b'], 'and'|'or') → 细粒度功能权限点
 *
 * 判断顺序：
 *   a) 若用户是 SUPER_ADMIN → 直接放行
 *   b) 若接口使用 @Roles 装饰器 → 按角色层级判断
 *   c) 若接口使用 @RequirePermissions → 拉取用户自定义角色的权限点集合判断
 *   d) 都未声明 → 放行（认证已由 AuthGuard 负责）
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    @InjectRepository(Employee)
    private employeeRepo: Repository<Employee>,
    @InjectRepository(Role)
    private roleRepo: Repository<Role>,
  ) {}

  private _permCache: Map<string, Promise<Set<string>>> = new Map();

  /**
   * 取得一个员工的全部权限点集合
   * 优先：自定义角色 roleId → menus.permKey
   * 其次：根据内置 EmployeeRole 返回默认权限包
   */
  async getEmployeePermKeys(emp: {
    id: string;
    role: EmployeeRole;
    roleId?: string;
    merchantId: string;
  }): Promise<Set<string>> {
    const cacheKey = `${emp.id}:${emp.roleId || emp.role}`;
    if (this._permCache.has(cacheKey)) return this._permCache.get(cacheKey);

    const promise = (async () => {
      // 1. 自定义角色
      if (emp.roleId) {
        const role = await this.roleRepo
          .createQueryBuilder('r')
          .leftJoinAndSelect('r.menus', 'm')
          .where('r.id = :rid', { rid: emp.roleId })
          .andWhere('r.enabled = 1')
          .getOne();
        if (role?.menus?.length) {
          return new Set(role.menus.map((m) => m.permKey).filter(Boolean));
        }
      }
      // 2. 内置角色返回默认权限
      return new Set(this.getDefaultPermKeysByRole(emp.role));
    })();

    this._permCache.set(cacheKey, promise);
    // 5分钟缓存
    setTimeout(() => this._permCache.delete(cacheKey), 5 * 60 * 1000);
    return promise;
  }

  /** 内置角色默认权限包（PC端后台） */
  getDefaultPermKeysByRole(role: EmployeeRole): string[] {
    const all = DEFAULT_ALL_PERM_KEYS;
    switch (role) {
      case EmployeeRole.SUPER_ADMIN:
        return all; // 平台全部
      case EmployeeRole.MERCHANT_OWNER:
        return all.filter((k) => !k.startsWith('platform:')); // 除平台管理外全有
      case EmployeeRole.MERCHANT_ADMIN:
        return all.filter(
          (k) =>
            !k.startsWith('platform:') &&
            !k.startsWith('rbac:') && // 不含权限管理
            !k.startsWith('payment_config:'), // 不含支付配置
        );
      case EmployeeRole.STORE_MANAGER:
        return [
          'dashboard:view',
          'payment:micropay',
          'payment:qrcode',
          'payment:query',
          'order:list',
          'order:detail',
          'order:refund',
          'order:close',
          'report:view',
          'report:trend',
          'store:view',
          'employee:view',
          'employee:create_cashier',
          'refund:view',
          'refund:audit',
        ];
      case EmployeeRole.CASHIER:
      default:
        return [
          'dashboard:view',
          'payment:micropay',
          'payment:qrcode',
          'payment:query',
          'order:list',
          'order:detail',
          'order:refund_self',
          'refund:view_self',
        ];
    }
  }

  /** 不需要认证的公开路由 */
  private static PUBLIC_PATHS = [
    '/api/auth/login',
    '/api/payment/notify', // 支付宝/微信支付回调（公网回调，无法携带 JWT）
  ];

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // @Public() 装饰器标记的接口直接放行（与健康检查、支付回调等公开接口一致）
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const req = context.switchToHttp().getRequest();
    // 公开路由白名单（登录接口等）直接放行
    if (PermissionGuard.PUBLIC_PATHS.some((p) => req.path === p || req.path.startsWith(p + '/'))) {
      return true;
    }
    const user = req.user;
    if (!user) {
      throw new UnauthorizedException('未登录或登录已过期');
    }

    // 1) 超级管理员放行
    if (user.role === EmployeeRole.SUPER_ADMIN) return true;

    // 2) @Roles 层级判断
    const requiredRoles = this.reflector.getAllAndOverride<EmployeeRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (requiredRoles?.length) {
      const userLevel = ROLE_LEVEL[user.role] ?? 0;
      const ok = requiredRoles.some((r) => userLevel >= ROLE_LEVEL[r]);
      if (!ok) throw new ForbiddenException('角色权限不足');
    }

    // 3) @RequirePermissions 功能权限点判断
    const requiredPerms = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const permMode =
      this.reflector.getAllAndOverride<PermissionsMode>(PERMISSIONS_MODE_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? 'and';

    if (requiredPerms?.length) {
      const empPerms = await this.getEmployeePermKeys(user);
      // 老板 / 内置 merchant_owner 拥有全部非平台权限，直接放行
      if (
        user.role === EmployeeRole.MERCHANT_OWNER &&
        requiredPerms.every((k) => !k.startsWith('platform:'))
      ) {
        return true;
      }
      const match =
        permMode === 'and'
          ? requiredPerms.every((p) => empPerms.has(p))
          : requiredPerms.some((p) => empPerms.has(p));
      if (!match) {
        throw new ForbiddenException(
          `缺少功能权限：${requiredPerms.join(permMode === 'and' ? ' 且 ' : ' 或 ')}`,
        );
      }
    }

    return true;
  }
}

/**
 * 默认系统全部权限点（与 menus 表里的 permKey 对应）
 * 这里是"权限字典"，新增权限点必须同时加到这里 & menu seeder
 */
export const DEFAULT_ALL_PERM_KEYS = [
  // ==== 仪表盘 ====
  'dashboard:view',
  'dashboard:big_screen',

  // ==== 收款模块 ====
  'payment:micropay',
  'payment:qrcode',
  'payment:query',

  // ==== 订单模块 ====
  'order:list',
  'order:detail',
  'order:refund',          // 任意退
  'order:refund_self',     // 退自己的
  'order:close',
  'order:export',

  // ==== 退款管理（独立模块） ====
  'refund:view',
  'refund:view_self',
  'refund:audit',          // 退款审核
  'refund:detail',
  'refund:export',

  // ==== 报表 ====
  'report:view',
  'report:trend',
  'report:export',
  'report:cashier_dashboard',

  // ==== 商户管理（平台侧） ====
  'platform:merchant_list',
  'platform:merchant_create',
  'platform:merchant_update',
  'platform:merchant_status',
  'payment_config:manage',

  // ==== 商户内：门店 ====
  'store:list',
  'store:view',
  'store:create',
  'store:update',
  'store:status',

  // ==== 商户内：员工 ====
  'employee:list',
  'employee:view',
  'employee:create',
  'employee:create_cashier',
  'employee:update',
  'employee:reset_password',
  'employee:status',

  // ==== 商户内：角色权限管理 ====
  'rbac:role_list',
  'rbac:role_view',
  'rbac:role_create',
  'rbac:role_update',
  'rbac:role_delete',
  'rbac:menu_list',
  'rbac:menu_manage',

  // ==== 审计日志 ====
  'audit:view',
  'audit:export',

  // ==== 个人中心 ====
  'profile:view',
  'profile:change_password',
];

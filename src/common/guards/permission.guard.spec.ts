import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Test } from '@nestjs/testing';

import { PermissionGuard } from './permission.guard';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { Employee, EmployeeRole } from '../../entities/employee.entity';
import { Role } from '../../entities/role.entity';

/**
 * R7 风险测试：@Public() 装饰器放行公开接口
 *
 * 风险命名：健康检查 / 支付回调等公网接口无法携带 JWT。若守卫不放行 @Public() 标记的
 *          接口，PM2/Nginx 健康探测会收到 401 → 误判服务下线；支付渠道回调失败 → 订单无法入账。
 *          PermissionGuard.canActivate 必须在所有权限判断之前检查 IS_PUBLIC_KEY 并放行。
 */
describe('PermissionGuard (R7: @Public 装饰器放行)', () => {
  let guard: PermissionGuard;
  let reflector: Reflector;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        PermissionGuard,
        {
          provide: Reflector,
          useValue: {
            getAllAndOverride: jest.fn((key: string) => (key === IS_PUBLIC_KEY ? true : undefined)),
          },
        },
        { provide: getRepositoryToken(Employee), useValue: {} },
        { provide: getRepositoryToken(Role), useValue: {} },
      ],
    }).compile();
    guard = moduleRef.get(PermissionGuard);
    reflector = moduleRef.get(Reflector);
  });

  const makeContext = (path = '/api/health'): ExecutionContext =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ path }) }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as any);

  it('@Public 标记的接口 → 直接放行（不检查 user/role）', async () => {
    const ctx = makeContext('/api/health');
    // 即使没有 user 也应放行
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('@Public 放行时不读取 req.user（避免对未认证请求抛 Unauthorized）', async () => {
    const ctx = makeContext('/api/payment/notify/alipay');
    const req: any = {}; // 显式无 user
    (ctx.switchToHttp().getRequest as any) = () => req;
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });
});

/**
 * 补充：非 @Public 接口且无 user → 抛 UnauthorizedException
 * （锁住「@Public 检查必须先于 user 检查」的顺序，防止回归把公开检查挪到后面）
 */
describe('PermissionGuard (非 @Public 接口认证检查)', () => {
  let guard: PermissionGuard;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        PermissionGuard,
        {
          provide: Reflector,
          useValue: {
            // 非 @Public、非 @Roles、非 @RequirePermissions
            getAllAndOverride: jest.fn(() => undefined),
          },
        },
        { provide: getRepositoryToken(Employee), useValue: {} },
        { provide: getRepositoryToken(Role), useValue: {} },
      ],
    }).compile();
    guard = moduleRef.get(PermissionGuard);
  });

  it('非 @Public 接口且 req.user 为空 → 抛 UnauthorizedException', async () => {
    const ctx = {
      switchToHttp: () => ({ getRequest: () => ({ path: '/api/order/list' }) }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as any;
    await expect(guard.canActivate(ctx)).rejects.toThrow(/未登录或登录已过期/);
  });

  it('非 @Public 接口且 user 为 SUPER_ADMIN → 放行', async () => {
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({ path: '/api/order/list', user: { role: EmployeeRole.SUPER_ADMIN } }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as any;
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });
});

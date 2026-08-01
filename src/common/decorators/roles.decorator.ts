import { SetMetadata } from '@nestjs/common';
import { EmployeeRole } from '../entities/employee.entity';

/**
 * 角色权限装饰器
 * 使用示例: @Roles(EmployeeRole.MERCHANT_OWNER, EmployeeRole.STORE_MANAGER)
 */
export const ROLES_KEY = 'roles';
export const Roles = (...roles: EmployeeRole[]) => SetMetadata(ROLES_KEY, roles);

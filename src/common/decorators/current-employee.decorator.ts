import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * 获取当前登录员工装饰器
 * 使用示例: @CurrentEmployee() employee: EmployeePayload
 */
export interface EmployeePayload {
  id: string;
  employeeNo: string;
  merchantId: string;
  storeId: string;
  name: string;
  username: string;
  role: string;
}

export const CurrentEmployee = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): EmployeePayload => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);

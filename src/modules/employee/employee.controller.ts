import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';

import { EmployeeService, CreateEmployeeDto } from './employee.service';
import { CurrentEmployee, EmployeePayload } from '../../common/decorators/current-employee.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { EmployeeRole, EmployeeStatus } from '../../entities/employee.entity';

@ApiTags('员工模块 - Employee')
@Controller('api/employees')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth()
export class EmployeeController {
  constructor(private readonly employeeService: EmployeeService) {}

  @Post()
  @Roles(
    EmployeeRole.SUPER_ADMIN,
    EmployeeRole.MERCHANT_OWNER,
    EmployeeRole.MERCHANT_ADMIN,
    EmployeeRole.STORE_MANAGER,
  )
  @ApiOperation({
    summary: '创建员工',
    description:
      '角色权限限制：老板可创建所有非平台管理员角色；店长仅可创建本门店收银员；可指定收款/退款权限与限额。',
  })
  async create(
    @CurrentEmployee() emp: EmployeePayload,
    @Body() dto: CreateEmployeeDto,
  ) {
    return this.employeeService.create(emp, dto);
  }

  @Get()
  @Roles(
    EmployeeRole.SUPER_ADMIN,
    EmployeeRole.MERCHANT_OWNER,
    EmployeeRole.MERCHANT_ADMIN,
    EmployeeRole.STORE_MANAGER,
    EmployeeRole.CASHIER,
  )
  @ApiOperation({ summary: '员工列表' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'pageSize', required: false })
  @ApiQuery({ name: 'keyword', required: false, description: '姓名/账号/工号/手机号' })
  @ApiQuery({ name: 'role', required: false, enum: EmployeeRole })
  @ApiQuery({ name: 'status', required: false, enum: EmployeeStatus })
  @ApiQuery({ name: 'storeId', required: false })
  async list(
    @CurrentEmployee() emp: EmployeePayload,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
    @Query('keyword') keyword?: string,
    @Query('role') role?: EmployeeRole,
    @Query('status') status?: EmployeeStatus,
    @Query('storeId') storeId?: string,
  ) {
    return this.employeeService.list(emp, page, pageSize, keyword, role, status, storeId);
  }

  @Get(':employeeId')
  @Roles(
    EmployeeRole.SUPER_ADMIN,
    EmployeeRole.MERCHANT_OWNER,
    EmployeeRole.MERCHANT_ADMIN,
    EmployeeRole.STORE_MANAGER,
    EmployeeRole.CASHIER,
  )
  @ApiOperation({ summary: '员工详情' })
  async detail(
    @CurrentEmployee() emp: EmployeePayload,
    @Param('employeeId') employeeId: string,
  ) {
    return this.employeeService.detail(emp, employeeId);
  }

  @Patch(':employeeId')
  @Roles(
    EmployeeRole.SUPER_ADMIN,
    EmployeeRole.MERCHANT_OWNER,
    EmployeeRole.MERCHANT_ADMIN,
    EmployeeRole.STORE_MANAGER,
  )
  @ApiOperation({ summary: '更新员工信息/权限/限额' })
  async update(
    @CurrentEmployee() emp: EmployeePayload,
    @Param('employeeId') employeeId: string,
    @Body() dto: any,
  ) {
    return this.employeeService.update(emp, employeeId, dto);
  }

  @Post(':employeeId/reset-password')
  @HttpCode(200)
  @Roles(
    EmployeeRole.SUPER_ADMIN,
    EmployeeRole.MERCHANT_OWNER,
    EmployeeRole.MERCHANT_ADMIN,
    EmployeeRole.STORE_MANAGER,
  )
  @ApiOperation({ summary: '重置员工密码' })
  async resetPassword(
    @CurrentEmployee() emp: EmployeePayload,
    @Param('employeeId') employeeId: string,
    @Body() body: { newPassword: string },
  ) {
    return this.employeeService.resetPassword(emp, employeeId, body.newPassword);
  }

  @Patch(':employeeId/status')
  @Roles(
    EmployeeRole.SUPER_ADMIN,
    EmployeeRole.MERCHANT_OWNER,
    EmployeeRole.MERCHANT_ADMIN,
    EmployeeRole.STORE_MANAGER,
  )
  @ApiOperation({ summary: '启用/禁用员工账户' })
  async toggleStatus(
    @CurrentEmployee() emp: EmployeePayload,
    @Param('employeeId') employeeId: string,
    @Body() body: { status: EmployeeStatus },
  ) {
    return this.employeeService.toggleStatus(emp, employeeId, body.status);
  }
}

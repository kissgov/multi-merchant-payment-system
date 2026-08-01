import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { AuditLogService } from './audit-log.service';
import { CurrentEmployee, EmployeePayload } from '../../common/decorators/current-employee.decorator';
import { AuditAction } from '../../entities/audit-log.entity';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';

@ApiTags('审计日志 - AuditLog')
@Controller('api/audit-logs')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth()
export class AuditLogController {
  constructor(private readonly auditService: AuditLogService) {}

  @Get()
  @RequirePermissions(['audit:view'])
  @ApiOperation({ summary: '操作审计日志列表（PC端）' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'pageSize', required: false })
  @ApiQuery({ name: 'module', required: false, description: '模块：auth/merchant/store/employee/order/payment/refund/report' })
  @ApiQuery({ name: 'action', required: false, enum: AuditAction })
  @ApiQuery({ name: 'operatorId', required: false })
  @ApiQuery({ name: 'targetId', required: false })
  @ApiQuery({ name: 'keyword', required: false, description: '描述/目标/操作人/错误信息模糊' })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @ApiQuery({ name: 'success', required: false })
  async list(
    @CurrentEmployee() emp: EmployeePayload,
    @Query() dto: any,
  ) {
    return this.auditService.queryLogs(emp, dto);
  }
}

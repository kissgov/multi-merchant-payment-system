import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';

import { ReportService, SummaryDto } from './report.service';
import { CurrentEmployee, EmployeePayload } from '../../common/decorators/current-employee.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { EmployeeRole } from '../../entities/employee.entity';

@ApiTags('报表统计模块 - Report')
@Controller('api/reports')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth()
export class ReportController {
  constructor(private readonly reportService: ReportService) {}

  @Get('summary')
  @Roles(
    EmployeeRole.SUPER_ADMIN,
    EmployeeRole.MERCHANT_OWNER,
    EmployeeRole.MERCHANT_ADMIN,
    EmployeeRole.STORE_MANAGER,
    EmployeeRole.CASHIER,
  )
  @ApiOperation({
    summary: '收款总览（首页卡片数据）',
    description:
      '返回指定时间段（默认今日）的订单数、收款金额、退款、渠道分布、门店分布、员工收款排行榜等综合数据。',
  })
  @ApiQuery({ name: 'startDate', required: false, example: '2026-08-01' })
  @ApiQuery({ name: 'endDate', required: false, example: '2026-08-01' })
  @ApiQuery({ name: 'storeId', required: false })
  @ApiQuery({ name: 'employeeId', required: false })
  async summary(
    @CurrentEmployee() emp: EmployeePayload,
    @Query() dto: SummaryDto,
  ) {
    return this.reportService.summary(emp, dto);
  }

  @Get('trend')
  @Roles(
    EmployeeRole.SUPER_ADMIN,
    EmployeeRole.MERCHANT_OWNER,
    EmployeeRole.MERCHANT_ADMIN,
    EmployeeRole.STORE_MANAGER,
    EmployeeRole.CASHIER,
  )
  @ApiOperation({
    summary: '收款趋势（图表数据）',
    description: '按天/小时返回收款趋势，用于绘制折线图/柱状图。',
  })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @ApiQuery({ name: 'granularity', required: false, enum: ['day', 'hour'] })
  @ApiQuery({ name: 'storeId', required: false })
  async trend(
    @CurrentEmployee() emp: EmployeePayload,
    @Query() dto: SummaryDto & { granularity?: 'day' | 'hour' },
  ) {
    return this.reportService.trend(emp, dto);
  }

  @Get('cashier-dashboard')
  @Roles(
    EmployeeRole.STORE_MANAGER,
    EmployeeRole.CASHIER,
  )
  @ApiOperation({
    summary: '【收银员/店长】前台首页实时概览',
    description: '收银员APP首页打开立即调用，展示本人今日收款、门店今日收款（若有）等即时数据。',
  })
  async cashierDashboard(@CurrentEmployee() emp: EmployeePayload) {
    return this.reportService.cashierDashboard(emp);
  }

  @Get('big-screen')
  @Roles(
    EmployeeRole.SUPER_ADMIN,
    EmployeeRole.MERCHANT_OWNER,
    EmployeeRole.MERCHANT_ADMIN,
    EmployeeRole.STORE_MANAGER,
  )
  @ApiOperation({
    summary: '【PC端首页】大屏总览Dashboard（核心首页接口）',
    description:
      '一次性返回：今日/昨日/本月/本年KPI卡片（含环比）+ 近7日趋势 + 渠道占比 + 门店排行 + 员工收款排行 + 实时流水(最近10笔) + 待审批退款数 + 门店/员工总数。',
  })
  async bigScreen(@CurrentEmployee() emp: EmployeePayload) {
    return this.reportService.bigScreenDashboard(emp);
  }
}

import { Controller, Get, Post, Body, Param, Query, UseGuards, Ip, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';

import { RefundService, CreateRefundDto, QueryRefundDto } from './refund.service';
import { CurrentEmployee, EmployeePayload } from '../../common/decorators/current-employee.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { EmployeeRole } from '../../entities/employee.entity';
import { RefundStatus } from '../../entities/refund.entity';
import { PaymentChannel } from '../../entities/order.entity';
import { RefundWorkflowStatus } from './refund-workflow.constant';

@ApiTags('退款管理模块 - Refund（PC端完整）')
@Controller('api/refunds')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth()
export class RefundController {
  constructor(private readonly refundService: RefundService) {}

  // ========== 字典 ==========
  @Get('reason-codes')
  @ApiOperation({ summary: '退款原因字典（下拉选择）' })
  reasonCodes() {
    return this.refundService.listReasonCodes();
  }

  @Get('pending-count')
  @ApiOperation({ summary: '待我审批退款数量（PC端头部徽标）' })
  pendingCount(@CurrentEmployee() emp: EmployeePayload) {
    return this.refundService.pendingAuditCount(emp);
  }

  // ========== 列表 ==========
  @Get()
  @RequirePermissions(['refund:view', 'refund:view_self'], 'or')
  @ApiOperation({ summary: '退款记录列表（PC端）' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'pageSize', required: false })
  @ApiQuery({ name: 'startDate', required: false, example: '2026-08-01' })
  @ApiQuery({ name: 'endDate', required: false, example: '2026-08-01' })
  @ApiQuery({ name: 'status', required: false, enum: RefundStatus })
  @ApiQuery({ name: 'channel', required: false, enum: PaymentChannel })
  @ApiQuery({ name: 'reasonCode', required: false })
  @ApiQuery({ name: 'storeId', required: false })
  @ApiQuery({ name: 'operatorId', required: false })
  @ApiQuery({ name: 'amountMin', required: false })
  @ApiQuery({ name: 'amountMax', required: false })
  @ApiQuery({ name: 'keyword', required: false, description: '退款单/订单号/三方退款号/原因' })
  list(@CurrentEmployee() emp: EmployeePayload, @Query() dto: QueryRefundDto) {
    return this.refundService.queryList(emp, dto);
  }

  // ========== 详情 ==========
  @Get(':refundId')
  @RequirePermissions(['refund:detail', 'refund:view_self'], 'or')
  @ApiOperation({ summary: '退款详情（含关联订单/凭证/审批记录）' })
  detail(@CurrentEmployee() emp: EmployeePayload, @Param('refundId') refundId: string) {
    return this.refundService.detail(emp, refundId);
  }

  // ========== 申请退款 ==========
  @Post()
  @RequirePermissions(['order:refund', 'order:refund_self'], 'or')
  @ApiOperation({
    summary: '申请退款（独立退款入口，支持部分/全额/工作流审批）',
    description:
      '根据退款金额阈值(默认500元)与原因类型自动判断是否需要审批；无需审批直接调用渠道；需要审批则进入待审核，由店长/管理员审核。',
  })
  apply(
    @CurrentEmployee() emp: EmployeePayload,
    @Body() dto: CreateRefundDto,
    @Ip() ip: string,
    @Req() req: Request,
  ) {
    const ua = req.headers['user-agent'];
    return this.refundService.applyRefund(emp, dto, ip, ua);
  }

  // ========== 审批 ==========
  @Post(':refundId/audit')
  @RequirePermissions(['refund:audit'])
  @ApiOperation({
    summary: '退款审批（通过/驳回）【店长及以上】',
    description: 'decision: approve(通过) | reject(驳回)；驳回时必须传 rejectReason。',
  })
  audit(
    @CurrentEmployee() emp: EmployeePayload,
    @Param('refundId') refundId: string,
    @Body() body: { decision: 'approve' | 'reject'; rejectReason?: string },
    @Ip() ip: string,
    @Req() req: Request,
  ) {
    const ua = req.headers['user-agent'];
    return this.refundService.audit(emp, refundId, body.decision, body.rejectReason, ip, ua);
  }
}

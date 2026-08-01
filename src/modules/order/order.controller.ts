import {
  Controller,
  Get,
  Query,
  Param,
  UseGuards,
  Post,
  Body,
  Patch,
  HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';

import { OrderService, QueryOrdersDto, RefundRequest, QueryResult } from './order.service';
import { CurrentEmployee, EmployeePayload } from '../../common/decorators/current-employee.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { EmployeeRole } from '../../entities/employee.entity';
import { Order, OrderStatus, PaymentChannel } from '../../entities/order.entity';
import { RefundStatus } from '../../entities/refund.entity';

@ApiTags('订单模块 - Order（查询/退款）')
@Controller('api/orders')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth()
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Get()
  @Roles(
    EmployeeRole.SUPER_ADMIN,
    EmployeeRole.MERCHANT_OWNER,
    EmployeeRole.MERCHANT_ADMIN,
    EmployeeRole.STORE_MANAGER,
    EmployeeRole.CASHIER,
  )
  @ApiOperation({
    summary: '订单列表',
    description:
      '按数据权限过滤：收银员只看自己，店长看门店，商户管理员/老板看全商户。支持按时间、状态、渠道、关键字搜索。',
  })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'pageSize', required: false, example: 20 })
  @ApiQuery({ name: 'startDate', required: false, example: '2026-08-01' })
  @ApiQuery({ name: 'endDate', required: false, example: '2026-08-01' })
  @ApiQuery({ name: 'status', required: false, enum: OrderStatus })
  @ApiQuery({ name: 'channel', required: false, enum: PaymentChannel })
  @ApiQuery({ name: 'keyword', required: false, description: '订单号/三方交易号/手机号搜索' })
  @ApiQuery({ name: 'storeId', required: false })
  @ApiQuery({ name: 'employeeId', required: false })
  async list(
    @CurrentEmployee() emp: EmployeePayload,
    @Query() dto: QueryOrdersDto,
  ): Promise<QueryResult<any>> {
    return this.orderService.queryOrders(emp, dto);
  }

  @Get(':orderId')
  @Roles(
    EmployeeRole.SUPER_ADMIN,
    EmployeeRole.MERCHANT_OWNER,
    EmployeeRole.MERCHANT_ADMIN,
    EmployeeRole.STORE_MANAGER,
    EmployeeRole.CASHIER,
  )
  @ApiOperation({ summary: '订单详情' })
  async detail(
    @CurrentEmployee() emp: EmployeePayload,
    @Param('orderId') orderId: string,
  ): Promise<any> {
    return this.orderService.getOrderDetail(orderId, emp);
  }

  @Get('no/:orderNo')
  @Roles(
    EmployeeRole.SUPER_ADMIN,
    EmployeeRole.MERCHANT_OWNER,
    EmployeeRole.MERCHANT_ADMIN,
    EmployeeRole.STORE_MANAGER,
    EmployeeRole.CASHIER,
  )
  @ApiOperation({ summary: '按订单号查询' })
  async getByNo(
    @CurrentEmployee() emp: EmployeePayload,
    @Param('orderNo') orderNo: string,
  ) {
    return this.orderService.getByOrderNo(orderNo, emp);
  }

  @Post('refund')
  @HttpCode(200)
  @Roles(
    EmployeeRole.SUPER_ADMIN,
    EmployeeRole.MERCHANT_OWNER,
    EmployeeRole.MERCHANT_ADMIN,
    EmployeeRole.STORE_MANAGER,
    EmployeeRole.CASHIER,
  )
  @ApiOperation({
    summary: '申请退款（支持部分退款）',
    description:
      '权限：需员工 canRefund=true；收银员只能退自己的订单，店长可退门店所有订单。支持多次部分退款，累计不超过实付金额。',
  })
  async refund(
    @CurrentEmployee() emp: EmployeePayload,
    @Body() req: RefundRequest,
  ): Promise<{
    refundId: string;
    refundNo: string;
    status: RefundStatus;
    refundAmount: number;
  }> {
    return this.orderService.refund(emp, req);
  }

  @Patch(':orderId/close')
  @Roles(
    EmployeeRole.SUPER_ADMIN,
    EmployeeRole.MERCHANT_OWNER,
    EmployeeRole.MERCHANT_ADMIN,
    EmployeeRole.STORE_MANAGER,
    EmployeeRole.CASHIER,
  )
  @ApiOperation({ summary: '关闭未支付订单' })
  async close(
    @CurrentEmployee() emp: EmployeePayload,
    @Param('orderId') orderId: string,
  ) {
    return this.orderService.closeOrder(orderId, emp);
  }
}

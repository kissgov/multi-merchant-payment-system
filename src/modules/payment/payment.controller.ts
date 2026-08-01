import {
  Controller,
  Post,
  Body,
  UseGuards,
  Get,
  Param,
  Ip,
  Req,
  Res,
  HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { Request, Response } from 'express';

import { PaymentService, PaymentResult } from './payment.service';
import { CreateMicropayDto, CreateQrCodeDto } from './dto/create-payment.dto';
import {
  CurrentEmployee,
  EmployeePayload,
} from '../../common/decorators/current-employee.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { EmployeeRole } from '../../entities/employee.entity';

@ApiTags('支付模块 - Payment（前台核心）')
@Controller('api/payment')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  // ============ 【被扫】商家扫码枪扫用户付款码 ============
  @Post('micropay')
  @UseGuards(AuthGuard('jwt'))
  @Roles(
    EmployeeRole.SUPER_ADMIN,
    EmployeeRole.MERCHANT_OWNER,
    EmployeeRole.MERCHANT_ADMIN,
    EmployeeRole.STORE_MANAGER,
    EmployeeRole.CASHIER,
  )
  @ApiBearerAuth()
  @ApiOperation({
    summary: '付款码支付（被扫/刷卡支付）',
    description:
      '前台收银员输入金额 + 扫用户支付宝/微信付款码。支付成功直接返回；若返回 WAITING_PAYER 状态需要前端轮询 query 接口。',
  })
  async micropay(
    @CurrentEmployee() emp: EmployeePayload,
    @Body() dto: CreateMicropayDto,
  ): Promise<PaymentResult> {
    return this.paymentService.micropay(emp, dto);
  }

  // ============ 【主扫】生成收款二维码让用户扫 ============
  @Post('qrcode')
  @UseGuards(AuthGuard('jwt'))
  @Roles(
    EmployeeRole.SUPER_ADMIN,
    EmployeeRole.MERCHANT_OWNER,
    EmployeeRole.MERCHANT_ADMIN,
    EmployeeRole.STORE_MANAGER,
    EmployeeRole.CASHIER,
  )
  @ApiBearerAuth()
  @ApiOperation({
    summary: '生成收款二维码（主扫/Native）',
    description:
      '前台输入金额，系统返回收款二维码内容+图片URL，由用户使用支付宝/微信扫码完成支付。随后前端轮询 query 接口。',
  })
  async createQrCode(
    @CurrentEmployee() emp: EmployeePayload,
    @Body() dto: CreateQrCodeDto,
  ): Promise<PaymentResult> {
    return this.paymentService.createQrCode(emp, dto);
  }

  // ============ 查询支付状态（前端轮询） ============
  @Get(':orderId/query')
  @UseGuards(AuthGuard('jwt'))
  @Roles(
    EmployeeRole.SUPER_ADMIN,
    EmployeeRole.MERCHANT_OWNER,
    EmployeeRole.MERCHANT_ADMIN,
    EmployeeRole.STORE_MANAGER,
    EmployeeRole.CASHIER,
  )
  @ApiBearerAuth()
  @ApiOperation({ summary: '查询订单支付状态（轮询用）' })
  async queryPayment(
    @CurrentEmployee() emp: EmployeePayload,
    @Param('orderId') orderId: string,
  ): Promise<PaymentResult> {
    return this.paymentService.queryPayment(orderId, emp);
  }

  // ============ 支付回调：支付宝 ============
  @Post('notify/alipay')
  @HttpCode(200)
  @ApiOperation({ summary: '支付宝支付回调通知（公网可访问）', description: '不需要登录' })
  async alipayNotify(@Req() req: Request, @Res() res: Response, @Body() body: any) {
    // 实际项目中需要验签
    console.log('[支付宝回调]', body);
    // 验签成功后更新订单状态...
    res.send('success');
  }

  // ============ 支付回调：微信 ============
  @Post('notify/wechat')
  @HttpCode(200)
  @ApiOperation({ summary: '微信支付回调通知（公网可访问）', description: '不需要登录' })
  async wechatNotify(@Req() req: Request, @Res() res: Response, @Body() body: any) {
    console.log('[微信回调]', body);
    // 验签 + 处理...
    res.json({ code: 'SUCCESS' });
  }
}

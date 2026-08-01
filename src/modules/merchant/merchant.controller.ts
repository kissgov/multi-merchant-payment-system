import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';

import { MerchantService, CreateMerchantDto, UpdateMerchantPaymentConfigDto } from './merchant.service';
import { CurrentEmployee, EmployeePayload } from '../../common/decorators/current-employee.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { EmployeeRole } from '../../entities/employee.entity';
import { Merchant, MerchantStatus } from '../../entities/merchant.entity';

@ApiTags('商户模块 - Merchant')
@Controller('api/merchants')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth()
export class MerchantController {
  constructor(private readonly merchantService: MerchantService) {}

  @Post()
  @Roles(EmployeeRole.SUPER_ADMIN)
  @ApiOperation({ summary: '[平台] 创建新商户', description: '仅超级管理员可调用' })
  async create(
    @CurrentEmployee() emp: EmployeePayload,
    @Body() dto: CreateMerchantDto,
  ): Promise<Merchant> {
    return this.merchantService.createMerchant(dto, emp);
  }

  @Get()
  @Roles(EmployeeRole.SUPER_ADMIN)
  @ApiOperation({ summary: '[平台] 商户列表' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'pageSize', required: false })
  @ApiQuery({ name: 'keyword', required: false })
  @ApiQuery({ name: 'status', required: false, enum: MerchantStatus })
  async list(
    @CurrentEmployee() emp: EmployeePayload,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
    @Query('keyword') keyword?: string,
    @Query('status') status?: MerchantStatus,
  ) {
    return this.merchantService.listMerchants(emp, page, pageSize, keyword, status);
  }

  @Get('my')
  @Roles(
    EmployeeRole.MERCHANT_OWNER,
    EmployeeRole.MERCHANT_ADMIN,
    EmployeeRole.STORE_MANAGER,
    EmployeeRole.CASHIER,
  )
  @ApiOperation({ summary: '[商户内] 获取当前商户信息' })
  async getMy(@CurrentEmployee() emp: EmployeePayload): Promise<Merchant> {
    return this.merchantService.getMyMerchant(emp);
  }

  @Patch('my/payment-config')
  @Roles(EmployeeRole.MERCHANT_OWNER, EmployeeRole.SUPER_ADMIN)
  @ApiOperation({ summary: '更新商户支付配置(支付宝/微信)' })
  async updatePaymentConfig(
    @CurrentEmployee() emp: EmployeePayload,
    @Body() dto: UpdateMerchantPaymentConfigDto,
  ): Promise<Merchant> {
    return this.merchantService.updatePaymentConfig(emp, dto);
  }

  @Patch('my/basic-info')
  @Roles(
    EmployeeRole.MERCHANT_OWNER,
    EmployeeRole.MERCHANT_ADMIN,
    EmployeeRole.SUPER_ADMIN,
  )
  @ApiOperation({ summary: '更新商户基础信息' })
  async updateBasicInfo(
    @CurrentEmployee() emp: EmployeePayload,
    @Body() dto: any,
  ) {
    return this.merchantService.updateBasicInfo(emp, dto);
  }

  @Patch(':merchantId/status')
  @Roles(EmployeeRole.SUPER_ADMIN)
  @ApiOperation({ summary: '[平台] 变更商户状态' })
  async updateStatus(
    @CurrentEmployee() emp: EmployeePayload,
    @Param('merchantId') merchantId: string,
    @Body() body: { status: MerchantStatus },
  ) {
    return this.merchantService.updateStatus(emp, merchantId, body.status);
  }
}

import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';

import { StoreService, CreateStoreDto } from './store.service';
import { CurrentEmployee, EmployeePayload } from '../../common/decorators/current-employee.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { EmployeeRole } from '../../entities/employee.entity';
import { Store, StoreStatus } from '../../entities/store.entity';

@ApiTags('门店模块 - Store')
@Controller('api/stores')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth()
export class StoreController {
  constructor(private readonly storeService: StoreService) {}

  @Post()
  @Roles(
    EmployeeRole.SUPER_ADMIN,
    EmployeeRole.MERCHANT_OWNER,
    EmployeeRole.MERCHANT_ADMIN,
  )
  @ApiOperation({ summary: '创建门店' })
  async create(
    @CurrentEmployee() emp: EmployeePayload,
    @Body() dto: CreateStoreDto,
  ): Promise<Store> {
    return this.storeService.create(emp, dto);
  }

  @Get()
  @Roles(
    EmployeeRole.SUPER_ADMIN,
    EmployeeRole.MERCHANT_OWNER,
    EmployeeRole.MERCHANT_ADMIN,
    EmployeeRole.STORE_MANAGER,
    EmployeeRole.CASHIER,
  )
  @ApiOperation({ summary: '门店列表' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'pageSize', required: false })
  @ApiQuery({ name: 'keyword', required: false })
  @ApiQuery({ name: 'status', required: false, enum: StoreStatus })
  async list(
    @CurrentEmployee() emp: EmployeePayload,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
    @Query('keyword') keyword?: string,
    @Query('status') status?: StoreStatus,
  ) {
    return this.storeService.list(emp, page, pageSize, keyword, status);
  }

  @Get('dropdown')
  @Roles(
    EmployeeRole.SUPER_ADMIN,
    EmployeeRole.MERCHANT_OWNER,
    EmployeeRole.MERCHANT_ADMIN,
    EmployeeRole.STORE_MANAGER,
    EmployeeRole.CASHIER,
  )
  @ApiOperation({ summary: '门店下拉选项（id/name/no）' })
  async dropdown(@CurrentEmployee() emp: EmployeePayload) {
    return this.storeService.dropdown(emp);
  }

  @Get(':storeId')
  @Roles(
    EmployeeRole.SUPER_ADMIN,
    EmployeeRole.MERCHANT_OWNER,
    EmployeeRole.MERCHANT_ADMIN,
    EmployeeRole.STORE_MANAGER,
    EmployeeRole.CASHIER,
  )
  @ApiOperation({ summary: '门店详情' })
  async detail(
    @CurrentEmployee() emp: EmployeePayload,
    @Param('storeId') storeId: string,
  ): Promise<Store> {
    return this.storeService.detail(emp, storeId);
  }

  @Patch(':storeId')
  @Roles(
    EmployeeRole.SUPER_ADMIN,
    EmployeeRole.MERCHANT_OWNER,
    EmployeeRole.MERCHANT_ADMIN,
    EmployeeRole.STORE_MANAGER,
  )
  @ApiOperation({ summary: '更新门店信息' })
  async update(
    @CurrentEmployee() emp: EmployeePayload,
    @Param('storeId') storeId: string,
    @Body() dto: any,
  ) {
    return this.storeService.update(emp, storeId, dto);
  }

  @Patch(':storeId/status')
  @Roles(
    EmployeeRole.SUPER_ADMIN,
    EmployeeRole.MERCHANT_OWNER,
    EmployeeRole.MERCHANT_ADMIN,
  )
  @ApiOperation({ summary: '变更门店状态' })
  async updateStatus(
    @CurrentEmployee() emp: EmployeePayload,
    @Param('storeId') storeId: string,
    @Body() body: { status: StoreStatus },
  ) {
    return this.storeService.updateStatus(emp, storeId, body.status);
  }
}

import { IsOptional, IsString, IsEnum, IsInt, Min, Max, IsNumber, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { OrderStatus } from '../../../entities/order.entity';
import { PaymentChannel } from '../../../entities/enums';

/**
 * 订单列表查询 DTO（带 class-validator 校验）
 */
export class QueryOrdersDto {
  @ApiPropertyOptional({ description: '页码，默认1', minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page 必须为整数' })
  @Min(1, { message: 'page 最小为1' })
  page?: number;

  @ApiPropertyOptional({ description: '每页数量，默认20，最大100', minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'pageSize 必须为整数' })
  @Min(1, { message: 'pageSize 最小为1' })
  @Max(100, { message: 'pageSize 最大为100' })
  pageSize?: number;

  @ApiPropertyOptional({ description: '开始日期 YYYY-MM-DD' })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({ description: '结束日期 YYYY-MM-DD' })
  @IsOptional()
  @IsString()
  endDate?: string;

  @ApiPropertyOptional({ description: '订单状态', enum: OrderStatus })
  @IsOptional()
  @IsEnum(OrderStatus, { message: '无效的订单状态' })
  status?: OrderStatus;

  @ApiPropertyOptional({ description: '支付渠道', enum: PaymentChannel })
  @IsOptional()
  @IsEnum(PaymentChannel, { message: '无效的支付渠道' })
  channel?: PaymentChannel;

  @ApiPropertyOptional({ description: '关键字（订单号/交易号/手机号）' })
  @IsOptional()
  @IsString({ message: 'keyword 必须为字符串' })
  keyword?: string;

  @ApiPropertyOptional({ description: '门店ID' })
  @IsOptional()
  @IsString()
  storeId?: string;

  @ApiPropertyOptional({ description: '员工ID' })
  @IsOptional()
  @IsString()
  employeeId?: string;
}

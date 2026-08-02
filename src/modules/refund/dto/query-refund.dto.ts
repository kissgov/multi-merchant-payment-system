import { IsOptional, IsString, IsEnum, IsInt, Min, Max, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { RefundStatus } from '../../../entities/refund.entity';
import { PaymentChannel } from '../../../entities/enums';
import { RefundWorkflowStatus } from '../refund-workflow.constant';

/**
 * 退款列表查询 DTO
 */
export class QueryRefundDto {
  @ApiPropertyOptional({ description: '页码', minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page 必须为整数' })
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ description: '每页数量', minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'pageSize 必须为整数' })
  @Min(1)
  @Max(100)
  pageSize?: number;

  @ApiPropertyOptional({ description: '开始日期' })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({ description: '结束日期' })
  @IsOptional()
  @IsString()
  endDate?: string;

  @ApiPropertyOptional({ description: '退款状态', enum: RefundStatus })
  @IsOptional()
  @IsEnum(RefundStatus, { message: '无效的退款状态' })
  status?: RefundStatus;

  @ApiPropertyOptional({ description: '支付渠道', enum: PaymentChannel })
  @IsOptional()
  @IsEnum(PaymentChannel, { message: '无效的支付渠道' })
  channel?: PaymentChannel;

  @ApiPropertyOptional({ description: '关键字（退款单号/订单号/外部退款号/原因）' })
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional({ description: '门店ID' })
  @IsOptional()
  @IsString()
  storeId?: string;

  @ApiPropertyOptional({ description: '操作员ID' })
  @IsOptional()
  @IsString()
  operatorId?: string;

  @ApiPropertyOptional({ description: '退款原因编码' })
  @IsOptional()
  @IsString()
  reasonCode?: string;

  @ApiPropertyOptional({ description: '最小退款金额' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'amountMin 必须为数字' })
  amountMin?: number;

  @ApiPropertyOptional({ description: '最大退款金额' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'amountMax 必须为数字' })
  amountMax?: number;

  @ApiPropertyOptional({ description: '工作流状态', enum: RefundWorkflowStatus })
  @IsOptional()
  @IsEnum(RefundWorkflowStatus, { message: '无效的工作流状态' })
  workflowStatus?: RefundWorkflowStatus;
}

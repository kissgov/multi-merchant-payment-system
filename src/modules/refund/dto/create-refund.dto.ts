import { IsNotEmpty, IsNumber, IsString, IsOptional, Min, MaxLength, IsArray, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * 申请退款 DTO（带 class-validator 校验）
 */
export class CreateRefundRequestDto {
  @ApiProperty({ description: '订单ID' })
  @IsString({ message: 'orderId 必须为字符串' })
  @IsNotEmpty({ message: 'orderId 不能为空' })
  orderId: string;

  @ApiProperty({ description: '退款金额(元)，最多2位小数', minimum: 0.01 })
  @Type(() => Number)
  @IsNumber({}, { message: '退款金额必须为数字' })
  @Min(0.01, { message: '退款金额必须大于0' })
  refundAmount: number;

  @ApiProperty({ description: '退款原因编码，从字典接口获取' })
  @IsString({ message: 'reasonCode 必须为字符串' })
  @IsNotEmpty({ message: 'reasonCode 不能为空' })
  reasonCode: string;

  @ApiProperty({ description: '退款原因详细说明', maxLength: 500 })
  @IsString({ message: 'reason 必须为字符串' })
  @IsNotEmpty({ message: '退款原因不能为空' })
  @MaxLength(500, { message: '退款原因最多500字' })
  reason: string;

  @ApiPropertyOptional({ description: '凭证图片URL数组' })
  @IsOptional()
  @IsArray({ message: 'evidenceImages 必须为数组' })
  @IsString({ each: true, message: '凭证图片URL必须为字符串' })
  evidenceImages?: string[];

  @ApiPropertyOptional({ description: '是否通知客户', default: false })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean({ message: 'notifyCustomer 必须为布尔值' })
  notifyCustomer?: boolean;
}

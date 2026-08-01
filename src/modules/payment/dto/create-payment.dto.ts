import { IsEnum, IsNumber, IsString, IsOptional, IsNotEmpty, Min, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentChannel } from '../../../entities/order.entity';

/**
 * 创建收款订单（被扫模式 - 商家扫用户付款码）
 * 场景：收银员输入金额 -> 扫码枪扫用户支付宝/微信付款码 -> 发起支付
 */
export class CreateMicropayDto {
  @ApiProperty({ description: '支付渠道', enum: PaymentChannel, example: PaymentChannel.ALIPAY })
  @IsEnum(PaymentChannel, { message: '无效的支付渠道' })
  channel: PaymentChannel;

  @ApiProperty({ description: '订单金额(元)，最多2位小数', example: 88.88, minimum: 0.01 })
  @IsNumber({}, { message: '金额必须为数字' })
  @Min(0.01, { message: '金额必须大于0' })
  amount: number;

  @ApiProperty({ description: '用户付款码(付款码页面的数字串，长度一般18位以上)', example: '289832983928372617' })
  @IsString()
  @IsNotEmpty({ message: '付款码不能为空' })
  authCode: string;

  @ApiPropertyOptional({ description: '订单/商品标题', example: '商品消费' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  subject?: string;

  @ApiPropertyOptional({ description: '订单备注/附加信息', example: '3号桌' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  body?: string;

  @ApiPropertyOptional({ description: '订单有效时间(秒)，默认300秒', example: 300 })
  @IsOptional()
  expireSeconds?: number;

  @ApiPropertyOptional({ description: '客户姓名（可选）' })
  @IsOptional()
  customerName?: string;

  @ApiPropertyOptional({ description: '客户手机号（可选）' })
  @IsOptional()
  customerPhone?: string;
}

/**
 * 创建收款二维码（主扫模式 - 用户扫商家二维码）
 * 场景：收银员输入金额 -> 系统生成收款二维码 -> 用户扫码支付 -> 轮询/回调完成
 */
export class CreateQrCodeDto {
  @ApiProperty({ description: '支付渠道', enum: PaymentChannel, example: PaymentChannel.WECHAT })
  @IsEnum(PaymentChannel, { message: '无效的支付渠道' })
  channel: PaymentChannel;

  @ApiProperty({ description: '订单金额(元)', example: 128.50, minimum: 0.01 })
  @IsNumber({}, { message: '金额必须为数字' })
  @Min(0.01, { message: '金额必须大于0' })
  amount: number;

  @ApiPropertyOptional({ description: '订单标题', example: '门店消费' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  subject?: string;

  @ApiPropertyOptional({ description: '订单备注' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  body?: string;

  @ApiPropertyOptional({ description: '过期秒数，默认300秒(5分钟)', example: 300 })
  @IsOptional()
  expireSeconds?: number;
}

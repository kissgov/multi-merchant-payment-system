import { IsString, IsNotEmpty, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ description: '登录账号（工号或手机号）', example: 'EMP001' })
  @IsString()
  @IsNotEmpty({ message: '登录账号不能为空' })
  @MaxLength(50)
  username: string;

  @ApiProperty({ description: '登录密码', example: '123456', minLength: 6 })
  @IsString()
  @IsNotEmpty({ message: '密码不能为空' })
  @MinLength(6, { message: '密码长度不能少于6位' })
  password: string;
}

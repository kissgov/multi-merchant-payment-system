import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  Patch,
  Ip,
  HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { AuthService, LoginResult } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { CurrentEmployee, EmployeePayload } from '../../common/decorators/current-employee.decorator';
import { Employee } from '../../entities/employee.entity';

@ApiTags('认证模块 - Auth')
@Controller('api/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(200)
  @ApiOperation({
    summary: '员工登录',
    description: '收银员/店长/管理员登录，获取JWT Token。支持工号或手机号作为登录账号。',
  })
  async login(@Body() dto: LoginDto, @Ip() loginIp: string): Promise<LoginResult> {
    return this.authService.login(dto, loginIp);
  }

  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取当前登录员工信息', description: '需要登录态' })
  async getMe(@CurrentEmployee() emp: EmployeePayload): Promise<Employee> {
    return this.authService.getMe(emp.id);
  }

  @Patch('password')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: '修改当前员工密码' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        oldPassword: { type: 'string', description: '原密码' },
        newPassword: { type: 'string', description: '新密码(至少6位)' },
      },
      required: ['oldPassword', 'newPassword'],
    },
  })
  @HttpCode(200)
  async changePassword(
    @CurrentEmployee() emp: EmployeePayload,
    @Body() body: { oldPassword: string; newPassword: string },
  ): Promise<{ message: string }> {
    await this.authService.changePassword(emp.id, body.oldPassword, body.newPassword);
    return { message: '密码修改成功' };
  }
}

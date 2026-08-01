import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Employee, EmployeeStatus, EmployeeRole } from '../../entities/employee.entity';
import { LoginDto } from './dto/login.dto';
import { EmployeePayload } from '../../common/decorators/current-employee.decorator';
import { AuditLogService, AuditAction } from '../audit/audit-log.service';
import * as dayjs from 'dayjs';

export interface LoginResult {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  employee: {
    id: string;
    employeeNo: string;
    name: string;
    role: EmployeeRole;
    roleId?: string;
    merchantId: string;
    storeId: string;
    avatar: string;
    phone?: string;
    username: string;
  };
  /** JWT 内再次携带一份权限上下文（避免每次查库），前端不用关心 */
  _jwtPayload?: any;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
    private readonly jwtService: JwtService,
    @Inject(forwardRef(() => AuditLogService))
    private readonly audit: AuditLogService,
  ) {}

  /**
   * 员工登录（前台POS/APP使用）
   */
  async login(dto: LoginDto, loginIp?: string): Promise<LoginResult> {
    const employee = await this.employeeRepo.findOne({
      where: [{ username: dto.username }, { phone: dto.username }],
      relations: ['store'],
    });

    if (!employee) {
      throw new UnauthorizedException('账号或密码错误');
    }

    if (employee.status === EmployeeStatus.DISABLED) {
      throw new UnauthorizedException('该账号已被禁用，请联系管理员');
    }
    if (employee.status === EmployeeStatus.LOCKED) {
      throw new UnauthorizedException('该账号已被锁定，请稍后再试或联系管理员');
    }

    // 验证密码
    const isPasswordValid = await employee.comparePassword(dto.password);
    if (!isPasswordValid) {
      employee.loginFailCount = (employee.loginFailCount || 0) + 1;
      // 连续5次失败锁定30分钟
      if (employee.loginFailCount >= 5) {
        employee.status = EmployeeStatus.LOCKED;
      }
      await this.employeeRepo.save(employee);
      throw new UnauthorizedException(
        employee.status === EmployeeStatus.LOCKED
          ? '密码错误次数过多，账号已锁定'
          : '账号或密码错误',
      );
    }

    // 登录成功
    employee.loginFailCount = 0;
    employee.lastLoginAt = new Date();
    employee.lastLoginIp = loginIp;
    await this.employeeRepo.save(employee);

    const payload: EmployeePayload & {
      sub: string;
      iat?: number;
      exp?: number;
      roleId?: string;
    } = {
      sub: employee.id,
      id: employee.id,
      employeeNo: employee.employeeNo,
      merchantId: employee.merchantId,
      storeId: employee.storeId,
      name: employee.name,
      username: employee.username,
      role: employee.role,
      roleId: employee.roleId,
    };

    const token = this.jwtService.sign(payload);
    const decoded = this.jwtService.decode(token) as { exp: number; iat: number };

    // 审计：登录成功
    this.audit.log({
      module: 'auth',
      action: AuditAction.LOGIN,
      description: `员工 ${employee.name}(${employee.employeeNo}) 登录成功`,
      merchantId: employee.merchantId,
      storeId: employee.storeId,
      operatorId: employee.id,
      operatorName: employee.name,
      operatorNo: employee.employeeNo,
      targetType: 'employee',
      targetId: employee.id,
      ip: loginIp,
      success: true,
    });

    return {
      accessToken: token,
      tokenType: 'Bearer',
      expiresIn: decoded.exp - decoded.iat,
      employee: {
        id: employee.id,
        employeeNo: employee.employeeNo,
        name: employee.name,
        role: employee.role,
        roleId: employee.roleId,
        merchantId: employee.merchantId,
        storeId: employee.storeId,
        avatar: employee.avatar,
        phone: employee.phone,
        username: employee.username,
      },
    };
  }

  /**
   * 修改密码
   */
  async changePassword(
    employeeId: string,
    oldPassword: string,
    newPassword: string,
  ): Promise<void> {
    if (newPassword.length < 6) {
      throw new BadRequestException('新密码长度不能少于6位');
    }
    const employee = await this.employeeRepo.findOneOrFail({
      where: { id: employeeId },
    });
    const isValid = await employee.comparePassword(oldPassword);
    if (!isValid) {
      throw new BadRequestException('原密码错误');
    }
    employee.password = await Employee.hashPassword(newPassword);
    await this.employeeRepo.save(employee);
  }

  /**
   * 获取当前登录员工完整信息
   */
  async getMe(employeeId: string): Promise<Employee> {
    const employee = await this.employeeRepo.findOneOrFail({
      where: { id: employeeId },
      relations: ['merchant', 'store'],
      select: [
        'id', 'employeeNo', 'name', 'username', 'phone', 'avatar',
        'role', 'status', 'merchantId', 'storeId',
        'canAcceptPayment', 'canRefund',
        'singlePaymentLimit', 'dailyPaymentLimit',
        'lastLoginAt', 'createdAt',
      ] as any,
    });
    return employee;
  }
}

import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as dayjs from 'dayjs';

import { Employee, EmployeeRole, EmployeeStatus } from '../../entities/employee.entity';
import { EmployeePayload } from '../../common/decorators/current-employee.decorator';

export interface CreateEmployeeDto {
  name: string;
  username: string;
  password: string;
  role: EmployeeRole;
  storeId?: string;
  phone?: string;
  avatar?: string;
  canAcceptPayment?: boolean;
  canRefund?: boolean;
  singlePaymentLimit?: number;
  dailyPaymentLimit?: number;
  singleRefundLimit?: number;
  remark?: string;
}

// 角色层级权限
const ROLE_LEVEL: Record<EmployeeRole, number> = {
  [EmployeeRole.SUPER_ADMIN]: 100,
  [EmployeeRole.MERCHANT_OWNER]: 80,
  [EmployeeRole.MERCHANT_ADMIN]: 60,
  [EmployeeRole.STORE_MANAGER]: 40,
  [EmployeeRole.CASHIER]: 20,
};

@Injectable()
export class EmployeeService {
  constructor(
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
  ) {}

  /**
   * 判断操作者是否可以管理目标角色（可管理比自己权限低的）
   */
  private canManageRole(operatorRole: EmployeeRole, targetRole: EmployeeRole): boolean {
    return ROLE_LEVEL[operatorRole] > ROLE_LEVEL[targetRole];
  }

  /**
   * 创建员工
   */
  async create(emp: EmployeePayload, dto: CreateEmployeeDto): Promise<Employee> {
    // 角色创建校验
    if (!this.canManageRole(emp.role as EmployeeRole, dto.role)) {
      throw new ForbiddenException(`您无权创建[${dto.role}]角色的员工`);
    }
    // 门店归属校验
    if (
      dto.role === EmployeeRole.STORE_MANAGER ||
      dto.role === EmployeeRole.CASHIER
    ) {
      if (!dto.storeId) {
        throw new BadRequestException('店长/收银员必须指定所属门店');
      }
    } else {
      // 商户管理员不绑定具体门店
      if (emp.role === EmployeeRole.STORE_MANAGER) {
        dto.storeId = emp.storeId;
      }
    }
    // 门店店长只能创建本门店员工
    if (emp.role === EmployeeRole.STORE_MANAGER) {
      dto.storeId = emp.storeId;
    }

    // 账号唯一性
    const exists = await this.employeeRepo.findOne({
      where: [{ username: dto.username }, { phone: dto.phone || '' }],
    });
    if (exists) {
      throw new BadRequestException('账号或手机号已存在');
    }

    const employeeNo = `E${dayjs().format('YYYYMMDD')}${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
    const hashedPwd = await Employee.hashPassword(dto.password);

    const employee = this.employeeRepo.create({
      ...dto,
      employeeNo,
      merchantId: emp.merchantId,
      storeId: dto.storeId,
      password: hashedPwd,
      status: EmployeeStatus.ACTIVE,
    });
    const saved = await this.employeeRepo.save(employee);
    (saved as any).password = undefined;
    return saved;
  }

  /**
   * 员工列表
   */
  async list(
    emp: EmployeePayload,
    page = 1,
    pageSize = 20,
    keyword?: string,
    role?: EmployeeRole,
    status?: EmployeeStatus,
    storeId?: string,
  ) {
    const qb = this.employeeRepo
      .createQueryBuilder('e')
      .leftJoinAndSelect('e.store', 's')
      .where('e.merchantId = :mid', { mid: emp.merchantId })
      .andWhere("e.role != 'super_admin'"); // 平台管理员不在商户内显示

    // 数据权限
    if (emp.role === EmployeeRole.STORE_MANAGER) {
      qb.andWhere('e.storeId = :sid', { sid: emp.storeId });
    }
    if (emp.role === EmployeeRole.CASHIER) {
      qb.andWhere('e.id = :eid', { eid: emp.id });
    }
    if (storeId && (emp.role === EmployeeRole.MERCHANT_OWNER || emp.role === EmployeeRole.MERCHANT_ADMIN)) {
      qb.andWhere('e.storeId = :sid', { sid: storeId });
    }
    if (role) qb.andWhere('e.role = :role', { role });
    if (status) qb.andWhere('e.status = :st', { st: status });
    if (keyword) {
      qb.andWhere(
        '(e.name LIKE :kw OR e.username LIKE :kw OR e.employeeNo LIKE :kw OR e.phone LIKE :kw)',
        { kw: `%${keyword}%` },
      );
    }

    qb.orderBy('e.createdAt', 'DESC').skip((page - 1) * pageSize).take(pageSize);
    const [list, total] = await qb.getManyAndCount();
    // 脱敏密码
    (list as any[]).forEach((e) => delete e.password);
    return { list, total, page, pageSize };
  }

  /**
   * 员工详情
   */
  async detail(emp: EmployeePayload, employeeId: string) {
    const e = await this.employeeRepo.findOne({
      where: { id: employeeId, merchantId: emp.merchantId },
      relations: ['store'],
    });
    if (!e) throw new NotFoundException('员工不存在');
    if (emp.role === EmployeeRole.STORE_MANAGER && e.storeId !== emp.storeId) {
      throw new ForbiddenException('无权查看其他门店员工');
    }
    if (emp.role === EmployeeRole.CASHIER && e.id !== emp.id) {
      throw new ForbiddenException('无权查看其他员工');
    }
    (e as any).password = undefined;
    return e;
  }

  /**
   * 更新员工信息
   */
  async update(
    emp: EmployeePayload,
    employeeId: string,
    dto: Partial<CreateEmployeeDto> & { status?: EmployeeStatus },
  ) {
    const target = await this.detail(emp, employeeId);
    // 仅能管理权限低于自己的
    if (target.id !== emp.id && !this.canManageRole(emp.role as EmployeeRole, target.role)) {
      throw new ForbiddenException('您无权修改该员工');
    }
    // 不能提升别人到和自己同级或更高
    if (dto.role && !this.canManageRole(emp.role as EmployeeRole, dto.role)) {
      throw new ForbiddenException('您无权将员工提升至该角色');
    }
    if (dto.password) {
      dto.password = await Employee.hashPassword(dto.password);
    }
    await this.employeeRepo.update(employeeId, dto as any);
    return { message: '更新成功' };
  }

  /**
   * 重置员工密码（管理员用）
   */
  async resetPassword(
    emp: EmployeePayload,
    employeeId: string,
    newPassword: string,
  ) {
    if (!newPassword || newPassword.length < 6) {
      throw new BadRequestException('新密码至少6位');
    }
    const target = await this.detail(emp, employeeId);
    if (target.id !== emp.id && !this.canManageRole(emp.role as EmployeeRole, target.role)) {
      throw new ForbiddenException('您无权重置该员工密码');
    }
    const hashed = await Employee.hashPassword(newPassword);
    await this.employeeRepo.update(employeeId, {
      password: hashed,
      status: EmployeeStatus.ACTIVE,
      loginFailCount: 0,
    });
    return { message: '密码重置成功' };
  }

  /**
   * 启用/禁用员工
   */
  async toggleStatus(
    emp: EmployeePayload,
    employeeId: string,
    status: EmployeeStatus,
  ) {
    const target = await this.detail(emp, employeeId);
    if (!this.canManageRole(emp.role as EmployeeRole, target.role)) {
      throw new ForbiddenException('您无权变更该员工状态');
    }
    await this.employeeRepo.update(employeeId, { status, loginFailCount: 0 });
    return { message: '状态更新成功' };
  }
}

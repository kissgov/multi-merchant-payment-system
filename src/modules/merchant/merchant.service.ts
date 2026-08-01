import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as dayjs from 'dayjs';

import { Merchant, MerchantStatus } from '../../entities/merchant.entity';
import { Store } from '../../entities/store.entity';
import { Employee, EmployeeRole } from '../../entities/employee.entity';
import { EmployeePayload } from '../../common/decorators/current-employee.decorator';

export interface CreateMerchantDto {
  name: string;
  contactPerson?: string;
  contactPhone?: string;
  address?: string;
  platformFeeRate?: number;
  alipayAppId?: string;
  alipayPrivateKey?: string;
  alipayPublicKey?: string;
  wechatMchId?: string;
  wechatAppId?: string;
  wechatApiV3Key?: string;
  wechatPrivateKey?: string;
  wechatMchSerialNo?: string;
}

export interface UpdateMerchantPaymentConfigDto {
  alipayAppId?: string;
  alipayPrivateKey?: string;
  alipayPublicKey?: string;
  alipaySandbox?: boolean;
  wechatMchId?: string;
  wechatAppId?: string;
  wechatApiV3Key?: string;
  wechatMchSerialNo?: string;
  wechatPrivateKey?: string;
  wechatSandbox?: boolean;
}

@Injectable()
export class MerchantService {
  constructor(
    @InjectRepository(Merchant)
    private readonly merchantRepo: Repository<Merchant>,
    @InjectRepository(Store)
    private readonly storeRepo: Repository<Store>,
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
  ) {}

  /**
   * 仅平台超级管理员可创建商户
   */
  async createMerchant(dto: CreateMerchantDto, operator: EmployeePayload): Promise<Merchant> {
    if (operator.role !== EmployeeRole.SUPER_ADMIN) {
      throw new ForbiddenException('仅平台超级管理员可创建商户');
    }
    const merchantNo = `M${dayjs().format('YYYYMMDD')}${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
    const merchant = this.merchantRepo.create({
      ...dto,
      merchantNo,
      status: MerchantStatus.ACTIVE,
      platformFeeRate: dto.platformFeeRate ?? 0.0038,
    });
    return this.merchantRepo.save(merchant);
  }

  /**
   * 商户列表（仅平台管理员）
   */
  async listMerchants(
    operator: EmployeePayload,
    page = 1,
    pageSize = 20,
    keyword?: string,
    status?: MerchantStatus,
  ) {
    if (operator.role !== EmployeeRole.SUPER_ADMIN) {
      throw new ForbiddenException('仅平台超级管理员可查看商户列表');
    }
    const qb = this.merchantRepo.createQueryBuilder('m');
    if (keyword) qb.where('m.name LIKE :kw OR m.merchantNo LIKE :kw', { kw: `%${keyword}%` });
    if (status) qb.andWhere('m.status = :st', { st: status });
    qb.orderBy('m.createdAt', 'DESC').skip((page - 1) * pageSize).take(pageSize);
    const [list, total] = await qb.getManyAndCount();
    return { list, total, page, pageSize };
  }

  /**
   * 获取当前商户详情（商户内用户使用）
   */
  async getMyMerchant(emp: EmployeePayload): Promise<Merchant> {
    const merchant = await this.merchantRepo.findOne({
      where: { id: emp.merchantId },
    });
    if (!merchant) throw new NotFoundException('商户不存在');
    // 隐藏敏感字段（私钥等只在后端内部使用）
    (merchant as any).alipayPrivateKey = merchant.alipayPrivateKey ? '******已配置******' : '';
    (merchant as any).wechatPrivateKey = merchant.wechatPrivateKey ? '******已配置******' : '';
    (merchant as any).wechatApiV3Key = merchant.wechatApiV3Key ? '******已配置******' : '';
    return merchant;
  }

  /**
   * 更新商户支付配置
   * 权限：商户所有者 / 平台管理员
   */
  async updatePaymentConfig(
    emp: EmployeePayload,
    dto: UpdateMerchantPaymentConfigDto,
  ): Promise<Merchant> {
    if (
      emp.role !== EmployeeRole.MERCHANT_OWNER &&
      emp.role !== EmployeeRole.SUPER_ADMIN
    ) {
      throw new ForbiddenException('仅商户所有者或平台管理员可修改支付配置');
    }
    await this.merchantRepo.update(emp.merchantId, dto);
    return this.getMyMerchant(emp);
  }

  /**
   * 更新商户基础信息
   */
  async updateBasicInfo(
    emp: EmployeePayload,
    dto: Partial<Pick<Merchant, 'name' | 'logo' | 'contactPerson' | 'contactPhone' | 'address' | 'remark'>>,
  ) {
    if (
      emp.role !== EmployeeRole.MERCHANT_OWNER &&
      emp.role !== EmployeeRole.MERCHANT_ADMIN &&
      emp.role !== EmployeeRole.SUPER_ADMIN
    ) {
      throw new ForbiddenException('无权限修改商户信息');
    }
    await this.merchantRepo.update(emp.merchantId, dto);
    return { message: '更新成功' };
  }

  /**
   * 修改商户状态（启用/停用/关闭）
   */
  async updateStatus(
    operator: EmployeePayload,
    merchantId: string,
    status: MerchantStatus,
  ) {
    if (operator.role !== EmployeeRole.SUPER_ADMIN) {
      throw new ForbiddenException('仅平台超级管理员可变更商户状态');
    }
    await this.merchantRepo.update(merchantId, { status });
    return { message: '状态更新成功' };
  }
}

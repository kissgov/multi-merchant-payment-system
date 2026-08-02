import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as dayjs from 'dayjs';

import { Store, StoreStatus } from '../../entities/store.entity';
import { Employee, EmployeeRole } from '../../entities/employee.entity';
import { EmployeePayload } from '../../common/decorators/current-employee.decorator';
import { parsePagination } from '../../common/utils/page';

export interface CreateStoreDto {
  name: string;
  managerName?: string;
  managerPhone?: string;
  address: string;
  phone?: string;
  longitude?: number;
  latitude?: number;
  logo?: string;
}

/** 门店支付配置更新 DTO（私密字段留空/null 表示不修改） */
export interface UpdateStorePaymentConfigDto {
  useIndependentPayment?: boolean;
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

/** 门店支付私密字段（回显时脱敏，更新时空值不覆盖） */
const STORE_PAYMENT_SECRET_FIELDS: (keyof UpdateStorePaymentConfigDto)[] = [
  'alipayPrivateKey',
  'alipayPublicKey',
  'wechatApiV3Key',
  'wechatPrivateKey',
];

@Injectable()
export class StoreService {
  constructor(
    @InjectRepository(Store)
    private readonly storeRepo: Repository<Store>,
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
  ) {}

  /**
   * 创建门店
   * 权限：商户所有者 / 商户管理员
   */
  async create(emp: EmployeePayload, dto: CreateStoreDto): Promise<Store> {
    if (
      emp.role !== EmployeeRole.MERCHANT_OWNER &&
      emp.role !== EmployeeRole.MERCHANT_ADMIN &&
      emp.role !== EmployeeRole.SUPER_ADMIN
    ) {
      throw new ForbiddenException('无权限创建门店');
    }
    const storeNo = `S${dayjs().format('YYYYMMDD')}${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
    const store = this.storeRepo.create({
      ...dto,
      merchantId: emp.merchantId,
      storeNo,
      status: StoreStatus.ACTIVE,
    });
    return this.storeRepo.save(store);
  }

  /**
   * 门店列表
   * 权限：商户管理员/老板看全部；店长只能看到自己所属门店
   */
  async list(
    emp: EmployeePayload,
    page = 1,
    pageSize = 50,
    keyword?: string,
    status?: StoreStatus,
  ) {
    const qb = this.storeRepo
      .createQueryBuilder('s')
      .where('s.merchantId = :mid', { mid: emp.merchantId });

    if (emp.role === EmployeeRole.STORE_MANAGER) {
      qb.andWhere('s.id = :sid', { sid: emp.storeId });
    }
    if (emp.role === EmployeeRole.CASHIER) {
      qb.andWhere('s.id = :sid', { sid: emp.storeId });
    }
    if (keyword) {
      qb.andWhere('(s.name LIKE :kw OR s.storeNo LIKE :kw OR s.address LIKE :kw)', {
        kw: `%${keyword}%`,
      });
    }
    if (status) qb.andWhere('s.status = :st', { st: status });

    const pg = parsePagination(page, pageSize);
    qb.leftJoinAndMapMany('s.employeeCount', 's.employees', 'e')
      .orderBy('s.createdAt', 'DESC')
      .skip(pg.skip)
      .take(pg.pageSize);

    const [list, total] = await qb.getManyAndCount();
    // 统计人数（简化：实际可以加 count 查询）
    for (const s of list as any[]) {
      s.employeeCount = s.employeeCount?.length || 0;
    }
    return { list, total, page: pg.page, pageSize: pg.pageSize };
  }

  /**
   * 门店详情
   */
  async detail(emp: EmployeePayload, storeId: string): Promise<Store> {
    const store = await this.storeRepo.findOne({
      where: { id: storeId, merchantId: emp.merchantId },
    });
    if (!store) throw new NotFoundException('门店不存在');
    if (
      (emp.role === EmployeeRole.STORE_MANAGER || emp.role === EmployeeRole.CASHIER) &&
      store.id !== emp.storeId
    ) {
      throw new ForbiddenException('无权限查看其他门店');
    }
    return store;
  }

  /**
   * 更新门店信息
   */
  async update(
    emp: EmployeePayload,
    storeId: string,
    dto: Partial<CreateStoreDto> & {
      useIndependentPayment?: boolean;
      alipayAppId?: string;
      wechatMchId?: string;
      remark?: string;
    },
  ) {
    const store = await this.detail(emp, storeId);
    if (
      emp.role !== EmployeeRole.MERCHANT_OWNER &&
      emp.role !== EmployeeRole.MERCHANT_ADMIN &&
      emp.role !== EmployeeRole.SUPER_ADMIN &&
      !(emp.role === EmployeeRole.STORE_MANAGER && store.id === emp.storeId)
    ) {
      throw new ForbiddenException('无权限修改该门店');
    }
    await this.storeRepo.update(storeId, dto);
    return { message: '更新成功' };
  }

  /**
   * 获取门店支付配置（私密字段脱敏）
   * 权限：商户老板/商户管理员/平台管理员/本门店店长
   */
  async getPaymentConfig(
    emp: EmployeePayload,
    storeId: string,
  ): Promise<Partial<Store>> {
    const store = await this.detail(emp, storeId);
    if (
      emp.role !== EmployeeRole.MERCHANT_OWNER &&
      emp.role !== EmployeeRole.MERCHANT_ADMIN &&
      emp.role !== EmployeeRole.SUPER_ADMIN &&
      !(emp.role === EmployeeRole.STORE_MANAGER && store.id === emp.storeId)
    ) {
      throw new ForbiddenException('无权限查看该门店支付配置');
    }
    // 私密字段脱敏：已配置返回占位符，未配置返回空串
    STORE_PAYMENT_SECRET_FIELDS.forEach((field) => {
      const v = (store as any)[field];
      (store as any)[field] = v ? '******已配置******' : '';
    });
    // 只返回支付配置相关字段，避免泄露其他敏感信息
    return {
      id: store.id,
      name: store.name,
      storeNo: store.storeNo,
      useIndependentPayment: store.useIndependentPayment,
      alipayAppId: store.alipayAppId,
      alipayPrivateKey: store.alipayPrivateKey,
      alipayPublicKey: store.alipayPublicKey,
      alipaySandbox: store.alipaySandbox,
      wechatMchId: store.wechatMchId,
      wechatAppId: store.wechatAppId,
      wechatApiV3Key: store.wechatApiV3Key,
      wechatMchSerialNo: store.wechatMchSerialNo,
      wechatPrivateKey: store.wechatPrivateKey,
      wechatSandbox: store.wechatSandbox,
    } as Partial<Store>;
  }

  /**
   * 更新门店支付配置
   * 权限：商户老板/商户管理员/平台管理员（店长不可改支付配置，防止越权）
   * 私密字段留空/null 表示不修改；非私密字段（含 useIndependentPayment）直接覆盖。
   */
  async updatePaymentConfig(
    emp: EmployeePayload,
    storeId: string,
    dto: UpdateStorePaymentConfigDto,
  ): Promise<Partial<Store>> {
    const store = await this.detail(emp, storeId);
    if (
      emp.role !== EmployeeRole.MERCHANT_OWNER &&
      emp.role !== EmployeeRole.MERCHANT_ADMIN &&
      emp.role !== EmployeeRole.SUPER_ADMIN
    ) {
      throw new ForbiddenException('无权限修改门店支付配置');
    }

    // 过滤掉空值的私密字段（留空表示不修改），其余字段原样保留
    const updateData: Record<string, any> = {};
    for (const [key, value] of Object.entries(dto)) {
      const isSecret = STORE_PAYMENT_SECRET_FIELDS.includes(key as keyof UpdateStorePaymentConfigDto);
      if (isSecret && (value === undefined || value === null || value === '')) {
        continue; // 私密字段空值跳过，不覆盖
      }
      updateData[key] = value;
    }

    if (Object.keys(updateData).length > 0) {
      await this.storeRepo.update(storeId, updateData);
    }
    return this.getPaymentConfig(emp, storeId);
  }

  /**
   * 变更门店状态
   */
  async updateStatus(emp: EmployeePayload, storeId: string, status: StoreStatus) {
    if (
      emp.role !== EmployeeRole.MERCHANT_OWNER &&
      emp.role !== EmployeeRole.MERCHANT_ADMIN &&
      emp.role !== EmployeeRole.SUPER_ADMIN
    ) {
      throw new ForbiddenException('无权限变更门店状态');
    }
    const store = await this.detail(emp, storeId);
    await this.storeRepo.update(store.id, { status });
    return { message: '状态更新成功' };
  }

  /**
   * 下拉列表（用于员工分配门店等场景）
   */
  async dropdown(emp: EmployeePayload) {
    const qb = this.storeRepo
      .createQueryBuilder('s')
      .select(['s.id', 's.name', 's.storeNo'])
      .where('s.merchantId = :mid', { mid: emp.merchantId })
      .andWhere('s.status = :st', { st: StoreStatus.ACTIVE });
    if (emp.role === EmployeeRole.STORE_MANAGER || emp.role === EmployeeRole.CASHIER) {
      qb.andWhere('s.id = :sid', { sid: emp.storeId });
    }
    qb.orderBy('s.name', 'ASC');
    return qb.getMany();
  }
}

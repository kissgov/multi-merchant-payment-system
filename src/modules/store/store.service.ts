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

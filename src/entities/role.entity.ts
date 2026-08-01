import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToMany,
  JoinTable,
  OneToMany,
  Index,
} from 'typeorm';
import { Menu } from './menu.entity';
import { Employee } from './employee.entity';
import { enumColType } from './enums';

/**
 * 数据权限范围枚举
 */
export enum DataScope {
  ALL = 'all',                       // 全部数据（平台/商户）
  MERCHANT_ALL = 'merchant_all',     // 本商户全部
  MULTI_STORE = 'multi_store',       // 指定多门店
  CURRENT_STORE = 'current_store',   // 本门店
  SELF = 'self',                     // 仅本人数据
}

/**
 * 角色实体（自定义角色）
 *
 * 设计说明：
 * 1. 存在"内置角色"（对应原EmployeeRole枚举），不可删除，可编辑权限；
 * 2. 商户可"自定义角色"，灵活分配权限点 + 数据权限范围；
 * 3. 员工与角色是 多对一（一个员工一个主角色），如需多角色可扩展为多对多。
 */
@Entity('roles')
@Index('idx_merchant_name', ['merchantId', 'name'], { unique: true })
export class Role {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true, comment: '归属商户ID；空=平台内置角色' })
  merchantId: string;

  @Column({ type: 'varchar', length: 50, comment: '角色名称（同商户下唯一）' })
  name: string;

  @Column({
    type: 'varchar',
    length: 50,
    nullable: true,
    unique: true,
    comment: '内置角色编码（super_admin/merchant_owner/merchant_admin/store_manager/cashier）；自定义角色为空',
  })
  code: string;

  @Column({ type: 'varchar', length: 200, nullable: true, comment: '角色描述' })
  description: string;

  @Column({ type: 'boolean', default: false, comment: '是否内置角色（内置不可删除）' })
  isBuiltin: boolean;

  // ===== 数据权限范围 =====
  @Column({
    type: enumColType(),
    enum: DataScope,
    default: DataScope.CURRENT_STORE,
    comment: '数据权限范围',
  })
  dataScope: DataScope;

  @Column({
    type: 'json',
    nullable: true,
    comment: '自定义门店ID列表(dataScope=MULTI_STORE时使用)',
  })
  customStoreIds: string[];

  @Column({ type: 'int', default: 0, comment: '排序' })
  sort: number;

  @Column({ type: 'boolean', default: true, comment: '是否启用' })
  enabled: boolean;

  @CreateDateColumn({ comment: '创建时间' })
  createdAt: Date;

  @UpdateDateColumn({ comment: '更新时间' })
  updatedAt: Date;

  // ===== 关联 =====
  /** 拥有的菜单/权限点 */
  @ManyToMany(() => Menu, (menu) => menu.roles, { cascade: false, onDelete: 'CASCADE' })
  @JoinTable({
    name: 'role_menus',
    joinColumn: { name: 'roleId' },
    inverseJoinColumn: { name: 'menuId' },
  })
  menus: Menu[];

  /** 拥有该角色的员工 */
  @OneToMany(() => Employee, (emp) => emp.role)
  employees: Employee[];
}

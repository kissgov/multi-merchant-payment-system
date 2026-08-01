import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToMany,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { Role } from './role.entity';
import { enumColType } from './enums';

/**
 * 菜单类型枚举
 */
export enum MenuType {
  DIRECTORY = 'directory', // 目录（一级/分组）
  MENU = 'menu',           // 菜单页（对应路由/页面）
  BUTTON = 'button',       // 按钮级权限（对应功能点）
}

/**
 * 菜单 & 权限 实体（合一设计，菜单包含权限点）
 *
 * 采用 Tree 嵌套集实现多级菜单树；
 * 对于按钮级权限：parent 指向所属页面，type=BUTTON，permKey 为权限键（如 order:refund）
 */
@Entity('menus')
@Index('idx_perm_key', ['permKey'], { unique: true })
export class Menu {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 父级菜单 */
  @ManyToOne(() => Menu, (menu) => menu.children, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'parentId' })
  parent: Menu;

  /** 子级菜单/按钮 */
  @OneToMany(() => Menu, (menu) => menu.parent)
  children: Menu[];

  @Column({ type: 'uuid', nullable: true, comment: '父级菜单ID' })
  parentId: string;

  // ===== 展示字段 =====
  @Column({ type: 'varchar', length: 50, comment: '菜单/权限名称' })
  name: string;

  @Column({
    type: enumColType(),
    enum: MenuType,
    default: MenuType.MENU,
    comment: '类型：目录/菜单/按钮',
  })
  type: MenuType;

  @Column({ type: 'varchar', length: 100, nullable: true, comment: '前端路由路径（菜单用）' })
  path: string;

  @Column({ type: 'varchar', length: 100, nullable: true, comment: '前端组件路径' })
  component: string;

  @Column({ type: 'varchar', length: 100, nullable: true, comment: '图标(Antd/Element图标名)' })
  icon: string;

  @Column({ type: 'int', default: 0, comment: '排序(越小越靠前)' })
  sort: number;

  // ===== 权限字段 =====
  @Column({
    type: 'varchar',
    length: 100,
    unique: true,
    comment:
      '权限键(唯一)，格式：模块:操作。如 dashboard:view, order:list, order:refund, payment:micropay, employee:create',
  })
  permKey: string;

  @Column({ type: 'boolean', default: true, comment: '是否显示(隐藏路由/纯权限按钮可隐藏)' })
  visible: boolean;

  @Column({ type: 'boolean', default: false, comment: '是否固定标签页(keep-alive)' })
  affix: boolean;

  @Column({ type: 'boolean', default: false, comment: '是否缓存页面' })
  keepAlive: boolean;

  @Column({ type: 'varchar', length: 200, nullable: true, comment: '外链URL' })
  linkUrl: string;

  @Column({ type: 'varchar', length: 200, nullable: true, comment: '权限说明/备注' })
  remark: string;

  // ===== 归属：平台级 or 商户级 =====
  @Column({
    type: 'boolean',
    default: false,
    comment: '是否为平台级菜单/权限（true=仅超级管理员可见，false=商户内使用）',
  })
  isPlatform: boolean;

  @CreateDateColumn({ comment: '创建时间' })
  createdAt: Date;

  @UpdateDateColumn({ comment: '更新时间' })
  updatedAt: Date;

  // 与角色多对多
  @ManyToMany(() => Role, (role) => role.menus)
  roles: Role[];
}

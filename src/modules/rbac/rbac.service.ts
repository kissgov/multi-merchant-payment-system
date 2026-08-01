import {
  Injectable,
  OnModuleInit,
  Logger,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { TreeRepository, Repository, DataSource, In } from 'typeorm';
import { Menu, MenuType } from '../../entities/menu.entity';
import { Role, DataScope } from '../../entities/role.entity';
import { Employee, EmployeeRole } from '../../entities/employee.entity';
import { DEFAULT_ALL_PERM_KEYS } from '../../common/guards/permission.guard';
import { EmployeePayload } from '../../common/decorators/current-employee.decorator';

/**
 * PC端菜单/权限树结构（标准结构，适配Vue/React Admin框架）
 */
export interface MenuVo {
  id: string;
  name: string;
  type: MenuType;
  path?: string;
  component?: string;
  icon?: string;
  sort: number;
  permKey: string;
  visible: boolean;
  keepAlive: boolean;
  affix: boolean;
  linkUrl?: string;
  isPlatform?: boolean;
  children?: MenuVo[];
}

/** 菜单初始化定义（目录-菜单-按钮三层） */
const MENU_SEED_DEFINITION = [
  // ========== 平台侧菜单 ==========
  {
    path: '/platform',
    name: 'PlatformRoot',
    type: MenuType.DIRECTORY,
    permKey: 'platform:root',
    icon: 'Setting',
    title: '平台管理',
    sort: 99,
    isPlatform: true,
    children: [
      { path: '/platform/merchants', name: 'MerchantList', type: MenuType.MENU, permKey: 'platform:merchant_list', icon: 'OfficeBuilding', title: '商户列表', component: 'platform/merchants/index',
        children: [
          { type: MenuType.BUTTON, permKey: 'platform:merchant_create', title: '创建商户' },
          { type: MenuType.BUTTON, permKey: 'platform:merchant_update', title: '编辑商户' },
          { type: MenuType.BUTTON, permKey: 'platform:merchant_status', title: '变更状态' },
        ]},
    ],
  },
  // ========== 仪表盘 ==========
  {
    path: '/dashboard',
    name: 'DashboardRoot',
    type: MenuType.DIRECTORY,
    permKey: 'dashboard:root',
    icon: 'DataAnalysis',
    title: '工作台',
    sort: 1,
    children: [
      { path: '/dashboard/index', name: 'Dashboard', type: MenuType.MENU, permKey: 'dashboard:view', icon: 'Histogram', title: '数据总览', affix: true, component: 'dashboard/index',
        children: [
          { type: MenuType.BUTTON, permKey: 'dashboard:big_screen', title: '大屏视图' },
        ]},
      { path: '/dashboard/cashier', name: 'CashierDashboard', type: MenuType.MENU, permKey: 'report:cashier_dashboard', icon: 'Wallet', title: '收银概览', component: 'dashboard/cashier' },
    ],
  },
  // ========== 收款中心 ==========
  {
    path: '/payment',
    name: 'PaymentRoot',
    type: MenuType.DIRECTORY,
    permKey: 'payment:root',
    icon: 'Money',
    title: '收款中心',
    sort: 2,
    children: [
      { path: '/payment/cashier', name: 'PaymentCashier', type: MenuType.MENU, permKey: 'payment:micropay', icon: 'CreditCard', title: '收银台（被扫）', component: 'payment/cashier',
        children: [
          { type: MenuType.BUTTON, permKey: 'payment:qrcode', title: '生成收款码' },
          { type: MenuType.BUTTON, permKey: 'payment:query', title: '查询支付结果' },
        ]},
    ],
  },
  // ========== 订单管理 ==========
  {
    path: '/order',
    name: 'OrderRoot',
    type: MenuType.DIRECTORY,
    permKey: 'order:root',
    icon: 'List',
    title: '订单管理',
    sort: 3,
    children: [
      { path: '/order/list', name: 'OrderList', type: MenuType.MENU, permKey: 'order:list', icon: 'Document', title: '订单列表', component: 'order/list',
        children: [
          { type: MenuType.BUTTON, permKey: 'order:detail', title: '订单详情' },
          { type: MenuType.BUTTON, permKey: 'order:refund', title: '发起退款' },
          { type: MenuType.BUTTON, permKey: 'order:refund_self', title: '退本人订单' },
          { type: MenuType.BUTTON, permKey: 'order:close', title: '关闭订单' },
          { type: MenuType.BUTTON, permKey: 'order:export', title: '导出订单' },
        ]},
    ],
  },
  // ========== 退款管理（独立模块） ==========
  {
    path: '/refund',
    name: 'RefundRoot',
    type: MenuType.DIRECTORY,
    permKey: 'refund:root',
    icon: 'RefreshLeft',
    title: '退款管理',
    sort: 4,
    children: [
      { path: '/refund/list', name: 'RefundList', type: MenuType.MENU, permKey: 'refund:view', icon: 'Warning', title: '退款记录', component: 'refund/list',
        children: [
          { type: MenuType.BUTTON, permKey: 'refund:view_self', title: '查看本人' },
          { type: MenuType.BUTTON, permKey: 'refund:detail', title: '退款详情' },
          { type: MenuType.BUTTON, permKey: 'refund:audit', title: '退款审核' },
          { type: MenuType.BUTTON, permKey: 'refund:export', title: '导出退款' },
        ]},
    ],
  },
  // ========== 报表统计 ==========
  {
    path: '/report',
    name: 'ReportRoot',
    type: MenuType.DIRECTORY,
    permKey: 'report:root',
    icon: 'TrendCharts',
    title: '报表统计',
    sort: 5,
    children: [
      { path: '/report/summary', name: 'ReportSummary', type: MenuType.MENU, permKey: 'report:view', icon: 'PieChart', title: '收款汇总', component: 'report/summary',
        children: [
          { type: MenuType.BUTTON, permKey: 'report:trend', title: '趋势分析' },
          { type: MenuType.BUTTON, permKey: 'report:export', title: '导出报表' },
        ]},
    ],
  },
  // ========== 商户内：门店 ==========
  {
    path: '/basic',
    name: 'BasicRoot',
    type: MenuType.DIRECTORY,
    permKey: 'basic:root',
    icon: 'Shop',
    title: '基础资料',
    sort: 6,
    children: [
      { path: '/basic/stores', name: 'StoreList', type: MenuType.MENU, permKey: 'store:list', icon: 'Shop', title: '门店管理', component: 'basic/stores',
        children: [
          { type: MenuType.BUTTON, permKey: 'store:view', title: '门店详情' },
          { type: MenuType.BUTTON, permKey: 'store:create', title: '创建门店' },
          { type: MenuType.BUTTON, permKey: 'store:update', title: '编辑门店' },
          { type: MenuType.BUTTON, permKey: 'store:status', title: '变更状态' },
        ]},
      { path: '/basic/payment-config', name: 'PaymentConfig', type: MenuType.MENU, permKey: 'payment_config:manage', icon: 'Key', title: '支付配置', component: 'basic/payment-config' },
    ],
  },
  // ========== 商户内：员工与权限 ==========
  {
    path: '/system',
    name: 'SystemRoot',
    type: MenuType.DIRECTORY,
    permKey: 'system:root',
    icon: 'User',
    title: '系统与权限',
    sort: 7,
    children: [
      { path: '/system/employees', name: 'EmployeeList', type: MenuType.MENU, permKey: 'employee:list', icon: 'Avatar', title: '员工管理', component: 'system/employees',
        children: [
          { type: MenuType.BUTTON, permKey: 'employee:view', title: '员工详情' },
          { type: MenuType.BUTTON, permKey: 'employee:create', title: '创建员工' },
          { type: MenuType.BUTTON, permKey: 'employee:create_cashier', title: '创建收银员' },
          { type: MenuType.BUTTON, permKey: 'employee:update', title: '编辑员工' },
          { type: MenuType.BUTTON, permKey: 'employee:reset_password', title: '重置密码' },
          { type: MenuType.BUTTON, permKey: 'employee:status', title: '启用/禁用' },
        ]},
      { path: '/system/roles', name: 'RoleList', type: MenuType.MENU, permKey: 'rbac:role_list', icon: 'Lock', title: '角色权限', component: 'system/roles',
        children: [
          { type: MenuType.BUTTON, permKey: 'rbac:role_view', title: '查看角色' },
          { type: MenuType.BUTTON, permKey: 'rbac:role_create', title: '创建角色' },
          { type: MenuType.BUTTON, permKey: 'rbac:role_update', title: '编辑角色' },
          { type: MenuType.BUTTON, permKey: 'rbac:role_delete', title: '删除角色' },
        ]},
      { path: '/system/menus', name: 'MenuManage', type: MenuType.MENU, permKey: 'rbac:menu_manage', icon: 'Menu', title: '菜单管理', component: 'system/menus' },
      { path: '/system/audit-logs', name: 'AuditLogs', type: MenuType.MENU, permKey: 'audit:view', icon: 'DocumentChecked', title: '操作日志', component: 'system/audit-logs',
        children: [
          { type: MenuType.BUTTON, permKey: 'audit:export', title: '导出日志' },
        ]},
    ],
  },
];

@Injectable()
export class RbacService implements OnModuleInit {
  private readonly logger = new Logger(RbacService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Menu)
    private readonly menuRepo: TreeRepository<Menu>,
    @InjectRepository(Role)
    private readonly roleRepo: Repository<Role>,
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
  ) {}

  /** 服务启动时：初始化菜单树 + 内置角色 */
  async onModuleInit() {
    try {
      await this.seedMenus();
      await this.seedBuiltinRoles();
    } catch (e) {
      this.logger.error(`[RBAC初始化] 失败: ${e.message}`);
    }
  }

  // ============== 菜单初始化 ==============
  async seedMenus() {
    const count = await this.menuRepo.count();
    if (count > 0) {
      this.logger.log(`[菜单初始化] 已存在 ${count} 条菜单，跳过`);
      return;
    }
    this.logger.log('[菜单初始化] 开始创建默认菜单...');
    const allMenuIds: Record<string, string> = {};

    // 先创建所有目录/菜单/按钮，保持 parent 引用
    const createNode = async (node: any, parentId?: string) => {
      const permKey = node.permKey;
      const exists = allMenuIds[permKey] || (await this.menuRepo.findOne({ where: { permKey } }));
      if (exists) return;

      const entity = this.menuRepo.create({
        name: node.title || node.name,
        type: node.type || MenuType.MENU,
        path: node.path || null,
        component: node.component || null,
        icon: node.icon || null,
        sort: node.sort ?? 0,
        permKey: node.permKey,
        visible: node.visible !== false,
        affix: !!node.affix,
        keepAlive: !!node.keepAlive,
        linkUrl: node.linkUrl || null,
        remark: node.title || '',
        isPlatform: !!node.isPlatform,
        parent: parentId ? ({ id: parentId } as any) : null,
      });
      const saved = await this.menuRepo.save(entity);
      allMenuIds[permKey] = saved.id;

      if (node.children?.length) {
        for (const child of node.children) {
          await createNode(child, saved.id);
        }
      }
    };

    for (const top of MENU_SEED_DEFINITION) {
      await createNode(top);
    }
    this.logger.log(`[菜单初始化] 完成，创建菜单权限共 ${Object.keys(allMenuIds).length} 项`);
  }

  // ============== 内置角色初始化 ==============
  async seedBuiltinRoles() {
    const builtinCodes = [
      { code: EmployeeRole.SUPER_ADMIN, name: '平台超级管理员', dataScope: DataScope.ALL, desc: '拥有平台一切权限' },
      { code: EmployeeRole.MERCHANT_OWNER, name: '商户所有者', dataScope: DataScope.MERCHANT_ALL, desc: '拥有本商户一切权限' },
      { code: EmployeeRole.MERCHANT_ADMIN, name: '商户管理员', dataScope: DataScope.MERCHANT_ALL, desc: '商户运营/财务' },
      { code: EmployeeRole.STORE_MANAGER, name: '门店店长', dataScope: DataScope.CURRENT_STORE, desc: '管理所属门店' },
      { code: EmployeeRole.CASHIER, name: '前台收银员', dataScope: DataScope.SELF, desc: '仅收款+查看本人订单' },
    ];

    for (const def of builtinCodes) {
      const existing = await this.roleRepo.findOne({ where: { code: def.code, merchantId: null as any } });
      if (existing) continue;

      const role = this.roleRepo.create({
        code: def.code,
        name: def.name,
        description: def.desc,
        isBuiltin: true,
        dataScope: def.dataScope,
        enabled: true,
      });
      const saved = await this.roleRepo.save(role);
      this.logger.log(`[角色初始化] 创建内置角色 ${def.code} → ${saved.id}`);
    }
  }

  // ============== 菜单树查询 ==============
  /** 查询全部菜单（管理员编辑角色权限时使用，返回树形） */
  async listAllMenus(includePlatform: boolean): Promise<MenuVo[]> {
    const qb = this.menuRepo.createQueryBuilder('m').orderBy('m.nsLeft', 'ASC');
    if (!includePlatform) qb.where('m.isPlatform = 0');
    const flat = await qb.getMany();
    return this.buildTree(flat, null);
  }

  /** 查询当前员工有权限的菜单树（PC端登录后获取动态路由） */
  async getMenusForEmployee(emp: EmployeePayload): Promise<MenuVo[]> {
    const empEntity = await this.employeeRepo.findOne({ where: { id: emp.id } });
    const permKeys = await this.getPermKeysOfEmployee(emp, empEntity);

    const includePlatform = emp.role === EmployeeRole.SUPER_ADMIN;
    const qb = this.menuRepo.createQueryBuilder('m');
    if (!includePlatform) qb.where('m.isPlatform = 0');
    qb.andWhere("m.type != 'button'") // 按钮不在菜单树显示
      .andWhere('m.visible = 1')
      .orderBy('m.sort', 'ASC')
      .addOrderBy('m.nsLeft', 'ASC');
    const all = await qb.getMany();

    // 老板/平台管理员直接看全部菜单
    const noPermFilter =
      emp.role === EmployeeRole.SUPER_ADMIN || emp.role === EmployeeRole.MERCHANT_OWNER;
    if (noPermFilter) {
      return this.buildTree(all, null);
    }
    // 否则：按 permKey 过滤
    const filtered = all.filter(
      (m) => permKeys.has(m.permKey) || m.type === MenuType.DIRECTORY,
    );
    // 目录需要被保留（如果存在任一子项有权限），做一次自顶向下的裁剪
    return this.filterTreeByPermission(this.buildTree(filtered, null), permKeys);
  }

  /** 获取员工权限点集合 */
  async getPermKeysOfEmployee(
    emp: EmployeePayload,
    empEntity?: Employee,
  ): Promise<Set<string>> {
    if (emp.role === EmployeeRole.SUPER_ADMIN) {
      return new Set(DEFAULT_ALL_PERM_KEYS);
    }
    const e = empEntity || (await this.employeeRepo.findOne({ where: { id: emp.id } }));
    if (e?.roleId) {
      const role = await this.roleRepo
        .createQueryBuilder('r')
        .leftJoinAndSelect('r.menus', 'm')
        .where('r.id = :rid', { rid: e.roleId })
        .getOne();
      if (role?.menus?.length) {
        return new Set(role.menus.map((m) => m.permKey));
      }
    }
    // 按内置角色返回
    const guard = this.getGuardDefaults();
    return new Set(guard(emp.role as EmployeeRole));
  }

  private getGuardDefaults() {
    // 懒加载避免循环依赖
    // tslint:disable-next-line
    return (role: EmployeeRole) => {
      switch (role) {
        case EmployeeRole.MERCHANT_OWNER:
          return DEFAULT_ALL_PERM_KEYS.filter((k) => !k.startsWith('platform:'));
        case EmployeeRole.MERCHANT_ADMIN:
          return DEFAULT_ALL_PERM_KEYS.filter(
            (k) => !k.startsWith('platform:') && !k.startsWith('rbac:') && !k.startsWith('payment_config:'),
          );
        case EmployeeRole.STORE_MANAGER:
          return [
            'dashboard:view','payment:micropay','payment:qrcode','payment:query',
            'order:list','order:detail','order:refund','order:close','report:view','report:trend',
            'store:view','employee:view','employee:create_cashier','refund:view','refund:audit',
            'report:cashier_dashboard','profile:view','profile:change_password',
          ];
        case EmployeeRole.CASHIER:
        default:
          return [
            'dashboard:view','payment:micropay','payment:qrcode','payment:query',
            'order:list','order:detail','order:refund_self','refund:view_self',
            'report:cashier_dashboard','profile:view','profile:change_password',
          ];
      }
    };
  }

  // ============== 角色管理 ==============
  async listRoles(emp: EmployeePayload, page = 1, pageSize = 50, keyword?: string) {
    const qb = this.roleRepo.createQueryBuilder('r');
    // 平台管理员：看全部
    if (emp.role === EmployeeRole.SUPER_ADMIN) {
      qb.where('1=1');
    } else {
      // 商户内：看本商户自定义角色 + 平台内置角色
      qb.where('(r.merchantId = :mid OR r.merchantId IS NULL)', { mid: emp.merchantId });
    }
    if (keyword) qb.andWhere('(r.name LIKE :kw OR r.code LIKE :kw)', { kw: `%${keyword}%` });
    qb.orderBy('r.isBuiltin', 'DESC').addOrderBy('r.sort', 'ASC').skip((page - 1) * pageSize).take(pageSize);
    const [list, total] = await qb.getManyAndCount();
    return { list, total, page, pageSize };
  }

  async getRoleDetail(emp: EmployeePayload, roleId: string) {
    const role = await this.roleRepo
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.menus', 'm')
      .where('r.id = :rid', { rid: roleId })
      .getOne();
    if (!role) throw new NotFoundException('角色不存在');
    if (role.merchantId && role.merchantId !== emp.merchantId && emp.role !== EmployeeRole.SUPER_ADMIN) {
      throw new ForbiddenException('无权查看其他商户的角色');
    }
    return { ...role, menuIds: role.menus?.map((m) => m.id) || [] };
  }

  async createRole(
    emp: EmployeePayload,
    dto: {
      name: string;
      description?: string;
      dataScope: DataScope;
      customStoreIds?: string[];
      menuIds: string[];
    },
  ) {
    if (emp.role !== EmployeeRole.MERCHANT_OWNER && emp.role !== EmployeeRole.SUPER_ADMIN) {
      throw new ForbiddenException('仅商户所有者或平台管理员可创建自定义角色');
    }
    const exist = await this.roleRepo.findOne({ where: { name: dto.name, merchantId: emp.merchantId } });
    if (exist) throw new BadRequestException('角色名称已存在');

    return this.dataSource.transaction(async (mgr) => {
      const role = mgr.create(Role, {
        merchantId: emp.merchantId,
        name: dto.name,
        description: dto.description,
        isBuiltin: false,
        dataScope: dto.dataScope,
        customStoreIds: dto.customStoreIds,
        enabled: true,
      });
      const saved = await mgr.save(role);
      if (dto.menuIds?.length) {
        const menus = await mgr.findBy(Menu, { id: In(dto.menuIds) });
        saved.menus = menus;
        await mgr.save(saved);
      }
      return saved;
    });
  }

  async updateRole(
    emp: EmployeePayload,
    roleId: string,
    dto: {
      name?: string;
      description?: string;
      dataScope?: DataScope;
      customStoreIds?: string[];
      menuIds?: string[];
      enabled?: boolean;
    },
  ) {
    const role = await this.roleRepo.findOne({
      where: { id: roleId },
      relations: ['menus'],
    });
    if (!role) throw new NotFoundException('角色不存在');
    if (role.isBuiltin && (emp.role !== EmployeeRole.SUPER_ADMIN)) {
      // 内置角色：只允许修改 menus 与 dataScope（不允许改名/删除）
      if (dto.name) throw new ForbiddenException('内置角色名称不可修改');
    }
    if (role.merchantId && role.merchantId !== emp.merchantId && emp.role !== EmployeeRole.SUPER_ADMIN) {
      throw new ForbiddenException('无权修改其他商户角色');
    }

    return this.dataSource.transaction(async (mgr) => {
      if (dto.name !== undefined) role.name = dto.name;
      if (dto.description !== undefined) role.description = dto.description;
      if (dto.dataScope) role.dataScope = dto.dataScope;
      if (dto.customStoreIds) role.customStoreIds = dto.customStoreIds;
      if (dto.enabled !== undefined) role.enabled = dto.enabled;
      await mgr.save(role);

      if (dto.menuIds) {
        const menus = await mgr.findBy(Menu, { id: In(dto.menuIds) });
        role.menus = menus;
        await mgr.save(role);
      }
      return role;
    });
  }

  async deleteRole(emp: EmployeePayload, roleId: string) {
    const role = await this.roleRepo.findOne({ where: { id: roleId } });
    if (!role) throw new NotFoundException('角色不存在');
    if (role.isBuiltin) throw new BadRequestException('内置角色不可删除');
    if (role.merchantId !== emp.merchantId && emp.role !== EmployeeRole.SUPER_ADMIN) {
      throw new ForbiddenException('无权删除其他商户角色');
    }
    // 检查是否有员工在使用
    const usingCount = await this.employeeRepo.count({ where: { roleId } });
    if (usingCount > 0) throw new BadRequestException(`有 ${usingCount} 个员工在使用该角色，请先调整`);
    await this.roleRepo.delete(roleId);
    return { message: '角色已删除' };
  }

  /** 根据数据权限返回 可见的门店ID列表；用于订单/报表等查询过滤 */
  async resolveDataScopeStoreIds(emp: EmployeePayload): Promise<{ storeIds: string[] | null; selfOnly: boolean; storeScopeSql?: string }> {
    // 获取员工的 dataScope
    const e = await this.employeeRepo.findOne({ where: { id: emp.id } });
    let scope = DataScope.CURRENT_STORE;
    let customStoreIds: string[] = [];
    if (e.roleId) {
      const r = await this.roleRepo.findOne({ where: { id: e.roleId } });
      if (r) {
        scope = r.dataScope;
        customStoreIds = r.customStoreIds || [];
      }
    } else {
      // 内置角色 -> 默认数据范围
      const builtinScopeMap: Record<EmployeeRole, DataScope> = {
        [EmployeeRole.SUPER_ADMIN]: DataScope.ALL,
        [EmployeeRole.MERCHANT_OWNER]: DataScope.MERCHANT_ALL,
        [EmployeeRole.MERCHANT_ADMIN]: DataScope.MERCHANT_ALL,
        [EmployeeRole.STORE_MANAGER]: DataScope.CURRENT_STORE,
        [EmployeeRole.CASHIER]: DataScope.SELF,
      };
      scope = builtinScopeMap[emp.role as EmployeeRole] ?? DataScope.SELF;
    }

    if (scope === DataScope.ALL || scope === DataScope.MERCHANT_ALL) {
      return { storeIds: null, selfOnly: false }; // null = 不过滤（全商户/平台）
    }
    if (scope === DataScope.MULTI_STORE) {
      return { storeIds: customStoreIds || [], selfOnly: false };
    }
    if (scope === DataScope.CURRENT_STORE) {
      return { storeIds: emp.storeId ? [emp.storeId] : [], selfOnly: false };
    }
    // SELF
    return { storeIds: null, selfOnly: true };
  }

  // ============== 内部工具 ==============
  private buildTree(items: Menu[], parentId: string | null): MenuVo[] {
    const byParent = new Map<string, Menu[]>();
    for (const it of items) {
      const pid = (it as any).parentId || (it.parent as any)?.id || null;
      if (!byParent.has(pid)) byParent.set(pid, []);
      byParent.get(pid).push(it);
    }
    const build = (pid: string | null): MenuVo[] => {
      const list = byParent.get(pid) || [];
      list.sort((a, b) => (a.sort || 0) - (b.sort || 0));
      return list.map((m) => ({
        id: m.id,
        name: m.name,
        type: m.type,
        path: m.path,
        component: m.component,
        icon: m.icon,
        sort: m.sort,
        permKey: m.permKey,
        visible: m.visible,
        keepAlive: m.keepAlive,
        affix: m.affix,
        linkUrl: m.linkUrl,
        isPlatform: m.isPlatform,
        children: build(m.id),
      }));
    };
    return build(parentId);
  }

  private filterTreeByPermission(tree: MenuVo[], permKeys: Set<string>): MenuVo[] {
    const walk = (nodes: MenuVo[]): MenuVo[] => {
      const out: MenuVo[] = [];
      for (const n of nodes) {
        const children = n.children ? walk(n.children) : [];
        const keep =
          n.type === MenuType.DIRECTORY
            ? children.length > 0 // 目录至少有一个子项才保留
            : permKeys.has(n.permKey);
        if (keep) {
          out.push({ ...n, children });
        }
      }
      return out;
    };
    return walk(tree);
  }
}

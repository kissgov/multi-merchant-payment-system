import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { RbacService, MenuVo } from './rbac.service';
import { CurrentEmployee, EmployeePayload } from '../../common/decorators/current-employee.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { EmployeeRole } from '../../entities/employee.entity';
import { DataScope } from '../../entities/role.entity';

@ApiTags('权限角色模块 - RBAC（PC端）')
@Controller('api/rbac')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth()
export class RbacController {
  constructor(private readonly rbac: RbacService) {}

  // ============ 菜单接口 ============
  @Get('menus/me')
  @ApiOperation({ summary: '【登录后立即调用】获取当前员工的菜单树 + 路由' })
  async getMyMenus(@CurrentEmployee() emp: EmployeePayload): Promise<MenuVo[]> {
    return this.rbac.getMenusForEmployee(emp);
  }

  @Get('menus/all')
  @Roles(EmployeeRole.SUPER_ADMIN, EmployeeRole.MERCHANT_OWNER)
  @RequirePermissions(['rbac:menu_list'])
  @ApiOperation({ summary: '[编辑角色用] 获取全部菜单/权限树（含权限点）' })
  async listAllMenus(@Query('includePlatform') includePlatform: any, @CurrentEmployee() emp: EmployeePayload) {
    const incl = includePlatform === 'true' || emp.role === EmployeeRole.SUPER_ADMIN;
    return this.rbac.listAllMenus(incl);
  }

  @Get('perms/me')
  @ApiOperation({ summary: '【前端按钮级权限】获取当前员工拥有的所有权限Key列表' })
  async getMyPerms(@CurrentEmployee() emp: EmployeePayload) {
    const set = await this.rbac.getPermKeysOfEmployee(emp);
    return { permKeys: Array.from(set) };
  }

  // ============ 角色管理 ============
  @Get('roles')
  @RequirePermissions(['rbac:role_list'])
  @ApiOperation({ summary: '角色列表' })
  async listRoles(
    @CurrentEmployee() emp: EmployeePayload,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
    @Query('keyword') keyword?: string,
  ) {
    return this.rbac.listRoles(emp, page, pageSize, keyword);
  }

  @Get('roles/:roleId')
  @RequirePermissions(['rbac:role_view'])
  @ApiOperation({ summary: '角色详情（含menuIds用于编辑角色时回显勾选）' })
  async roleDetail(@CurrentEmployee() emp: EmployeePayload, @Param('roleId') roleId: string) {
    return this.rbac.getRoleDetail(emp, roleId);
  }

  @Post('roles')
  @Roles(EmployeeRole.SUPER_ADMIN, EmployeeRole.MERCHANT_OWNER)
  @RequirePermissions(['rbac:role_create'])
  @ApiOperation({ summary: '创建自定义角色（含分配菜单/权限点）' })
  async createRole(
    @CurrentEmployee() emp: EmployeePayload,
    @Body() dto: {
      name: string;
      description?: string;
      dataScope: DataScope;
      customStoreIds?: string[];
      menuIds: string[];
    },
  ) {
    return this.rbac.createRole(emp, dto);
  }

  @Patch('roles/:roleId')
  @Roles(EmployeeRole.SUPER_ADMIN, EmployeeRole.MERCHANT_OWNER)
  @RequirePermissions(['rbac:role_update'])
  @ApiOperation({ summary: '编辑角色 / 重新分配权限 / 切换启用' })
  async updateRole(
    @CurrentEmployee() emp: EmployeePayload,
    @Param('roleId') roleId: string,
    @Body() dto: any,
  ) {
    return this.rbac.updateRole(emp, roleId, dto);
  }

  @Delete('roles/:roleId')
  @Roles(EmployeeRole.SUPER_ADMIN, EmployeeRole.MERCHANT_OWNER)
  @RequirePermissions(['rbac:role_delete'])
  @ApiOperation({ summary: '删除自定义角色（内置角色不可删）' })
  async deleteRole(@CurrentEmployee() emp: EmployeePayload, @Param('roleId') roleId: string) {
    return this.rbac.deleteRole(emp, roleId);
  }

  @Get('data-scope')
  @ApiOperation({ summary: '[前端可选] 获取当前员工数据权限范围和可见门店ID' })
  async getDataScope(@CurrentEmployee() emp: EmployeePayload) {
    return this.rbac.resolveDataScopeStoreIds(emp);
  }
}

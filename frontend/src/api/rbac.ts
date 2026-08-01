import request from './request';

/** 获取当前员工菜单树 */
export const getMyMenus = () => request.get('/api/rbac/menus/me');

/** 获取当前员工权限点列表 */
export const getMyPerms = () =>
  request.get<any, { permKeys: string[] }>('/api/rbac/perms/me');

/** 获取全部菜单/权限树（编辑角色用） */
export const getAllMenus = (includePlatform = false) =>
  request.get('/api/rbac/menus/all', { params: { includePlatform } });

/** 角色列表 */
export const getRoleList = (params?: { page?: number; pageSize?: number; keyword?: string }) =>
  request.get('/api/rbac/roles', { params });

/** 角色详情 */
export const getRoleDetail = (roleId: string) =>
  request.get(`/api/rbac/roles/${roleId}`);

/** 创建角色 */
export const createRole = (data: {
  name: string;
  description?: string;
  dataScope: string;
  customStoreIds?: string[];
  menuIds: string[];
}) => request.post('/api/rbac/roles', data);

/** 编辑角色 */
export const updateRole = (
  roleId: string,
  data: {
    name?: string;
    description?: string;
    dataScope?: string;
    customStoreIds?: string[];
    menuIds?: string[];
    enabled?: boolean;
  },
) => request.patch(`/api/rbac/roles/${roleId}`, data);

/** 删除角色 */
export const deleteRole = (roleId: string) =>
  request.delete(`/api/rbac/roles/${roleId}`);

/** 数据范围 */
export const getDataScope = () => request.get('/api/rbac/data-scope');

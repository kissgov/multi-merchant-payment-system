import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import Cookies from 'js-cookie';
import { login as loginApi, getMe, type LoginDto } from '@/api/auth';
import { getMyPerms } from '@/api/rbac';

const TOKEN_KEY = 'Admin-Token';

export const useUserStore = defineStore('user', () => {
  const token = ref<string>(Cookies.get(TOKEN_KEY) || '');
  const userInfo = ref<any>(null);
  const perms = ref<Set<string>>(new Set());
  const roles = ref<string[]>([]);

  const isLoggedIn = computed(() => !!token.value);
  const isSuperAdmin = computed(() => userInfo.value?.role === 'super_admin');
  const isMerchantOwner = computed(
    () => userInfo.value?.role === 'merchant_owner' || isSuperAdmin.value,
  );

  /** 登录 */
  async function login(dto: LoginDto) {
    const res = await loginApi(dto);
    token.value = res.accessToken;
    Cookies.set(TOKEN_KEY, res.accessToken, { expires: 1 });
    userInfo.value = res.employee;
    roles.value = [res.employee.role];
    // 拉取权限点
    await fetchPerms();
    return res;
  }

  /** 获取权限点 */
  async function fetchPerms() {
    try {
      const res = await getMyPerms();
      perms.value = new Set(res.permKeys);
    } catch {
      perms.value = new Set();
    }
  }

  /** 获取用户信息 */
  async function fetchUserInfo() {
    const res: any = await getMe();
    userInfo.value = {
      id: res.id,
      employeeNo: res.employeeNo,
      name: res.name,
      username: res.username,
      role: res.role,
      roleId: res.roleId,
      merchantId: res.merchantId,
      storeId: res.storeId,
      avatar: res.avatar,
      phone: res.phone,
    };
    roles.value = [res.role];
    await fetchPerms();
    return res;
  }

  /** 检查是否有权限 */
  function hasPermission(permKey: string): boolean {
    if (isSuperAdmin.value) return true;
    if (isMerchantOwner.value && !permKey.startsWith('platform:')) return true;
    return perms.value.has(permKey);
  }

  /** 检查是否有任一权限 */
  function hasAnyPermission(permKeys: string[]): boolean {
    return permKeys.some((k) => hasPermission(k));
  }

  /** 退出登录 */
  function logout() {
    token.value = '';
    userInfo.value = null;
    perms.value = new Set();
    roles.value = [];
    Cookies.remove(TOKEN_KEY);
  }

  return {
    token,
    userInfo,
    perms,
    roles,
    isLoggedIn,
    isSuperAdmin,
    isMerchantOwner,
    login,
    fetchPerms,
    fetchUserInfo,
    hasPermission,
    hasAnyPermission,
    logout,
  };
});

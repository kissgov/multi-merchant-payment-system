import { defineStore } from 'pinia';
import { ref } from 'vue';
import { getMyMenus } from '@/api/rbac';

export interface MenuVo {
  id: string;
  name: string;
  type: 'directory' | 'menu' | 'button';
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

export const usePermissionStore = defineStore('permission', () => {
  const menus = ref<MenuVo[]>([]);
  const loaded = ref(false);

  /** 从后端获取菜单并生成路由 */
  async function generateRoutes(): Promise<MenuVo[]> {
    const data = await getMyMenus();
    menus.value = data || [];
    loaded.value = true;
    return menus.value;
  }

  function reset() {
    menus.value = [];
    loaded.value = false;
  }

  return { menus, loaded, generateRoutes, reset };
});

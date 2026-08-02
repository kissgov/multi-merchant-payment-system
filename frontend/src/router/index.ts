import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router';
import NProgress from 'nprogress';
import 'nprogress/nprogress.css';
import { useUserStore } from '@/stores/user';
import { usePermissionStore, type MenuVo } from '@/stores/permission';
import Layout from '@/layouts/default.vue';

NProgress.configure({ showSpinner: false });

/** 静态路由（无需权限） */
export const constantRoutes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/login.vue'),
    meta: { hidden: true },
  },
  {
    path: '/404',
    name: 'NotFound',
    component: () => import('@/views/404.vue'),
    meta: { hidden: true },
  },
];

const router = createRouter({
  history: createWebHashHistory(),
  routes: constantRoutes,
  scrollBehavior: () => ({ left: 0, top: 0 }),
});

/** 组件懒加载映射表 */
const modules = import.meta.glob('../views/**/*.vue');

/** 将后端菜单树转为 Vue Router 路由 */
function transformMenusToRoutes(menus: MenuVo[]): RouteRecordRaw[] {
  const routes: RouteRecordRaw[] = [];

  for (const menu of menus) {
    if (menu.type === 'button') continue;
    if (!menu.path) continue;

    const route: RouteRecordRaw = {
      path: menu.path,
      name: menu.path.replace(/\//g, '-').slice(1),
      meta: {
        title: menu.name,
        icon: menu.icon,
        permKey: menu.permKey,
        keepAlive: menu.keepAlive,
        affix: menu.affix,
      },
      component: undefined as any,
    };

    // 顶层路由用 Layout 包裹
    if (!menu.path.startsWith('/')) continue;

    if (menu.children && menu.children.length > 0) {
      // 目录：用 Layout 作为父组件
      route.component = Layout;
      route.redirect = menu.children[0].path;
      route.children = menu.children
        .filter((c) => c.type === 'menu' && c.path)
        .map((child) => {
          // 子路由 path 转为相对路径（去掉父级前缀和开头的 /）
          let childPath = child.path;
          if (childPath.startsWith(route.path)) {
            childPath = childPath.slice(route.path.length).replace(/^\/+/, '');
          }
          if (!childPath) childPath = 'index';
          const childRoute: RouteRecordRaw = {
            path: childPath,
            name: child.path.replace(/\//g, '-').slice(1),
            meta: {
              title: child.name,
              icon: child.icon,
              permKey: child.permKey,
              keepAlive: child.keepAlive,
            },
            component: resolveComponent(child.component),
          };
          return childRoute;
        });
    } else {
      // 独立菜单
      route.component = resolveComponent(menu.component);
    }

    routes.push(route);
  }

  return routes;
}

/** 根据后端返回的 component 字符串路径解析组件 */
function resolveComponent(component?: string): any {
  if (!component) return undefined;
  const path = `/src/views/${component}.vue`;
  return modules[path] || modules[`../views/${component}.vue`] || undefined;
}

/** 全局前置守卫 */
const whiteList = ['/login', '/404'];

router.beforeEach(async (to, _from, next) => {
  NProgress.start();
  const userStore = useUserStore();
  const permissionStore = usePermissionStore();

  if (userStore.token) {
    if (to.path === '/login') {
      next('/');
      NProgress.done();
      return;
    }

    // 如果还没加载用户信息和路由
    if (!userStore.userInfo) {
      try {
        await userStore.fetchUserInfo();
      } catch {
        userStore.logout();
        next('/login');
        NProgress.done();
        return;
      }
    }

    if (!permissionStore.loaded) {
      try {
        const menus = await permissionStore.generateRoutes();
        const dynamicRoutes = transformMenusToRoutes(menus);
        dynamicRoutes.forEach((r) => router.addRoute(r));
        // 根路径重定向到第一个可用菜单
        const firstMenuPath = dynamicRoutes[0]?.path;
        if (firstMenuPath) {
          router.addRoute({ path: '/', redirect: firstMenuPath });
        }
        // 兜底 404
        router.addRoute({
          path: '/:pathMatch(.*)*',
          redirect: '/404',
          meta: { hidden: true },
        });
        next({ ...to, replace: true });
      } catch {
        userStore.logout();
        next('/login');
      }
      NProgress.done();
      return;
    }

    next();
  } else {
    if (whiteList.includes(to.path)) {
      next();
    } else {
      next('/login');
    }
    NProgress.done();
  }
});

router.afterEach(() => {
  NProgress.done();
});

/**
 * 路由错误兜底：捕获懒加载 chunk 加载失败。
 * 场景：前端重新部署后，用户当前标签页仍持有旧 index.html（引用已删除的旧 hash chunk），
 *       路由懒加载该 chunk 时报 "Failed to fetch dynamically imported module" → 白屏。
 * 处理：自动整页刷新一次（带时间戳绕过缓存拿最新 index.html），避免用户看到白屏。
 *      用 flag 防止刷新死循环（如刷新后仍失败则不再重试）。
 */
let reloadingForChunkError = false;
router.onError((error, to) => {
  const msg = (error as Error)?.message || String(error);
  const isChunkFail =
    /Failed to fetch dynamically imported module|Loading chunk|Loading CSS chunk|Importing a module script failed/i.test(
      msg,
    );
  if (isChunkFail && !reloadingForChunkError) {
    reloadingForChunkError = true;
    const hash = to?.fullPath ? `#${to.fullPath}` : window.location.hash || '';
    // 带时间戳 query 强制重新下载 index.html，hash 保留以回到目标路由
    window.location.href = `${window.location.pathname}?t=${Date.now()}${hash}`;
  }
});

export default router;

<template>
  <div class="app-wrapper">
    <!-- 侧边栏 -->
    <div class="sidebar" :class="{ collapsed: appStore.sidebarCollapsed }">
      <div class="logo">
        <span v-if="!appStore.sidebarCollapsed">支付管理后台</span>
        <span v-else>支付</span>
      </div>
      <el-scrollbar>
        <el-menu
          :default-active="activeMenu"
          :collapse="appStore.sidebarCollapsed"
          :background-color="sideBg"
          text-color="#bfcbd9"
          active-text-color="#409eff"
          router
        >
          <template v-for="menu in menus" :key="menu.id">
            <!-- 单菜单 -->
            <el-menu-item
              v-if="!menu.children || menu.children.filter((c) => c.type === 'menu').length === 0"
              :index="menu.path"
            >
              <el-icon v-if="menu.icon"><component :is="menu.icon" /></el-icon>
              <template #title>{{ menu.name }}</template>
            </el-menu-item>
            <!-- 多级菜单 -->
            <el-sub-menu v-else :index="menu.path">
              <template #title>
                <el-icon v-if="menu.icon"><component :is="menu.icon" /></el-icon>
                <span>{{ menu.name }}</span>
              </template>
              <el-menu-item
                v-for="child in menu.children.filter((c) => c.type === 'menu')"
                :key="child.id"
                :index="resolvePath(menu.path, child.path)"
              >
                <el-icon v-if="child.icon"><component :is="child.icon" /></el-icon>
                <template #title>{{ child.name }}</template>
              </el-menu-item>
            </el-sub-menu>
          </template>
        </el-menu>
      </el-scrollbar>
    </div>

    <!-- 主区域 -->
    <div class="main-container">
      <!-- 顶部 -->
      <div class="header">
        <div class="header-left">
          <el-icon class="collapse-btn" @click="appStore.toggleSidebar">
            <Fold v-if="!appStore.sidebarCollapsed" />
            <Expand v-else />
          </el-icon>
          <el-breadcrumb separator="/">
            <el-breadcrumb-item :to="{ path: '/' }">首页</el-breadcrumb-item>
            <el-breadcrumb-item v-if="route.meta.title">{{ route.meta.title }}</el-breadcrumb-item>
          </el-breadcrumb>
        </div>
        <div class="header-right">
          <!-- 待审批退款徽标 -->
          <el-badge :value="pendingRefundCount" :hidden="pendingRefundCount === 0" class="badge-item">
            <el-button text @click="router.push('/refund/list')">
              <el-icon><Bell /></el-icon>
            </el-button>
          </el-badge>

          <el-dropdown trigger="click">
            <div class="avatar-wrapper">
              <el-avatar :size="32" :src="userStore.userInfo?.avatar">
                {{ userStore.userInfo?.name?.charAt(0) }}
              </el-avatar>
              <span class="username">{{ userStore.userInfo?.name }}</span>
              <el-icon><ArrowDown /></el-icon>
            </div>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item @click="router.push('/system/profile')">
                  <el-icon><User /></el-icon>个人中心
                </el-dropdown-item>
                <el-dropdown-item divided @click="handleLogout">
                  <el-icon><SwitchButton /></el-icon>退出登录
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </div>

      <!-- 标签页 -->
      <div class="tags-view">
        <el-scrollbar>
          <div class="tags-scroll">
            <router-link
              v-for="tag in appStore.tagsView"
              :key="tag.path"
              :to="tag.path"
              class="tag-item"
              :class="{ active: route.path === tag.path }"
            >
              {{ tag.title }}
              <el-icon v-if="!tag.affix" class="close-icon" @click.prevent.stop="closeTag(tag.path)">
                <Close />
              </el-icon>
            </router-link>
          </div>
        </el-scrollbar>
      </div>

      <!-- 内容区 -->
      <div class="app-main" v-loading="appStore.globalLoading" element-loading-text="加载中..." element-loading-background="rgba(255,255,255,0.6)">
        <router-view v-slot="{ Component }">
          <keep-alive>
            <component :is="Component" />
          </keep-alive>
        </router-view>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessageBox } from 'element-plus';
import { useUserStore } from '@/stores/user';
import { usePermissionStore } from '@/stores/permission';
import { useAppStore } from '@/stores/app';
import { getPendingCount } from '@/api/refund';

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const permissionStore = usePermissionStore();
const appStore = useAppStore();

const sideBg = '#304156';
const pendingRefundCount = ref(0);

const menus = computed(() => permissionStore.menus);

const activeMenu = computed(() => route.path);

function resolvePath(parent: string, child: string) {
  if (child.startsWith('/')) return child;
  return `${parent}/${child}`.replace(/\/+/g, '/');
}

// 添加标签
watch(
  () => route.path,
  (path) => {
    if (path && path !== '/login' && route.meta.title) {
      appStore.addTag({ path, title: route.meta.title as string, affix: route.meta.affix as boolean });
    }
  },
  { immediate: true },
);

function closeTag(path: string) {
  const isCurrent = route.path === path;
  appStore.removeTag(path);
  if (isCurrent) {
    const last = appStore.tagsView[appStore.tagsView.length - 1];
    router.push(last ? last.path : '/');
  }
}

async function fetchPending() {
  try {
    const res: any = await getPendingCount();
    pendingRefundCount.value = res?.count || 0;
  } catch {}
}

onMounted(() => {
  fetchPending();
  // 每30秒刷新一次待审批数
  setInterval(fetchPending, 30000);
});

async function handleLogout() {
  await ElMessageBox.confirm('确定要退出登录吗？', '提示', {
    type: 'warning',
  });
  userStore.logout();
  permissionStore.reset();
  router.push('/login');
}
</script>

<style lang="scss" scoped>
@use '@/styles/variables.scss' as *;

.app-wrapper {
  display: flex;
  width: 100%;
  height: 100%;
}

.sidebar {
  width: $sidebar-width;
  height: 100%;
  background: $sidebar-bg;
  transition: width 0.3s;
  overflow: hidden;
  flex-shrink: 0;

  &.collapsed {
    width: $sidebar-collapsed-width;
  }

  .logo {
    height: $header-height;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    font-size: 16px;
    font-weight: 600;
    white-space: nowrap;
  }

  :deep(.el-menu) {
    border-right: none;
  }
}

.main-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.header {
  height: $header-height;
  background: #fff;
  border-bottom: 1px solid #e6e6e6;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  flex-shrink: 0;

  .header-left {
    display: flex;
    align-items: center;
    gap: 16px;

    .collapse-btn {
      font-size: 20px;
      cursor: pointer;
    }
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 16px;

    .avatar-wrapper {
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;

      .username {
        font-size: 14px;
      }
    }
  }
}

.tags-view {
  height: $tags-height;
  background: #fff;
  border-bottom: 1px solid #e6e6e6;
  flex-shrink: 0;

  .tags-scroll {
    display: flex;
    align-items: center;
    height: $tags-height;
    padding: 0 8px;
    white-space: nowrap;

    .tag-item {
      display: inline-flex;
      align-items: center;
      height: 26px;
      padding: 0 8px;
      margin-right: 4px;
      font-size: 12px;
      border: 1px solid #d9d9d9;
      border-radius: 3px;
      color: #495060;
      text-decoration: none;
      cursor: pointer;

      &.active {
        background: $primary-color;
        color: #fff;
        border-color: $primary-color;
      }

      .close-icon {
        margin-left: 4px;
        font-size: 12px;
        border-radius: 50%;

        &:hover {
          background: rgba(0, 0, 0, 0.2);
        }
      }
    }
  }
}

.app-main {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  background: $bg-color;
}
</style>

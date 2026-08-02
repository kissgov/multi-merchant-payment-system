import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export const useAppStore = defineStore('app', () => {
  const sidebarCollapsed = ref(false);
  const tagsView = ref<Array<{ path: string; title: string; affix?: boolean }>>([]);

  // ========== 全局请求 loading ==========
  // 使用计数器支持嵌套请求：多个请求并发时最后一个完成才关闭 loading
  const _loadingCount = ref(0);
  const globalLoading = computed(() => _loadingCount.value > 0);

  function startLoading() {
    _loadingCount.value++;
  }
  function endLoading() {
    if (_loadingCount.value > 0) _loadingCount.value--;
  }

  function toggleSidebar() {
    sidebarCollapsed.value = !sidebarCollapsed.value;
  }

  function addTag(tag: { path: string; title: string; affix?: boolean }) {
    if (tagsView.value.some((t) => t.path === tag.path)) return;
    tagsView.value.push(tag);
  }

  function removeTag(path: string) {
    const idx = tagsView.value.findIndex((t) => t.path === path);
    if (idx > -1) tagsView.value.splice(idx, 1);
  }

  return {
    sidebarCollapsed,
    tagsView,
    globalLoading,
    toggleSidebar,
    addTag,
    removeTag,
    startLoading,
    endLoading,
  };
});

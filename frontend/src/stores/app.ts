import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useAppStore = defineStore('app', () => {
  const sidebarCollapsed = ref(false);
  const tagsView = ref<Array<{ path: string; title: string; affix?: boolean }>>([]);

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

  return { sidebarCollapsed, tagsView, toggleSidebar, addTag, removeTag };
});

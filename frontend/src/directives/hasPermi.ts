import type { Directive, DirectiveBinding } from 'vue';
import { useUserStore } from '@/stores/user';

/**
 * 按钮级权限指令
 * 用法：
 *   v-hasPermi="'order:refund'"
 *   v-hasPermi="['order:refund', 'refund:audit']"  // 任一即可
 */
export const hasPermi: Directive = {
  mounted(el: HTMLElement, binding: DirectiveBinding) {
    const { value } = binding;
    const userStore = useUserStore();

    if (!value) return;

    const permKeys = Array.isArray(value) ? value : [value];
    const hasAuth = permKeys.some((key: string) => userStore.hasPermission(key));

    if (!hasAuth) {
      el.parentNode?.removeChild(el);
    }
  },
};

import { ElMessageBox, type ElMessageBoxOptions, ElMessage } from 'element-plus';

/**
 * 统一操作确认弹窗工具
 * 避免各页面重复写 ElMessageBox.confirm 的样板代码。
 *
 * 用法：
 *   const ok = await confirmDelete();
 *   if (!ok) return;
 *   // 执行删除
 *
 *   const ok = await confirmRefund(order.paidAmount);
 *   if (!ok) return;
 *   // 执行退款
 */

interface ConfirmOptions extends Partial<ElMessageBoxOptions> {
  /** 标题，默认"操作确认" */
  title?: string;
  /** 确定按钮文字，默认"确认" */
  confirmText?: string;
  /** 取消按钮文字，默认"取消" */
  cancelText?: string;
  /** 类型：warning 警告橙（默认）/danger 危险红/info 信息蓝/success 成功绿 */
  type?: 'warning' | 'danger' | 'info' | 'success';
}

/**
 * 通用确认
 */
export async function confirmAction(
  message: string,
  opts: ConfirmOptions = {},
): Promise<boolean> {
  const {
    title = '操作确认',
    confirmText = '确认',
    cancelText = '取消',
    type = 'warning',
    ...rest
  } = opts;
  try {
    await ElMessageBox.confirm(message, title, {
      confirmButtonText: confirmText,
      cancelButtonText: cancelText,
      type,
      distinguishCancelAndClose: true,
      ...rest,
    });
    return true;
  } catch {
    return false;
  }
}

/** 删除确认 */
export function confirmDelete(target = '该数据', opts: ConfirmOptions = {}): Promise<boolean> {
  return confirmAction(`确定要删除${target}吗？此操作不可撤销。`, {
    title: '删除确认',
    confirmText: '删除',
    type: 'danger',
    ...opts,
  });
}

/** 退款确认 */
export function confirmRefund(
  amount: number | string,
  opts: ConfirmOptions = {},
): Promise<boolean> {
  return confirmAction(
    `确定要退款 ￥${Number(amount).toFixed(2)} 吗？退款将原路返回，可能需要1-3个工作日到账。`,
    {
      title: '退款确认',
      confirmText: '确认退款',
      type: 'danger',
      ...opts,
    },
  );
}

/** 关闭订单确认 */
export function confirmCloseOrder(opts: ConfirmOptions = {}): Promise<boolean> {
  return confirmAction('确定要关闭该待支付订单吗？关闭后用户将无法继续支付。', {
    title: '关闭订单确认',
    type: 'warning',
    ...opts,
  });
}

/** 停用账号确认 */
export function confirmDisable(target = '该账号', opts: ConfirmOptions = {}): Promise<boolean> {
  return confirmAction(`确定要停用${target}吗？停用后将无法登录和操作。`, {
    title: '停用确认',
    type: 'warning',
    ...opts,
  });
}

/** 成功提示 */
export function toastSuccess(message: string) {
  ElMessage({ type: 'success', message, duration: 2000 });
}

/** 警告提示 */
export function toastWarning(message: string) {
  ElMessage({ type: 'warning', message });
}

/** 错误提示 */
export function toastError(message: string) {
  ElMessage({ type: 'error', message });
}

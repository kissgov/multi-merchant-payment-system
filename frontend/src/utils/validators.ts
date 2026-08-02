import type { FormRules, FormItemRule } from 'element-plus';

/**
 * 共享表单校验规则
 * 使用方法：
 *   import { phoneRule, amountRule, requiredRule } from '@/utils/validators';
 *   const rules: FormRules = { phone: [requiredRule, phoneRule] };
 */

/** 必填校验（带默认中文提示） */
export const requiredRule: FormItemRule = {
  required: true,
  message: '此项为必填',
  trigger: 'blur',
};

export function required(msg = '此项为必填'): FormItemRule {
  return { required: true, message: msg, trigger: 'blur' };
}

/** 手机号 */
export const phoneRule: FormItemRule = {
  pattern: /^1[3-9]\d{9}$/,
  message: '请输入正确的11位手机号',
  trigger: 'blur',
};

/** 邮箱 */
export const emailRule: FormItemRule = {
  type: 'email',
  message: '请输入正确的邮箱地址',
  trigger: 'blur',
};

/** 金额（元）：正数，最多2位小数，最大999999.99 */
export const amountRule: FormItemRule = {
  validator: (_rule, value, callback) => {
    if (value === '' || value === null || value === undefined) {
      callback();
      return;
    }
    const n = Number(value);
    if (Number.isNaN(n) || n <= 0) {
      callback(new Error('金额必须大于0'));
      return;
    }
    if (n > 999999.99) {
      callback(new Error('金额最大999999.99'));
      return;
    }
    if (!/^\d+(\.\d{1,2})?$/.test(String(value))) {
      callback(new Error('最多保留2位小数'));
      return;
    }
    callback();
  },
  trigger: 'blur',
};

/** 整数（最小1） */
export function positiveIntRule(msg = '必须为正整数'): FormItemRule {
  return {
    type: 'integer',
    min: 1,
    message: msg,
    trigger: 'blur',
  };
}

/** 身份证号（宽松校验） */
export const idCardRule: FormItemRule = {
  pattern: /(^\d{15}$)|(^\d{17}(\d|X|x)$)/,
  message: '请输入正确的身份证号',
  trigger: 'blur',
};

/** 支付宝/微信付款码（8-32位数字，可选前缀） */
export const authCodeRule: FormItemRule = {
  validator: (_rule, value, callback) => {
    if (!value) return callback();
    const v = String(value).trim();
    if (v.length < 8 || v.length > 32 || !/^\d+$/.test(v)) {
      callback(new Error('付款码应为8-32位数字'));
      return;
    }
    callback();
  },
  trigger: 'blur',
};

/** 最大长度 */
export function maxLenRule(max: number): FormItemRule {
  return { max, message: `最多输入${max}个字符`, trigger: 'blur' };
}

/** 通用组合快捷：必填金额 */
export const requiredAmount: FormItemRule[] = [
  { required: true, message: '请输入金额', trigger: 'blur' },
  amountRule,
];

/** 通用组合快捷：必填手机号 */
export const requiredPhone: FormItemRule[] = [
  { required: true, message: '请输入手机号', trigger: 'blur' },
  phoneRule,
];

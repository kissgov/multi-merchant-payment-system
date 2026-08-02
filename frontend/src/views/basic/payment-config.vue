<template>
  <div class="payment-config-page">
    <el-alert
      class="security-alert"
      title="请妥善保管支付密钥，泄露可能导致资金风险"
      type="warning"
      :closable="false"
      show-icon
    />

    <!-- 配置对象切换 -->
    <el-card class="config-card scope-card" shadow="never">
      <el-radio-group v-model="scope" @change="onScopeChange">
        <el-radio-button value="merchant">商户默认配置</el-radio-button>
        <el-radio-button value="store">指定门店配置</el-radio-button>
      </el-radio-group>

      <div v-if="scope === 'store'" class="store-picker">
        <el-select
          v-model="storeId"
          placeholder="请选择门店"
          filterable
          style="width: 320px"
          @change="loadConfig"
        >
          <el-option
            v-for="s in storeOptions"
            :key="s.id"
            :label="`${s.name}（${s.storeNo}）`"
            :value="s.id"
          />
        </el-select>
        <el-tooltip
          content="启用后该门店支付将优先使用下方配置，未填写项自动回退商户默认配置"
          placement="right"
        >
          <el-checkbox v-model="form.useIndependentPayment" class="independent-switch">
            启用独立支付配置
          </el-checkbox>
        </el-tooltip>
      </div>

      <div v-if="scope === 'merchant'" class="scope-hint">
        此处配置为商户默认支付参数，所有未启用“独立支付配置”的门店将共用本配置。
      </div>
    </el-card>

    <el-form ref="formRef" :model="form" :rules="rules" label-width="140px" v-loading="loading">
      <!-- 支付宝配置 -->
      <el-card class="config-card" shadow="never">
        <template #header>
          <div class="card-title">
            <el-icon><CreditCard /></el-icon>
            <span>支付宝配置</span>
          </div>
        </template>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="APPID" prop="alipayAppId">
              <el-input v-model="form.alipayAppId" placeholder="请输入支付宝应用 APPID" maxlength="64" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="沙箱环境">
              <el-switch v-model="form.alipaySandbox" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="应用私钥" prop="alipayPrivateKey">
          <el-input
            v-model="form.alipayPrivateKey"
            type="textarea"
            :rows="4"
            :placeholder="secretPlaceholder('alipayPrivateKey')"
            resize="vertical"
          />
          <span v-if="configuredFlags.alipayPrivateKey" class="configured-tip">已配置（留空表示不修改）</span>
        </el-form-item>
        <el-form-item label="支付宝公钥" prop="alipayPublicKey">
          <el-input
            v-model="form.alipayPublicKey"
            type="textarea"
            :rows="4"
            :placeholder="secretPlaceholder('alipayPublicKey')"
            resize="vertical"
          />
          <span v-if="configuredFlags.alipayPublicKey" class="configured-tip">已配置（留空表示不修改）</span>
        </el-form-item>
      </el-card>

      <!-- 微信支付配置 -->
      <el-card class="config-card" shadow="never">
        <template #header>
          <div class="card-title">
            <el-icon><Wallet /></el-icon>
            <span>微信支付配置</span>
          </div>
        </template>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="商户号" prop="wechatMchId">
              <el-input v-model="form.wechatMchId" placeholder="请输入微信支付商户号" maxlength="32" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="AppID" prop="wechatAppId">
              <el-input v-model="form.wechatAppId" placeholder="请输入关联的 AppID" maxlength="32" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="商户证书序列号" prop="wechatMchSerialNo">
              <el-input v-model="form.wechatMchSerialNo" placeholder="请输入商户证书序列号" maxlength="64" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="沙箱环境">
              <el-switch v-model="form.wechatSandbox" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="API V3 密钥" prop="wechatApiV3Key">
          <el-input
            v-model="form.wechatApiV3Key"
            type="textarea"
            :rows="3"
            :placeholder="secretPlaceholder('wechatApiV3Key')"
            resize="vertical"
          />
          <span v-if="configuredFlags.wechatApiV3Key" class="configured-tip">已配置（留空表示不修改）</span>
        </el-form-item>
        <el-form-item label="商户私钥" prop="wechatPrivateKey">
          <el-input
            v-model="form.wechatPrivateKey"
            type="textarea"
            :rows="6"
            :placeholder="secretPlaceholder('wechatPrivateKey') + '（PEM 格式）'"
            resize="vertical"
          />
          <span v-if="configuredFlags.wechatPrivateKey" class="configured-tip">已配置（留空表示不修改）</span>
        </el-form-item>
      </el-card>

      <div class="footer-actions">
        <el-button type="primary" :loading="submitting" @click="handleSave">保存配置</el-button>
      </div>
    </el-form>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import { CreditCard, Wallet } from '@element-plus/icons-vue';
import { getMyMerchant, updatePaymentConfig } from '@/api/merchant';
import {
  getStoreDropdown,
  getStorePaymentConfig,
  updateStorePaymentConfig,
} from '@/api/store';

/** 私密字段集合：加载时如有值则置空并标记“已配置”，提交时仅发送非空值。
 *  字段名与后端实体/DTO 完全一致，避免历史 fieldMap 自映射导致的 forbidNonWhitelisted 报错。 */
const SECRET_FIELDS = [
  'alipayPrivateKey',
  'alipayPublicKey',
  'wechatApiV3Key',
  'wechatPrivateKey',
] as const;

type SecretField = (typeof SECRET_FIELDS)[number];

interface PaymentForm {
  useIndependentPayment: boolean;
  alipayAppId: string;
  alipayPrivateKey: string;
  alipayPublicKey: string;
  alipaySandbox: boolean;
  wechatMchId: string;
  wechatAppId: string;
  wechatApiV3Key: string;
  wechatMchSerialNo: string;
  wechatPrivateKey: string;
  wechatSandbox: boolean;
}

const SCOPE_PLACEHOLDER = '******已配置******';

const loading = ref(false);
const submitting = ref(false);
const formRef = ref<FormInstance>();

/** 配置对象：merchant=商户默认；store=指定门店 */
const scope = ref<'merchant' | 'store'>('merchant');
const storeId = ref('');
const storeOptions = ref<{ id: string; name: string; storeNo: string }[]>([]);

const form = reactive<PaymentForm>({
  useIndependentPayment: false,
  alipayAppId: '',
  alipayPrivateKey: '',
  alipayPublicKey: '',
  alipaySandbox: false,
  wechatMchId: '',
  wechatAppId: '',
  wechatApiV3Key: '',
  wechatMchSerialNo: '',
  wechatPrivateKey: '',
  wechatSandbox: false,
});

/** 标记哪些私密字段后端已配置过 */
const configuredFlags = reactive<Record<SecretField, boolean>>({
  alipayPrivateKey: false,
  alipayPublicKey: false,
  wechatApiV3Key: false,
  wechatPrivateKey: false,
});

const rules: FormRules = {
  alipayAppId: [{ required: true, message: '请输入支付宝 APPID', trigger: 'blur' }],
  wechatMchId: [{ required: true, message: '请输入微信支付商户号', trigger: 'blur' }],
  wechatAppId: [{ required: true, message: '请输入 AppID', trigger: 'blur' }],
};

function secretPlaceholder(field: SecretField): string {
  return configuredFlags[field] ? SCOPE_PLACEHOLDER : '请输入';
}

function resetForm() {
  form.useIndependentPayment = false;
  form.alipayAppId = '';
  form.alipayPrivateKey = '';
  form.alipayPublicKey = '';
  form.alipaySandbox = false;
  form.wechatMchId = '';
  form.wechatAppId = '';
  form.wechatApiV3Key = '';
  form.wechatMchSerialNo = '';
  form.wechatPrivateKey = '';
  form.wechatSandbox = false;
  (Object.keys(configuredFlags) as SecretField[]).forEach((k) => (configuredFlags[k] = false));
}

/** 将后端返回的配置填充到表单（私密字段脱敏处理） */
function fillForm(config: any) {
  resetForm();
  if (!config) return;

  // 非私密字段直接回显
  form.useIndependentPayment = !!config.useIndependentPayment;
  form.alipayAppId = config.alipayAppId || '';
  form.alipaySandbox = !!config.alipaySandbox;
  form.wechatMchId = config.wechatMchId || '';
  form.wechatAppId = config.wechatAppId || '';
  form.wechatMchSerialNo = config.wechatMchSerialNo || '';
  form.wechatSandbox = !!config.wechatSandbox;

  // 私密字段：后端返回占位符表示已配置，前端置空不回显明文
  SECRET_FIELDS.forEach((field) => {
    const v = config[field];
    if (v && String(v).includes('已配置')) {
      configuredFlags[field] = true;
      (form as any)[field] = '';
    } else if (v) {
      configuredFlags[field] = true;
      (form as any)[field] = v;
    } else {
      configuredFlags[field] = false;
      (form as any)[field] = '';
    }
  });
}

async function loadConfig() {
  if (scope.value === 'store' && !storeId.value) {
    resetForm();
    return;
  }
  loading.value = true;
  try {
    let config: any;
    if (scope.value === 'merchant') {
      const res: any = await getMyMerchant();
      config = res?.paymentConfig || res;
    } else {
      config = await getStorePaymentConfig(storeId.value);
    }
    fillForm(config);
  } catch {
    // 错误已由拦截器提示
  } finally {
    loading.value = false;
  }
}

async function onScopeChange() {
  resetForm();
  if (scope.value === 'store') {
    // 首次切到门店时加载门店下拉
    if (storeOptions.value.length === 0) {
      try {
        const list: any = await getStoreDropdown();
        storeOptions.value = (list || []).map((s: any) => ({
          id: s.id,
          name: s.name,
          storeNo: s.storeNo,
        }));
      } catch {
        // ignore
      }
    }
    if (storeOptions.value.length > 0 && !storeId.value) {
      storeId.value = storeOptions.value[0].id;
    }
    await loadConfig();
  } else {
    await loadConfig();
  }
}

async function handleSave() {
  // 门店模式下需选中门店
  if (scope.value === 'store' && !storeId.value) {
    ElMessage.warning('请先选择门店');
    return;
  }
  try {
    await formRef.value?.validate();
  } catch {
    return;
  }

  submitting.value = true;
  try {
    const payload: any = {
      alipayAppId: form.alipayAppId,
      alipaySandbox: form.alipaySandbox,
      wechatMchId: form.wechatMchId,
      wechatAppId: form.wechatAppId,
      wechatMchSerialNo: form.wechatMchSerialNo,
      wechatSandbox: form.wechatSandbox,
    };

    // 门店模式额外带 useIndependentPayment 开关；商户模式无此字段
    if (scope.value === 'store') {
      payload.useIndependentPayment = form.useIndependentPayment;
    }

    // 私密字段：仅当用户填写了新值才提交，留空表示不修改
    SECRET_FIELDS.forEach((field) => {
      const value = (form as any)[field];
      if (value) payload[field] = value;
    });

    if (scope.value === 'merchant') {
      await updatePaymentConfig(payload);
    } else {
      await updateStorePaymentConfig(storeId.value, payload);
    }
    ElMessage.success('保存成功');
    await loadConfig();
  } finally {
    submitting.value = false;
  }
}

onMounted(() => {
  loadConfig();
});
</script>

<style lang="scss" scoped>
.payment-config-page {
  padding: 16px;

  .security-alert {
    margin-bottom: 12px;
  }

  .scope-card {
    margin-bottom: 12px;

    .store-picker {
      display: flex;
      align-items: center;
      gap: 16px;
      margin-top: 14px;
    }

    .independent-switch {
      margin-left: 4px;
    }

    .scope-hint {
      margin-top: 10px;
      font-size: 12px;
      color: #909399;
    }
  }

  .config-card {
    margin-bottom: 12px;

    .card-title {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 15px;
      font-weight: 600;
      color: #303133;
    }

    .configured-tip {
      display: inline-block;
      margin-top: 4px;
      font-size: 12px;
      color: #67c23a;
    }
  }

  .footer-actions {
    display: flex;
    justify-content: center;
    padding: 8px 0;
  }
}
</style>

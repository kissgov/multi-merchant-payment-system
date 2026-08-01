<template>
  <div class="payment-config-page">
    <el-alert
      class="security-alert"
      title="请妥善保管支付密钥，泄露可能导致资金风险"
      type="warning"
      :closable="false"
      show-icon
    />

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
        <el-form-item label="应用私钥" prop="alipayAppPrivateKey">
          <el-input
            v-model="form.alipayAppPrivateKey"
            type="textarea"
            :rows="4"
            :placeholder="secretPlaceholder('alipayAppPrivateKey')"
            resize="vertical"
          />
          <span v-if="configuredFlags.alipayAppPrivateKey" class="configured-tip">已配置（留空表示不修改）</span>
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
            <el-form-item label="商户号" prop="wxMchId">
              <el-input v-model="form.wxMchId" placeholder="请输入微信支付商户号" maxlength="32" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="AppID" prop="wxAppId">
              <el-input v-model="form.wxAppId" placeholder="请输入关联的 AppID" maxlength="32" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="商户证书序列号" prop="wxCertSerialNo">
              <el-input v-model="form.wxCertSerialNo" placeholder="请输入商户证书序列号" maxlength="64" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="沙箱环境">
              <el-switch v-model="form.wxSandbox" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="API V3 密钥" prop="wxApiV3Key">
          <el-input
            v-model="form.wxApiV3Key"
            type="textarea"
            :rows="3"
            :placeholder="secretPlaceholder('wxApiV3Key')"
            resize="vertical"
          />
          <span v-if="configuredFlags.wxApiV3Key" class="configured-tip">已配置（留空表示不修改）</span>
        </el-form-item>
        <el-form-item label="商户私钥" prop="wxMchPrivateKey">
          <el-input
            v-model="form.wxMchPrivateKey"
            type="textarea"
            :rows="6"
            :placeholder="secretPlaceholder('wxMchPrivateKey') + '（PEM 格式）'"
            resize="vertical"
          />
          <span v-if="configuredFlags.wxMchPrivateKey" class="configured-tip">已配置（留空表示不修改）</span>
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

/** 私密字段集合：加载时如有值则置空并标记“已配置”，提交时仅发送非空值 */
const SECRET_FIELDS = [
  'alipayAppPrivateKey',
  'alipayPublicKey',
  'wxApiV3Key',
  'wxMchPrivateKey',
] as const;

type SecretField = (typeof SECRET_FIELDS)[number];

interface PaymentForm {
  alipayAppId: string;
  alipayAppPrivateKey: string;
  alipayPublicKey: string;
  alipaySandbox: boolean;
  wxMchId: string;
  wxAppId: string;
  wxApiV3Key: string;
  wxCertSerialNo: string;
  wxMchPrivateKey: string;
  wxSandbox: boolean;
}

const loading = ref(false);
const submitting = ref(false);
const formRef = ref<FormInstance>();

const form = reactive<PaymentForm>({
  alipayAppId: '',
  alipayAppPrivateKey: '',
  alipayPublicKey: '',
  alipaySandbox: false,
  wxMchId: '',
  wxAppId: '',
  wxApiV3Key: '',
  wxCertSerialNo: '',
  wxMchPrivateKey: '',
  wxSandbox: false,
});

/** 标记哪些私密字段后端已配置过 */
const configuredFlags = reactive<Record<SecretField, boolean>>({
  alipayAppPrivateKey: false,
  alipayPublicKey: false,
  wxApiV3Key: false,
  wxMchPrivateKey: false,
});

const rules: FormRules = {
  alipayAppId: [{ required: true, message: '请输入支付宝 APPID', trigger: 'blur' }],
  wxMchId: [{ required: true, message: '请输入微信支付商户号', trigger: 'blur' }],
  wxAppId: [{ required: true, message: '请输入 AppID', trigger: 'blur' }],
};

const SECRET_PLACEHOLDER = '******已配置******';

function secretPlaceholder(field: SecretField): string {
  return configuredFlags[field] ? SECRET_PLACEHOLDER : '请输入';
}

/** 将后端字段名映射到表单字段 */
const fieldMap: Record<string, keyof PaymentForm> = {
  alipayAppId: 'alipayAppId',
  alipayAppPrivateKey: 'alipayAppPrivateKey',
  alipayPublicKey: 'alipayPublicKey',
  alipaySandbox: 'alipaySandbox',
  wxMchId: 'wxMchId',
  wxAppId: 'wxAppId',
  wxApiV3Key: 'wxApiV3Key',
  wxCertSerialNo: 'wxCertSerialNo',
  wxMchPrivateKey: 'wxMchPrivateKey',
  wxSandbox: 'wxSandbox',
};

async function loadConfig() {
  loading.value = true;
  try {
    const res: any = await getMyMerchant();
    const config = res?.paymentConfig || res || {};
    Object.keys(fieldMap).forEach((backendKey) => {
      const formKey = fieldMap[backendKey];
      const value = config[backendKey];
      if (value === undefined || value === null) return;
      if ((SECRET_FIELDS as readonly string[]).includes(formKey)) {
        configuredFlags[formKey as SecretField] = !!value;
        // 私密字段不回显明文
        (form as any)[formKey] = '';
      } else {
        (form as any)[formKey] = value;
      }
    });
  } catch {
    // 错误已由拦截器提示
  } finally {
    loading.value = false;
  }
}

async function handleSave() {
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
      wxMchId: form.wxMchId,
      wxAppId: form.wxAppId,
      wxCertSerialNo: form.wxCertSerialNo,
      wxSandbox: form.wxSandbox,
    };
    // 私密字段：仅当用户填写了新值才提交，留空表示不修改
    SECRET_FIELDS.forEach((field) => {
      const value = (form as any)[field];
      if (value) payload[field] = value;
    });

    await updatePaymentConfig(payload);
    ElMessage.success('保存成功');
    loadConfig();
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

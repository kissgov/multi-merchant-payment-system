<template>
  <div class="profile-page">
    <!-- 用户信息卡片 -->
    <el-card class="user-card" shadow="never">
      <div class="user-info">
        <el-avatar :size="72" :src="user.avatar">
          {{ user.name ? user.name.charAt(0) : 'U' }}
        </el-avatar>
        <div class="user-meta">
          <div class="user-name">{{ user.name || '-' }}</div>
          <div class="user-desc">
            <span class="meta-item">工号：{{ user.employeeNo || '-' }}</span>
            <el-divider direction="vertical" />
            <span class="meta-item">角色：{{ roleLabel }}</span>
            <el-divider direction="vertical" />
            <span class="meta-item">商户：{{ user.merchantId || '-' }}</span>
            <el-divider direction="vertical" />
            <span class="meta-item">门店：{{ user.storeId || '-' }}</span>
          </div>
        </div>
      </div>
    </el-card>

    <!-- 修改密码 -->
    <el-card class="pwd-card" shadow="never">
      <template #header>
        <span class="card-title">修改密码</span>
      </template>
      <el-form ref="formRef" :model="form" :rules="rules" label-width="110px" class="pwd-form">
        <el-form-item label="原密码" prop="oldPassword">
          <el-input v-model="form.oldPassword" type="password" show-password placeholder="请输入原密码" style="width: 360px" />
        </el-form-item>
        <el-form-item label="新密码" prop="newPassword">
          <el-input v-model="form.newPassword" type="password" show-password placeholder="请输入新密码（至少6位）" style="width: 360px" />
        </el-form-item>
        <el-form-item label="确认新密码" prop="confirmPassword">
          <el-input v-model="form.confirmPassword" type="password" show-password placeholder="请再次输入新密码" style="width: 360px" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="submitting" @click="handleSubmit">保存</el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import { useUserStore } from '@/stores/user';
import { changePassword } from '@/api/auth';

const userStore = useUserStore();
const user = computed(() => userStore.userInfo || {});

const roleLabel = computed(() => {
  const roleMap: Record<string, string> = {
    super_admin: '超级管理员',
    merchant_owner: '商户主理人',
    merchant_admin: '商户管理员',
    store_manager: '门店店长',
    cashier: '收银员',
  };
  const role = user.value?.role;
  return roleMap[role] || role || '-';
});

const submitting = ref(false);
const formRef = ref<FormInstance>();

const form = reactive({
  oldPassword: '',
  newPassword: '',
  confirmPassword: '',
});

const rules: FormRules = {
  oldPassword: [{ required: true, message: '请输入原密码', trigger: 'blur' }],
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 6, message: '新密码至少 6 位', trigger: 'blur' },
  ],
  confirmPassword: [
    { required: true, message: '请再次输入新密码', trigger: 'blur' },
    {
      validator: (_rule, value, callback) => {
        if (value !== form.newPassword) {
          callback(new Error('两次输入的密码不一致'));
        } else {
          callback();
        }
      },
      trigger: 'blur',
    },
  ],
};

function handleReset() {
  form.oldPassword = '';
  form.newPassword = '';
  form.confirmPassword = '';
  formRef.value?.clearValidate();
}

async function handleSubmit() {
  try {
    await formRef.value?.validate();
  } catch {
    return;
  }

  submitting.value = true;
  try {
    await changePassword(form.oldPassword, form.newPassword);
    ElMessage.success('密码修改成功');
    handleReset();
  } finally {
    submitting.value = false;
  }
}
</script>

<style lang="scss" scoped>
.profile-page {
  padding: 16px;

  .user-card {
    margin-bottom: 12px;

    .user-info {
      display: flex;
      align-items: center;
      gap: 20px;

      .user-meta {
        .user-name {
          font-size: 18px;
          font-weight: 600;
          color: #303133;
        }

        .user-desc {
          margin-top: 8px;
          font-size: 13px;
          color: #606266;

          .meta-item {
            white-space: nowrap;
          }
        }
      }
    }
  }

  .pwd-card {
    .card-title {
      font-size: 16px;
      font-weight: 600;
      color: #303133;
    }

    .pwd-form {
      max-width: 540px;
      margin-top: 8px;
    }
  }
}
</style>

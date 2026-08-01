<template>
  <div class="login-container">
    <div class="login-bg" />

    <div class="login-card">
      <!-- 左侧品牌信息 -->
      <div class="brand-panel">
        <div class="brand-content">
          <div class="brand-logo">
            <el-icon :size="44"><Wallet /></el-icon>
          </div>
          <h1 class="brand-title">支付管理后台</h1>
          <p class="brand-desc">
            多商户移动支付收款一体化管理平台，提供收款、退款、对账、报表等全流程管理能力，助力商户高效运营。
          </p>
          <ul class="brand-features">
            <li><el-icon><Check /></el-icon> 实时收款数据大屏</li>
            <li><el-icon><Check /></el-icon> 多门店多收银员协同管理</li>
            <li><el-icon><Check /></el-icon> 智能对账与财务报表</li>
          </ul>
        </div>
      </div>

      <!-- 右侧登录表单 -->
      <div class="form-panel">
        <div class="form-wrapper">
          <h2 class="form-title">欢迎登录</h2>
          <p class="form-subtitle">请输入您的账号密码</p>

          <el-form
            ref="formRef"
            :model="form"
            :rules="rules"
            size="large"
            @keyup.enter="handleLogin"
          >
            <el-form-item prop="username">
              <el-input
                v-model="form.username"
                placeholder="请输入用户名"
                :prefix-icon="User"
                clearable
                autocomplete="username"
              />
            </el-form-item>

            <el-form-item prop="password">
              <el-input
                v-model="form.password"
                type="password"
                placeholder="请输入密码"
                :prefix-icon="Lock"
                show-password
                autocomplete="current-password"
              />
            </el-form-item>

            <el-form-item>
              <el-button
                type="primary"
                class="login-btn"
                :loading="loading"
                @click="handleLogin"
              >
                登 录
              </el-button>
            </el-form-item>
          </el-form>
        </div>
      </div>
    </div>

    <!-- 底部版权 -->
    <div class="footer">© 2026 多商户支付管理系统</div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import { User, Lock, Wallet, Check } from '@element-plus/icons-vue';
import { useUserStore } from '@/stores/user';

const router = useRouter();
const route = useRoute();
const userStore = useUserStore();

const formRef = ref<FormInstance>();
const loading = ref(false);

const form = reactive({
  username: '',
  password: '',
});

const rules: FormRules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { min: 2, max: 30, message: '用户名长度为 2-30 个字符', trigger: 'blur' },
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, max: 30, message: '密码长度为 6-30 个字符', trigger: 'blur' },
  ],
};

async function handleLogin() {
  if (!formRef.value) return;
  await formRef.value.validate(async (valid) => {
    if (!valid) return;
    loading.value = true;
    try {
      await userStore.login({ username: form.username, password: form.password });
      ElMessage.success('登录成功');
      const redirect = (route.query.redirect as string) || '/';
      router.push(redirect);
    } catch {
      // 错误信息由 request 拦截器统一提示
    } finally {
      loading.value = false;
    }
  });
}
</script>

<style lang="scss" scoped>
.login-container {
  position: relative;
  width: 100%;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: linear-gradient(135deg, #1e3c72 0%, #2a5298 50%, #4facfe 100%);
}

.login-bg {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at 20% 30%, rgba(255, 255, 255, 0.1) 0%, transparent 40%),
    radial-gradient(circle at 80% 70%, rgba(255, 255, 255, 0.08) 0%, transparent 40%);
  pointer-events: none;
}

.login-card {
  position: relative;
  z-index: 1;
  display: flex;
  width: 880px;
  max-width: 92%;
  min-height: 480px;
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  overflow: hidden;
}

.brand-panel {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
  background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
  color: #fff;

  .brand-content {
    max-width: 320px;

    .brand-logo {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 80px;
      height: 80px;
      margin: 0 auto 24px;
      border-radius: 20px;
      background: rgba(255, 255, 255, 0.15);
    }

    .brand-title {
      margin: 0 0 16px;
      font-size: 28px;
      font-weight: 600;
      text-align: center;
    }

    .brand-desc {
      margin: 0 0 28px;
      font-size: 14px;
      line-height: 1.8;
      color: rgba(255, 255, 255, 0.85);
    }

    .brand-features {
      list-style: none;
      margin: 0;
      padding: 0;

      li {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 12px;
        font-size: 14px;
        color: rgba(255, 255, 255, 0.9);

        .el-icon {
          color: #67c23a;
          font-size: 16px;
        }
      }
    }
  }
}

.form-panel {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;

  .form-wrapper {
    width: 100%;
    max-width: 320px;

    .form-title {
      margin: 0 0 8px;
      font-size: 24px;
      font-weight: 600;
      color: #303133;
    }

    .form-subtitle {
      margin: 0 0 32px;
      font-size: 14px;
      color: #909399;
    }

    .login-btn {
      width: 100%;
      letter-spacing: 4px;
    }
  }
}

.footer {
  position: absolute;
  bottom: 16px;
  left: 0;
  right: 0;
  text-align: center;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.75);
  z-index: 1;
}
</style>

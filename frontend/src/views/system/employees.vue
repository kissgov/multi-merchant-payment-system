<template>
  <div class="employees-page">
    <!-- 顶部筛选 -->
    <el-card class="filter-card" shadow="never">
      <el-form :model="filter" inline @submit.prevent>
        <el-form-item label="关键字">
          <el-input v-model="filter.keyword" placeholder="姓名/工号/手机" clearable style="width: 200px" @keyup.enter="handleSearch" />
        </el-form-item>
        <el-form-item label="角色">
          <el-select v-model="filter.role" placeholder="全部" clearable style="width: 160px">
            <el-option v-for="item in roleOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="filter.status" placeholder="全部" clearable style="width: 130px">
            <el-option v-for="item in statusOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="门店">
          <el-select v-model="filter.storeId" placeholder="全部" clearable filterable style="width: 180px">
            <el-option v-for="item in storeOptions" :key="item.id" :label="item.name" :value="item.id" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :icon="Search" @click="handleSearch">查询</el-button>
          <el-button :icon="Refresh" @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 列表 -->
    <el-card class="table-card" shadow="never">
      <div class="card-header">
        <span class="title">员工管理</span>
        <el-button v-hasPermi="'employee:create'" type="primary" :icon="Plus" @click="openCreate">
          新增员工
        </el-button>
      </div>

      <el-table v-loading="loading" :data="tableData" border stripe style="width: 100%">
        <el-table-column prop="employeeNo" label="工号" width="120" show-overflow-tooltip />
        <el-table-column prop="name" label="姓名" width="110" show-overflow-tooltip />
        <el-table-column prop="phone" label="手机" width="130" show-overflow-tooltip>
          <template #default="{ row }">{{ row.phone || '-' }}</template>
        </el-table-column>
        <el-table-column prop="role" label="角色" width="120" align="center">
          <template #default="{ row }">
            <el-tag :type="roleTagType(row.role)" size="small">{{ roleLabel(row.role) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="storeName" label="所属门店" min-width="140" show-overflow-tooltip>
          <template #default="{ row }">{{ row.storeName || '-' }}</template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="90" align="center">
          <template #default="{ row }">
            <el-tag :type="statusTagType(row.status)" size="small">{{ statusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="canAcceptPayment" label="收款权限" width="90" align="center">
          <template #default="{ row }">
            <el-tag :type="row.canAcceptPayment ? 'success' : 'info'" size="small">
              {{ row.canAcceptPayment ? '有' : '无' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="canRefund" label="退款权限" width="90" align="center">
          <template #default="{ row }">
            <el-tag :type="row.canRefund ? 'success' : 'info'" size="small">
              {{ row.canRefund ? '有' : '无' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="lastLoginAt" label="最后登录" width="170">
          <template #default="{ row }">{{ formatTime(row.lastLoginAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="220" fixed="right" align="center">
          <template #default="{ row }">
            <el-button link type="primary" :icon="Edit" @click="openEdit(row as EmployeeItem)">编辑</el-button>
            <el-button link type="warning" :icon="Key" @click="openResetPwd(row as EmployeeItem)">重置密码</el-button>
            <el-button
              link
              :type="row.status === 'active' ? 'danger' : 'success'"
              :icon="row.status === 'active' ? CircleClose : CircleCheck"
              @click="handleToggleStatus(row as EmployeeItem)"
            >
              {{ row.status === 'active' ? '禁用' : '启用' }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination-wrap">
        <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.pageSize"
          :total="pagination.total"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next, jumper"
          background
          @size-change="fetchList"
          @current-change="fetchList"
        />
      </div>
    </el-card>

    <!-- 新增/编辑弹窗 -->
    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? '编辑员工' : '新增员工'"
      width="680px"
      :close-on-click-modal="false"
      destroy-on-close
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="110px">
        <el-divider content-position="left">账号信息</el-divider>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="姓名" prop="name">
              <el-input v-model="form.name" placeholder="请输入姓名" maxlength="20" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="登录账号" prop="username">
              <el-input v-model="form.username" placeholder="请输入登录账号" maxlength="30" :disabled="isEdit" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="密码" :prop="isEdit ? undefined : 'password'">
              <el-input
                v-model="form.password"
                type="password"
                show-password
                :placeholder="isEdit ? '留空则不修改' : '请输入密码'"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="手机" prop="phone">
              <el-input v-model="form.phone" placeholder="请输入手机号" maxlength="11" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-divider content-position="left">角色与门店</el-divider>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="角色" prop="role">
              <el-select v-model="form.role" placeholder="请选择角色" style="width: 100%">
                <el-option v-for="item in roleOptions" :key="item.value" :label="item.label" :value="item.value" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="所属门店" prop="storeId">
              <el-select
                v-model="form.storeId"
                placeholder="请选择门店"
                filterable
                clearable
                style="width: 100%"
              >
                <el-option v-for="item in storeOptions" :key="item.id" :label="item.name" :value="item.id" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <el-divider content-position="left">收款与退款权限</el-divider>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="收款权限">
              <el-switch v-model="form.canAcceptPayment" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="单笔收款限额" prop="singlePaymentLimit">
              <el-input-number
                v-model="form.singlePaymentLimit"
                :min="0"
                :precision="2"
                :controls="false"
                placeholder="不限填 0"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="每日收款限额" prop="dailyPaymentLimit">
              <el-input-number
                v-model="form.dailyPaymentLimit"
                :min="0"
                :precision="2"
                :controls="false"
                placeholder="不限填 0"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="退款权限">
              <el-switch v-model="form.canRefund" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="单笔退款限额" prop="singleRefundLimit">
              <el-input-number
                v-model="form.singleRefundLimit"
                :min="0"
                :precision="2"
                :controls="false"
                placeholder="不限填 0"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-divider content-position="left">其他</el-divider>
        <el-form-item label="备注" prop="remark">
          <el-input v-model="form.remark" type="textarea" :rows="2" maxlength="200" show-word-limit placeholder="请输入备注" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmit">保存</el-button>
      </template>
    </el-dialog>

    <!-- 重置密码弹窗 -->
    <el-dialog v-model="resetPwdVisible" title="重置密码" width="420px" :close-on-click-modal="false" destroy-on-close>
      <el-form ref="resetPwdFormRef" :model="resetPwdForm" :rules="resetPwdRules" label-width="90px">
        <el-form-item label="员工">
          <span>{{ resetPwdForm.employeeName }}</span>
        </el-form-item>
        <el-form-item label="新密码" prop="newPassword">
          <el-input v-model="resetPwdForm.newPassword" type="password" show-password placeholder="请输入新密码" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="resetPwdVisible = false">取消</el-button>
        <el-button type="primary" :loading="resetPwdSubmitting" @click="handleResetPwd">确认重置</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import {
  Search,
  Refresh,
  Plus,
  Edit,
  Key,
  CircleClose,
  CircleCheck,
} from '@element-plus/icons-vue';
import dayjs from 'dayjs';
import {
  getEmployeeList,
  createEmployee,
  updateEmployee,
  resetPassword,
  toggleEmployeeStatus,
} from '@/api/employee';
import { getStoreDropdown } from '@/api/store';

interface EmployeeItem {
  id: string;
  employeeNo: string;
  name: string;
  username: string;
  phone?: string;
  role: string;
  storeId?: string;
  storeName?: string;
  status: 'active' | 'disabled' | 'locked';
  canAcceptPayment: boolean;
  canRefund: boolean;
  singlePaymentLimit?: number;
  dailyPaymentLimit?: number;
  singleRefundLimit?: number;
  lastLoginAt?: string;
  remark?: string;
}

interface StoreOption {
  id: string;
  name: string;
}

const roleOptions = [
  { value: 'super_admin', label: '超级管理员' },
  { value: 'merchant_owner', label: '商户主理人' },
  { value: 'merchant_admin', label: '商户管理员' },
  { value: 'store_manager', label: '门店店长' },
  { value: 'cashier', label: '收银员' },
];

const roleMap: Record<string, string> = roleOptions.reduce(
  (acc, cur) => ((acc[cur.value] = cur.label), acc),
  {} as Record<string, string>,
);

const roleTagMap: Record<string, 'danger' | 'warning' | 'primary' | 'success' | 'info'> = {
  super_admin: 'danger',
  merchant_owner: 'warning',
  merchant_admin: 'primary',
  store_manager: 'success',
  cashier: 'info',
};

const statusOptions = [
  { value: 'active', label: '在职' },
  { value: 'disabled', label: '禁用' },
  { value: 'locked', label: '锁定' },
];

const statusMap: Record<string, { label: string; type: 'success' | 'info' | 'danger' }> = {
  active: { label: '在职', type: 'success' },
  disabled: { label: '禁用', type: 'info' },
  locked: { label: '锁定', type: 'danger' },
};

const roleLabel = (r: string) => roleMap[r] || r;
const roleTagType = (r: string) => roleTagMap[r] || 'info';
const statusLabel = (s: string) => statusMap[s]?.label || s;
const statusTagType = (s: string) => statusMap[s]?.type || 'info';
const formatTime = (t?: string) => (t ? dayjs(t).format('YYYY-MM-DD HH:mm:ss') : '-');

// 筛选
const filter = reactive({
  keyword: '',
  role: '',
  status: '',
  storeId: '',
});

const loading = ref(false);
const tableData = ref<EmployeeItem[]>([]);
const storeOptions = ref<StoreOption[]>([]);

const pagination = reactive({
  page: 1,
  pageSize: 20,
  total: 0,
});

async function loadStoreOptions() {
  try {
    const res: any = await getStoreDropdown();
    storeOptions.value = Array.isArray(res) ? res : res?.list || [];
  } catch {
    storeOptions.value = [];
  }
}

async function fetchList() {
  loading.value = true;
  try {
    const res: any = await getEmployeeList({
      page: pagination.page,
      pageSize: pagination.pageSize,
      keyword: filter.keyword || undefined,
      role: filter.role || undefined,
      status: filter.status || undefined,
      storeId: filter.storeId || undefined,
    });
    tableData.value = res?.list || [];
    pagination.total = res?.total || 0;
  } catch {
    tableData.value = [];
    pagination.total = 0;
  } finally {
    loading.value = false;
  }
}

function handleSearch() {
  pagination.page = 1;
  fetchList();
}

function handleReset() {
  filter.keyword = '';
  filter.role = '';
  filter.status = '';
  filter.storeId = '';
  pagination.page = 1;
  fetchList();
}

// 新增/编辑
const dialogVisible = ref(false);
const isEdit = ref(false);
const submitting = ref(false);
const formRef = ref<FormInstance>();

const defaultForm = () => ({
  id: '',
  name: '',
  username: '',
  password: '',
  phone: '',
  role: 'cashier',
  storeId: '',
  canAcceptPayment: false,
  singlePaymentLimit: 0,
  dailyPaymentLimit: 0,
  canRefund: false,
  singleRefundLimit: 0,
  remark: '',
});

const form = reactive(defaultForm());

const rules: FormRules = {
  name: [{ required: true, message: '请输入姓名', trigger: 'blur' }],
  username: [{ required: true, message: '请输入登录账号', trigger: 'blur' }],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, message: '密码至少 6 位', trigger: 'blur' },
  ],
  phone: [{ pattern: /^1\d{10}$/, message: '请输入正确的手机号', trigger: 'blur' }],
  role: [{ required: true, message: '请选择角色', trigger: 'change' }],
  storeId: [
    {
      validator: (_rule, value, callback) => {
        if ((form.role === 'store_manager' || form.role === 'cashier') && !value) {
          callback(new Error('该角色必须选择所属门店'));
        } else {
          callback();
        }
      },
      trigger: 'change',
    },
  ],
};

function resetForm() {
  Object.assign(form, defaultForm());
  formRef.value?.clearValidate();
}

function openCreate() {
  isEdit.value = false;
  resetForm();
  dialogVisible.value = true;
}

function openEdit(row: EmployeeItem) {
  isEdit.value = true;
  resetForm();
  Object.assign(form, {
    id: row.id,
    name: row.name,
    username: row.username,
    password: '',
    phone: row.phone || '',
    role: row.role,
    storeId: row.storeId || '',
    canAcceptPayment: !!row.canAcceptPayment,
    singlePaymentLimit: row.singlePaymentLimit ?? 0,
    dailyPaymentLimit: row.dailyPaymentLimit ?? 0,
    canRefund: !!row.canRefund,
    singleRefundLimit: row.singleRefundLimit ?? 0,
    remark: row.remark || '',
  });
  dialogVisible.value = true;
}

async function handleSubmit() {
  try {
    await formRef.value?.validate();
  } catch {
    return;
  }

  submitting.value = true;
  try {
    const payload: any = {
      name: form.name,
      username: form.username,
      phone: form.phone || undefined,
      role: form.role,
      storeId: form.storeId || undefined,
      canAcceptPayment: form.canAcceptPayment,
      singlePaymentLimit: form.singlePaymentLimit,
      dailyPaymentLimit: form.dailyPaymentLimit,
      canRefund: form.canRefund,
      singleRefundLimit: form.singleRefundLimit,
      remark: form.remark || undefined,
    };

    if (isEdit.value) {
      if (form.password) payload.password = form.password;
      await updateEmployee(form.id, payload);
      ElMessage.success('更新成功');
    } else {
      payload.password = form.password;
      await createEmployee(payload);
      ElMessage.success('创建成功');
    }
    dialogVisible.value = false;
    fetchList();
  } finally {
    submitting.value = false;
  }
}

// 启用/禁用
async function handleToggleStatus(row: EmployeeItem) {
  const next = row.status === 'active' ? 'disabled' : 'active';
  const action = next === 'active' ? '启用' : '禁用';
  try {
    await ElMessageBox.confirm(`确认${action}员工「${row.name}」？`, '提示', { type: 'warning' });
  } catch {
    return;
  }
  try {
    await toggleEmployeeStatus(row.id, next);
    row.status = next;
    ElMessage.success(`已${action}`);
  } catch {
    // 错误已由拦截器提示
  }
}

// 重置密码
const resetPwdVisible = ref(false);
const resetPwdSubmitting = ref(false);
const resetPwdFormRef = ref<FormInstance>();
const resetPwdForm = reactive({ id: '', employeeName: '', newPassword: '' });

const resetPwdRules: FormRules = {
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 6, message: '密码至少 6 位', trigger: 'blur' },
  ],
};

function openResetPwd(row: EmployeeItem) {
  resetPwdForm.id = row.id;
  resetPwdForm.employeeName = `${row.name}（${row.employeeNo}）`;
  resetPwdForm.newPassword = '';
  resetPwdVisible.value = true;
}

async function handleResetPwd() {
  try {
    await resetPwdFormRef.value?.validate();
  } catch {
    return;
  }
  resetPwdSubmitting.value = true;
  try {
    await resetPassword(resetPwdForm.id, resetPwdForm.newPassword);
    ElMessage.success('密码已重置');
    resetPwdVisible.value = false;
  } finally {
    resetPwdSubmitting.value = false;
  }
}

onMounted(() => {
  loadStoreOptions();
  fetchList();
});
</script>

<style lang="scss" scoped>
.employees-page {
  padding: 16px;

  .filter-card {
    margin-bottom: 12px;

    :deep(.el-card__body) {
      padding-bottom: 2px;
    }
  }

  .table-card {
    .card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16px;

      .title {
        font-size: 16px;
        font-weight: 600;
        color: #303133;
      }
    }

    .pagination-wrap {
      display: flex;
      justify-content: flex-end;
      margin-top: 16px;
    }
  }
}
</style>

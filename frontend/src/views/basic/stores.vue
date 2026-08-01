<template>
  <div class="stores-page">
    <!-- 顶部筛选 -->
    <el-card class="filter-card" shadow="never">
      <el-form :model="filter" inline @submit.prevent>
        <el-form-item label="关键字">
          <el-input
            v-model="filter.keyword"
            placeholder="门店名称/编号/地址"
            clearable
            style="width: 220px"
            @keyup.enter="handleSearch"
          />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="filter.status" placeholder="全部" clearable style="width: 140px">
            <el-option v-for="item in statusOptions" :key="item.value" :label="item.label" :value="item.value" />
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
        <span class="title">门店管理</span>
        <el-button v-hasPermi="'store:create'" type="primary" :icon="Plus" @click="openCreate">
          新增门店
        </el-button>
      </div>

      <el-table v-loading="loading" :data="tableData" border stripe style="width: 100%">
        <el-table-column prop="name" label="门店名称" min-width="160" show-overflow-tooltip />
        <el-table-column prop="storeNo" label="门店编号" width="140" show-overflow-tooltip>
          <template #default="{ row }">{{ row.storeNo || '-' }}</template>
        </el-table-column>
        <el-table-column prop="managerName" label="店长" width="110" show-overflow-tooltip>
          <template #default="{ row }">{{ row.managerName || '-' }}</template>
        </el-table-column>
        <el-table-column prop="phone" label="电话" width="130" show-overflow-tooltip>
          <template #default="{ row }">{{ row.phone || '-' }}</template>
        </el-table-column>
        <el-table-column prop="address" label="地址" min-width="200" show-overflow-tooltip>
          <template #default="{ row }">{{ row.address || '-' }}</template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="statusTagType(row.status)" size="small">{{ statusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="创建时间" width="170">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right" align="center">
          <template #default="{ row }">
            <el-button link type="primary" :icon="Edit" @click="openEdit(row as StoreItem)">编辑</el-button>
            <el-button
              link
              :type="row.status === 'active' ? 'warning' : 'success'"
              :icon="row.status === 'active' ? CircleClose : CircleCheck"
              @click="handleToggleStatus(row as StoreItem)"
            >
              {{ nextStatusLabel(row.status) }}
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
      :title="isEdit ? '编辑门店' : '新增门店'"
      width="640px"
      :close-on-click-modal="false"
      destroy-on-close
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item label="门店名称" prop="name">
          <el-input v-model="form.name" placeholder="请输入门店名称" maxlength="50" show-word-limit />
        </el-form-item>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="店长姓名" prop="managerName">
              <el-input v-model="form.managerName" placeholder="请输入店长姓名" maxlength="20" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="店长电话" prop="managerPhone">
              <el-input v-model="form.managerPhone" placeholder="请输入店长电话" maxlength="20" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="门店地址" prop="address">
          <el-input v-model="form.address" placeholder="请输入门店地址" maxlength="200" />
        </el-form-item>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="门店电话" prop="phone">
              <el-input v-model="form.phone" placeholder="请输入门店电话" maxlength="20" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="状态" prop="status">
              <el-select v-model="form.status" placeholder="请选择状态" style="width: 100%">
                <el-option v-for="item in statusOptions" :key="item.value" :label="item.label" :value="item.value" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="经度" prop="longitude">
              <el-input-number
                v-model="form.longitude"
                :controls="false"
                :precision="6"
                :step="0.000001"
                placeholder="经度"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="纬度" prop="latitude">
              <el-input-number
                v-model="form.latitude"
                :controls="false"
                :precision="6"
                :step="0.000001"
                placeholder="纬度"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="备注" prop="remark">
          <el-input
            v-model="form.remark"
            type="textarea"
            :rows="3"
            maxlength="200"
            show-word-limit
            placeholder="请输入备注"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmit">保存</el-button>
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
  CircleClose,
  CircleCheck,
} from '@element-plus/icons-vue';
import dayjs from 'dayjs';
import { getStoreList, createStore, updateStore, updateStoreStatus } from '@/api/store';

interface StoreItem {
  id: string;
  name: string;
  storeNo?: string;
  managerName?: string;
  managerPhone?: string;
  phone?: string;
  address?: string;
  status: 'active' | 'suspended' | 'closed';
  longitude?: number;
  latitude?: number;
  remark?: string;
  createdAt?: string;
}

const statusOptions = [
  { value: 'active', label: '营业中' },
  { value: 'suspended', label: '暂停营业' },
  { value: 'closed', label: '已关闭' },
];

const statusMap: Record<string, { label: string; type: 'success' | 'warning' | 'danger' }> = {
  active: { label: '营业中', type: 'success' },
  suspended: { label: '暂停营业', type: 'warning' },
  closed: { label: '已关闭', type: 'danger' },
};

const statusLabel = (s: string) => statusMap[s]?.label || s;
const statusTagType = (s: string) => statusMap[s]?.type || 'info';
const formatTime = (t?: string) => (t ? dayjs(t).format('YYYY-MM-DD HH:mm:ss') : '-');

/** 状态切换的下一个目标状态：active→suspended，其余→active */
function nextStatus(s: string): 'active' | 'suspended' {
  return s === 'active' ? 'suspended' : 'active';
}
function nextStatusLabel(s: string): string {
  return nextStatus(s) === 'active' ? '启用' : '暂停';
}

// 筛选
const filter = reactive({
  keyword: '',
  status: '',
});

const loading = ref(false);
const tableData = ref<StoreItem[]>([]);
const pagination = reactive({
  page: 1,
  pageSize: 20,
  total: 0,
});

async function fetchList() {
  loading.value = true;
  try {
    const res: any = await getStoreList({
      page: pagination.page,
      pageSize: pagination.pageSize,
      keyword: filter.keyword || undefined,
      status: filter.status || undefined,
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
  filter.status = '';
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
  managerName: '',
  managerPhone: '',
  phone: '',
  address: '',
  status: 'active' as 'active' | 'suspended' | 'closed',
  longitude: undefined as number | undefined,
  latitude: undefined as number | undefined,
  remark: '',
});

const form = reactive(defaultForm());

const rules: FormRules = {
  name: [{ required: true, message: '请输入门店名称', trigger: 'blur' }],
  address: [{ required: true, message: '请输入门店地址', trigger: 'blur' }],
  status: [{ required: true, message: '请选择状态', trigger: 'change' }],
  managerPhone: [{ pattern: /^[\d-+ ]{6,20}$/, message: '请输入正确的电话', trigger: 'blur' }],
  phone: [{ pattern: /^[\d-+ ]{6,20}$/, message: '请输入正确的电话', trigger: 'blur' }],
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

function openEdit(row: StoreItem) {
  isEdit.value = true;
  resetForm();
  Object.assign(form, {
    id: row.id,
    name: row.name,
    managerName: row.managerName || '',
    managerPhone: row.managerPhone || '',
    phone: row.phone || '',
    address: row.address || '',
    status: row.status,
    longitude: row.longitude,
    latitude: row.latitude,
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
      managerName: form.managerName || undefined,
      managerPhone: form.managerPhone || undefined,
      phone: form.phone || undefined,
      address: form.address,
      status: form.status,
      longitude: form.longitude ?? undefined,
      latitude: form.latitude ?? undefined,
      remark: form.remark || undefined,
    };

    if (isEdit.value) {
      await updateStore(form.id, payload);
      ElMessage.success('更新成功');
    } else {
      await createStore(payload);
      ElMessage.success('创建成功');
    }
    dialogVisible.value = false;
    fetchList();
  } finally {
    submitting.value = false;
  }
}

// 状态切换
async function handleToggleStatus(row: StoreItem) {
  const next = nextStatus(row.status);
  const action = next === 'active' ? '启用' : '暂停';
  try {
    await ElMessageBox.confirm(
      `确认${action}门店「${row.name}」？`,
      '提示',
      { type: 'warning' },
    );
  } catch {
    return;
  }
  try {
    await updateStoreStatus(row.id, next);
    row.status = next;
    ElMessage.success(`已${action}`);
  } catch {
    // 错误已由拦截器提示
  }
}

onMounted(() => {
  fetchList();
});
</script>

<style lang="scss" scoped>
.stores-page {
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

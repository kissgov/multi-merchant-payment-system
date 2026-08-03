<template>
  <div class="merchant-list">
    <!-- 顶部筛选栏 -->
    <el-card class="filter-card" shadow="never">
      <el-form :model="filter" inline @submit.prevent>
        <el-form-item label="关键字">
          <el-input
            v-model="filter.keyword"
            placeholder="商户名称/编号/联系人"
            clearable
            style="width: 220px"
            @keyup.enter="handleSearch"
          />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="filter.status" placeholder="全部" clearable style="width: 120px">
            <el-option v-for="item in statusOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="创建日期">
          <el-date-picker
            v-model="filter.dateRange"
            type="daterange"
            value-format="YYYY-MM-DD"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            unlink-panels
            clearable
            style="width: 260px"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :icon="Search" @click="handleSearch">查询</el-button>
          <el-button :icon="Refresh" @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never">
      <template #header>
        <div class="header-bar">
          <span>商户列表</span>
          <el-button v-hasPermi="'merchant:create'" type="primary" :icon="Plus" @click="openCreate">新增商户</el-button>
        </div>
      </template>

      <el-table :data="list" v-loading="loading" border stripe>
        <el-table-column prop="name" label="商户名称" min-width="160" show-overflow-tooltip />
        <el-table-column prop="merchantNo" label="商户编号" width="150" show-overflow-tooltip />
        <el-table-column prop="contactPerson" label="联系人" width="110" show-overflow-tooltip />
        <el-table-column prop="contactPhone" label="联系电话" width="130" show-overflow-tooltip />
        <el-table-column prop="platformFeeRate" label="费率" width="90" align="center">
          <template #default="{ row }">{{ (row.platformFeeRate * 100).toFixed(2) }}%</template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="90" align="center">
          <template #default="{ row }">
            <el-tag :type="row.status === 'active' ? 'success' : 'danger'" size="small">
              {{ row.status === 'active' ? '启用' : '停用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="创建时间" width="170">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="220" fixed="right" align="center">
          <template #default="{ row }">
            <el-button link type="primary" :icon="View" @click="openDetail(row)">详情</el-button>
            <el-button link type="primary" :icon="Edit" @click="openEdit(row)">编辑</el-button>
            <el-button
              link
              :type="row.status === 'active' ? 'warning' : 'success'"
              :icon="row.status === 'active' ? CircleClose : CircleCheck"
              @click="handleToggleStatus(row)"
            >
              {{ row.status === 'active' ? '停用' : '启用' }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        v-if="total > 0"
        class="pagination-wrap"
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[10, 20, 50, 100]"
        layout="total, sizes, prev, pager, next, jumper"
        background
        @size-change="loadData"
        @current-change="loadData"
      />
    </el-card>

    <!-- 新增/编辑弹窗 -->
    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? '编辑商户' : '新增商户'"
      width="560px"
      :close-on-click-modal="false"
      destroy-on-close
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item label="商户名称" prop="name">
          <el-input v-model="form.name" placeholder="请输入商户名称" maxlength="50" show-word-limit />
        </el-form-item>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="联系人" prop="contactPerson">
              <el-input v-model="form.contactPerson" placeholder="请输入联系人" maxlength="20" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="联系电话" prop="contactPhone">
              <el-input v-model="form.contactPhone" placeholder="请输入联系电话" maxlength="20" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="平台费率" prop="platformFeeRate">
              <el-input-number
                v-model="form.platformFeeRate"
                :precision="4"
                :step="0.001"
                :min="0"
                :max="1"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="状态" prop="status">
              <el-select v-model="form.status" placeholder="请选择状态" style="width: 100%">
                <el-option label="启用" value="active" />
                <el-option label="停用" value="suspended" />
              </el-select>
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
        <el-button type="primary" :loading="submitting" @click="handleSubmit">确定</el-button>
      </template>
    </el-dialog>

    <!-- 详情弹窗 -->
    <el-dialog v-model="detailVisible" title="商户详情" width="640px" :close-on-click-modal="false" destroy-on-close>
      <div v-loading="detailLoading">
        <el-descriptions title="基本信息" :column="2" border size="small">
          <el-descriptions-item label="商户名称">{{ detail.name || '-' }}</el-descriptions-item>
          <el-descriptions-item label="商户编号">{{ detail.merchantNo || '-' }}</el-descriptions-item>
          <el-descriptions-item label="联系人">{{ detail.contactPerson || '-' }}</el-descriptions-item>
          <el-descriptions-item label="联系电话">{{ detail.contactPhone || '-' }}</el-descriptions-item>
          <el-descriptions-item label="平台费率">{{ detail.platformFeeRate != null ? (detail.platformFeeRate * 100).toFixed(2) + '%' : '-' }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="detail.status === 'active' ? 'success' : 'danger'" size="small">
              {{ detail.status === 'active' ? '启用' : '停用' }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="创建时间">{{ formatTime(detail.createdAt) }}</el-descriptions-item>
          <el-descriptions-item label="更新时间">{{ formatTime(detail.updatedAt) }}</el-descriptions-item>
        </el-descriptions>
        <el-descriptions title="统计信息" :column="2" border size="small" class="mt16">
          <el-descriptions-item label="门店数量">{{ detail.storeCount ?? '-' }}</el-descriptions-item>
          <el-descriptions-item label="员工数量">{{ detail.employeeCount ?? '-' }}</el-descriptions-item>
          <el-descriptions-item label="今日收款">{{ detail.todayAmount != null ? '¥' + detail.todayAmount.toFixed(2) : '-' }}</el-descriptions-item>
          <el-descriptions-item label="本月收款">{{ detail.monthAmount != null ? '¥' + detail.monthAmount.toFixed(2) : '-' }}</el-descriptions-item>
        </el-descriptions>
        <el-descriptions v-if="detail.remark" title="备注" :column="1" border size="small" class="mt16">
          <el-descriptions-item label="备注">{{ detail.remark }}</el-descriptions-item>
        </el-descriptions>
      </div>
      <template #footer>
        <el-button @click="detailVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { Plus, Search, Refresh, View, Edit, CircleClose, CircleCheck } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import dayjs from 'dayjs';
import { getMerchantList, createMerchant, updateMerchantStatus } from '@/api/merchant';
import request from '@/api/request';

interface MerchantItem {
  id: string;
  name: string;
  merchantNo?: string;
  contactPerson?: string;
  contactPhone?: string;
  platformFeeRate?: number;
  status: 'active' | 'suspended';
  remark?: string;
  createdAt?: string;
  updatedAt?: string;
  storeCount?: number;
  employeeCount?: number;
  todayAmount?: number;
  monthAmount?: number;
  [key: string]: any;
}

const statusOptions = [
  { value: 'active', label: '启用' },
  { value: 'suspended', label: '停用' },
];

const formatTime = (t?: string) => (t ? dayjs(t).format('YYYY-MM-DD HH:mm:ss') : '-');

// 筛选条件
const filter = reactive({
  keyword: '',
  status: '',
  dateRange: [] as string[],
});

const list = ref<MerchantItem[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const loading = ref(false);

async function loadData() {
  loading.value = true;
  try {
    const params: any = {
      page: page.value,
      pageSize: pageSize.value,
      keyword: filter.keyword || undefined,
      status: filter.status || undefined,
    };
    if (filter.dateRange?.length === 2) {
      params.startDate = filter.dateRange[0];
      params.endDate = filter.dateRange[1];
    }
    const res: any = await getMerchantList(params);
    list.value = res?.list || [];
    total.value = res?.total || 0;
  } catch {
    list.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
}

function handleSearch() {
  page.value = 1;
  loadData();
}

function handleReset() {
  filter.keyword = '';
  filter.status = '';
  filter.dateRange = [];
  page.value = 1;
  loadData();
}

// 新增/编辑
const dialogVisible = ref(false);
const isEdit = ref(false);
const submitting = ref(false);
const formRef = ref<FormInstance>();

const defaultForm = () => ({
  id: '',
  name: '',
  contactPerson: '',
  contactPhone: '',
  platformFeeRate: 0.0038,
  status: 'active' as 'active' | 'suspended',
  remark: '',
});

const form = reactive(defaultForm());

const rules: FormRules = {
  name: [{ required: true, message: '请输入商户名称', trigger: 'blur' }],
  contactPhone: [{ pattern: /^[\d-+ ]{6,20}$/, message: '请输入正确的联系电话', trigger: 'blur' }],
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

function openEdit(row: MerchantItem) {
  isEdit.value = true;
  resetForm();
  form.id = row.id;
  form.name = row.name;
  form.contactPerson = row.contactPerson || '';
  form.contactPhone = row.contactPhone || '';
  form.platformFeeRate = row.platformFeeRate ?? 0.0038;
  form.status = row.status;
  form.remark = row.remark || '';
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
      contactPerson: form.contactPerson || undefined,
      contactPhone: form.contactPhone || undefined,
      platformFeeRate: form.platformFeeRate,
      status: form.status,
      remark: form.remark || undefined,
    };

    if (isEdit.value) {
      await request.patch(`/api/merchants/${form.id}`, payload);
      ElMessage.success('更新成功');
    } else {
      await createMerchant(payload);
      ElMessage.success('创建成功');
    }
    dialogVisible.value = false;
    loadData();
  } catch {
    // error handled by interceptor
  } finally {
    submitting.value = false;
  }
}

// 状态切换
async function handleToggleStatus(row: MerchantItem) {
  const next = row.status === 'active' ? 'suspended' : 'active';
  const action = next === 'active' ? '启用' : '停用';
  try {
    await ElMessageBox.confirm(
      `确认${action}商户「${row.name}」？${action === '停用' ? '停用后该商户下所有门店将无法正常收款。' : ''}`,
      '提示',
      { type: 'warning' },
    );
  } catch {
    return;
  }
  try {
    await updateMerchantStatus(row.id, next);
    row.status = next;
    ElMessage.success(`已${action}`);
  } catch {
    // error handled by interceptor
  }
}

// 详情
const detailVisible = ref(false);
const detailLoading = ref(false);
const detail = ref<Partial<MerchantItem>>({});

async function openDetail(row: MerchantItem) {
  detailVisible.value = true;
  detailLoading.value = true;
  try {
    const res: any = await request.get(`/api/merchants/${row.id}`);
    detail.value = { ...row, ...(res || {}) };
  } catch {
    detail.value = { ...row };
  } finally {
    detailLoading.value = false;
  }
}

onMounted(loadData);
</script>

<style lang="scss" scoped>
.merchant-list {
  padding: 16px;

  .filter-card {
    margin-bottom: 12px;

    :deep(.el-card__body) {
      padding-bottom: 2px;
    }
  }

  .header-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .pagination-wrap {
    display: flex;
    justify-content: flex-end;
    margin-top: 16px;
  }

  .mt16 {
    margin-top: 16px;
  }
}
</style>
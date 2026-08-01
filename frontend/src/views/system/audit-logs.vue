<template>
  <div class="audit-logs-page">
    <!-- 顶部筛选 -->
    <el-card class="filter-card" shadow="never">
      <el-form :model="filter" inline @submit.prevent>
        <el-form-item label="日期范围">
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
        <el-form-item label="模块">
          <el-select v-model="filter.module" placeholder="全部" clearable style="width: 140px">
            <el-option v-for="item in moduleOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="操作类型">
          <el-select v-model="filter.action" placeholder="全部" clearable style="width: 140px">
            <el-option v-for="item in actionOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="操作人ID">
          <el-input v-model="filter.operatorId" placeholder="操作人ID" clearable style="width: 160px" @keyup.enter="handleSearch" />
        </el-form-item>
        <el-form-item label="关键字">
          <el-input v-model="filter.keyword" placeholder="操作描述/目标" clearable style="width: 180px" @keyup.enter="handleSearch" />
        </el-form-item>
        <el-form-item label="结果">
          <el-select v-model="filter.success" placeholder="全部" clearable style="width: 120px">
            <el-option label="成功" :value="true" />
            <el-option label="失败" :value="false" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :icon="Search" @click="handleSearch">查询</el-button>
          <el-button :icon="Refresh" @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 表格 -->
    <el-card class="table-card" shadow="never">
      <el-table v-loading="loading" :data="tableData" border stripe style="width: 100%">
        <el-table-column prop="createdAt" label="时间" width="170">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column prop="module" label="模块" width="110" align="center">
          <template #default="{ row }">{{ moduleLabel(row.module) }}</template>
        </el-table-column>
        <el-table-column prop="action" label="操作类型" width="110" align="center">
          <template #default="{ row }">
            <el-tag :type="actionTagType(row.action)" size="small">{{ actionLabel(row.action) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="description" label="操作描述" min-width="180" show-overflow-tooltip>
          <template #default="{ row }">{{ row.description || '-' }}</template>
        </el-table-column>
        <el-table-column prop="operatorName" label="操作人" width="120" show-overflow-tooltip>
          <template #default="{ row }">{{ row.operatorName || row.operatorId || '-' }}</template>
        </el-table-column>
        <el-table-column prop="targetType" label="目标类型" width="120" show-overflow-tooltip>
          <template #default="{ row }">{{ row.targetType || '-' }}</template>
        </el-table-column>
        <el-table-column prop="targetId" label="目标ID" width="130" show-overflow-tooltip>
          <template #default="{ row }">{{ row.targetId || '-' }}</template>
        </el-table-column>
        <el-table-column prop="ip" label="IP" width="130" show-overflow-tooltip>
          <template #default="{ row }">{{ row.ip || '-' }}</template>
        </el-table-column>
        <el-table-column prop="success" label="结果" width="90" align="center">
          <template #default="{ row }">
            <el-tag :type="row.success ? 'success' : 'danger'" size="small">
              {{ row.success ? '成功' : '失败' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="duration" label="耗时(ms)" width="100" align="right">
          <template #default="{ row }">{{ row.duration ?? '-' }}</template>
        </el-table-column>
        <el-table-column prop="errorMessage" label="错误信息" min-width="200" show-overflow-tooltip>
          <template #default="{ row }">{{ row.errorMessage || '-' }}</template>
        </el-table-column>
      </el-table>

      <div class="pagination-wrap">
        <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.pageSize"
          :total="pagination.total"
          :page-sizes="[20, 50, 100, 200]"
          layout="total, sizes, prev, pager, next, jumper"
          background
          @size-change="fetchList"
          @current-change="fetchList"
        />
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { Search, Refresh } from '@element-plus/icons-vue';
import dayjs from 'dayjs';
import { getAuditLogs } from '@/api/audit';

interface AuditLogItem {
  id: string;
  createdAt?: string;
  module?: string;
  action?: string;
  description?: string;
  operatorId?: string;
  operatorName?: string;
  targetType?: string;
  targetId?: string;
  ip?: string;
  success: boolean;
  duration?: number;
  errorMessage?: string;
}

const moduleOptions = [
  { value: 'auth', label: '认证' },
  { value: 'merchant', label: '商户' },
  { value: 'store', label: '门店' },
  { value: 'employee', label: '员工' },
  { value: 'order', label: '订单' },
  { value: 'payment', label: '支付' },
  { value: 'refund', label: '退款' },
  { value: 'report', label: '报表' },
  { value: 'system', label: '系统' },
];

const moduleMap: Record<string, string> = moduleOptions.reduce(
  (acc, cur) => ((acc[cur.value] = cur.label), acc),
  {} as Record<string, string>,
);
const moduleLabel = (m: string) => moduleMap[m] || m || '-';

const actionOptions = [
  { value: 'create', label: '创建' },
  { value: 'update', label: '更新' },
  { value: 'delete', label: '删除' },
  { value: 'query', label: '查询' },
  { value: 'export', label: '导出' },
  { value: 'login', label: '登录' },
  { value: 'logout', label: '登出' },
  { value: 'payment', label: '支付' },
  { value: 'refund', label: '退款' },
  { value: 'approve', label: '审批通过' },
  { value: 'reject', label: '审批驳回' },
  { value: 'close', label: '关闭' },
  { value: 'other', label: '其他' },
];

const actionMap: Record<string, string> = actionOptions.reduce(
  (acc, cur) => ((acc[cur.value] = cur.label), acc),
  {} as Record<string, string>,
);
const actionLabel = (a: string) => actionMap[a] || a || '-';

const actionTagMap: Record<string, 'success' | 'primary' | 'danger' | 'warning' | 'info'> = {
  create: 'success',
  update: 'primary',
  delete: 'danger',
  query: 'info',
  export: 'info',
  login: 'info',
  logout: 'info',
  payment: 'success',
  refund: 'warning',
  approve: 'success',
  reject: 'danger',
  close: 'warning',
  other: 'info',
};
const actionTagType = (a: string) => actionTagMap[a] || 'info';

const formatTime = (t?: string) => (t ? dayjs(t).format('YYYY-MM-DD HH:mm:ss') : '-');

// 筛选
const filter = reactive({
  dateRange: [] as string[],
  module: '',
  action: '',
  operatorId: '',
  keyword: '',
  success: undefined as boolean | undefined,
});

const loading = ref(false);
const tableData = ref<AuditLogItem[]>([]);
const pagination = reactive({
  page: 1,
  pageSize: 20,
  total: 0,
});

async function fetchList() {
  loading.value = true;
  try {
    const [startDate, endDate] = filter.dateRange || [];
    const res: any = await getAuditLogs({
      page: pagination.page,
      pageSize: pagination.pageSize,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      module: filter.module || undefined,
      action: filter.action || undefined,
      operatorId: filter.operatorId || undefined,
      keyword: filter.keyword || undefined,
      success: filter.success === undefined ? undefined : filter.success,
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
  filter.dateRange = [];
  filter.module = '';
  filter.action = '';
  filter.operatorId = '';
  filter.keyword = '';
  filter.success = undefined;
  pagination.page = 1;
  fetchList();
}

onMounted(() => {
  fetchList();
});
</script>

<style lang="scss" scoped>
.audit-logs-page {
  padding: 16px;

  .filter-card {
    margin-bottom: 12px;

    :deep(.el-card__body) {
      padding-bottom: 2px;
    }
  }

  .table-card {
    .pagination-wrap {
      display: flex;
      justify-content: flex-end;
      margin-top: 16px;
    }
  }
}
</style>

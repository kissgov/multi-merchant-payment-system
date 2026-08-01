<template>
  <div class="refund-list">
    <!-- 顶部筛选栏 -->
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
        <el-form-item label="退款状态">
          <el-select v-model="filter.status" placeholder="全部" clearable style="width: 140px">
            <el-option v-for="item in statusOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="渠道">
          <el-select v-model="filter.channel" placeholder="全部" clearable style="width: 140px">
            <el-option v-for="item in channelOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="退款原因">
          <el-select v-model="filter.reasonCode" placeholder="全部" clearable filterable style="width: 180px">
            <el-option v-for="item in reasonCodes" :key="item.code" :label="item.name" :value="item.code" />
          </el-select>
        </el-form-item>
        <el-form-item label="金额范围">
          <el-input-number v-model="filter.amountMin" :min="0" :precision="2" :controls="false" placeholder="最低" style="width: 110px" />
          <span class="range-sep">-</span>
          <el-input-number v-model="filter.amountMax" :min="0" :precision="2" :controls="false" placeholder="最高" style="width: 110px" />
        </el-form-item>
        <el-form-item label="关键字">
          <el-input v-model="filter.keyword" placeholder="退款单号/订单号" clearable style="width: 200px" @keyup.enter="handleSearch" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :icon="Search" @click="handleSearch">查询</el-button>
          <el-button :icon="Refresh" @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 统计摘要条 -->
    <div class="summary-bar">
      <div class="summary-item">
        <span class="summary-label">总退款笔数</span>
        <span class="summary-value">{{ summary.totalCount }} 笔</span>
      </div>
      <el-divider direction="vertical" />
      <div class="summary-item">
        <span class="summary-label">总退款金额</span>
        <span class="summary-value amount">￥{{ formatMoney(summary.totalAmount) }}</span>
      </div>
    </div>

    <!-- 表格 -->
    <el-card class="table-card" shadow="never">
      <el-table v-loading="loading" :data="tableData" border stripe style="width: 100%">
        <el-table-column prop="refundNo" label="退款单号" min-width="180" show-overflow-tooltip />
        <el-table-column prop="orderNo" label="关联订单号" min-width="180" show-overflow-tooltip>
          <template #default="{ row }">
            <el-link type="primary" :underline="false">{{ row.orderNo }}</el-link>
          </template>
        </el-table-column>
        <el-table-column prop="refundAmount" label="退款金额" width="120" align="right">
          <template #default="{ row }">
            <span class="amount">￥{{ formatMoney(row.refundAmount) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="channel" label="渠道" width="100">
          <template #default="{ row }">{{ channelLabel(row.channel) }}</template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="statusTagType(row.status)">{{ statusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="reason" label="原因" min-width="160" show-overflow-tooltip>
          <template #default="{ row }">{{ row.reason || row.reasonCode || '-' }}</template>
        </el-table-column>
        <el-table-column prop="operatorName" label="操作人" width="110" show-overflow-tooltip>
          <template #default="{ row }">{{ row.operatorName || '-' }}</template>
        </el-table-column>
        <el-table-column prop="createdAt" label="申请时间" width="170">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="160" fixed="right" align="center">
          <template #default="{ row }">
            <el-button link type="primary" :icon="View" @click="openDetail(row as RefundItem)">详情</el-button>
            <el-button
              v-if="canAudit(row as RefundItem)"
              v-hasPermi="'refund:audit'"
              link
              type="warning"
              :icon="Check"
              @click="openAudit(row as RefundItem)"
            >
              审批
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
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

    <!-- 审批弹窗 -->
    <el-dialog v-model="auditVisible" title="退款审批" width="640px" :close-on-click-modal="false" destroy-on-close>
      <div v-loading="detailLoading" class="audit-detail">
        <el-descriptions title="订单信息" :column="2" border size="small">
          <el-descriptions-item label="订单号">{{ detail.orderNo || '-' }}</el-descriptions-item>
          <el-descriptions-item label="订单金额">￥{{ formatMoney(detail.orderAmount) }}</el-descriptions-item>
          <el-descriptions-item label="支付渠道">{{ channelLabel(detail.channel) }}</el-descriptions-item>
          <el-descriptions-item label="下单时间">{{ formatTime(detail.orderCreatedAt) }}</el-descriptions-item>
        </el-descriptions>
        <el-descriptions title="退款信息" :column="2" border size="small" class="mt16">
          <el-descriptions-item label="退款单号">{{ detail.refundNo || '-' }}</el-descriptions-item>
          <el-descriptions-item label="退款金额">
            <span class="amount">￥{{ formatMoney(detail.refundAmount) }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="退款状态">
            <el-tag :type="statusTagType(detail.status)" size="small">{{ statusLabel(detail.status) }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="申请时间">{{ formatTime(detail.createdAt) }}</el-descriptions-item>
          <el-descriptions-item label="退款原因" :span="2">{{ detail.reason || detail.reasonCode || '-' }}</el-descriptions-item>
          <el-descriptions-item label="申请人">{{ detail.operatorName || '-' }}</el-descriptions-item>
        </el-descriptions>

        <el-form
          v-if="auditDecision"
          ref="auditFormRef"
          :model="auditForm"
          :rules="auditRules"
          label-width="90px"
          class="mt16"
        >
          <el-form-item v-if="auditDecision === 'reject'" label="驳回理由" prop="rejectReason">
            <el-input v-model="auditForm.rejectReason" type="textarea" :rows="3" maxlength="200" show-word-limit placeholder="请输入驳回理由" />
          </el-form-item>
        </el-form>
      </div>
      <template #footer>
        <el-button @click="auditVisible = false">取消</el-button>
        <el-button type="danger" :loading="submitting" @click="handleAudit('reject')">驳回</el-button>
        <el-button type="primary" :loading="submitting" @click="handleAudit('approve')">通过</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, nextTick } from 'vue';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import { Search, Refresh, View, Check } from '@element-plus/icons-vue';
import dayjs from 'dayjs';
import { getRefundList, getRefundDetail, auditRefund, getReasonCodes } from '@/api/refund';
import { useUserStore } from '@/stores/user';

const userStore = useUserStore();

interface RefundItem {
  id: string;
  refundNo: string;
  orderId: string;
  orderNo: string;
  refundAmount: number;
  channel: string;
  status: 'pending' | 'processing' | 'success' | 'failed';
  reasonCode?: string;
  reason?: string;
  operatorId?: string;
  operatorName?: string;
  createdAt: string;
  orderAmount?: number;
  orderCreatedAt?: string;
}

interface ReasonCode {
  code: string;
  name: string;
}

// 状态选项
const statusOptions = [
  { value: 'pending', label: '待审核' },
  { value: 'processing', label: '处理中' },
  { value: 'success', label: '已成功' },
  { value: 'failed', label: '已失败' },
];

const statusMap: Record<string, { label: string; type: 'warning' | 'primary' | 'success' | 'danger' }> = {
  pending: { label: '待审核', type: 'warning' },
  processing: { label: '处理中', type: 'primary' },
  success: { label: '已成功', type: 'success' },
  failed: { label: '已失败', type: 'danger' },
};

const channelOptions = [
  { value: 'alipay', label: '支付宝' },
  { value: 'wechat', label: '微信' },
  { value: 'unionpay', label: '银联' },
  { value: 'card', label: '银行卡' },
];

const channelMap: Record<string, string> = channelOptions.reduce(
  (acc, cur) => ((acc[cur.value] = cur.label), acc),
  {} as Record<string, string>,
);

// 筛选条件
const filter = reactive({
  dateRange: [] as string[],
  status: '',
  channel: '',
  reasonCode: '',
  amountMin: undefined as number | undefined,
  amountMax: undefined as number | undefined,
  keyword: '',
});

const reasonCodes = ref<ReasonCode[]>([]);
const tableData = ref<RefundItem[]>([]);
const loading = ref(false);

const pagination = reactive({
  page: 1,
  pageSize: 20,
  total: 0,
});

const summary = reactive({
  totalCount: 0,
  totalAmount: 0,
});

const statusLabel = (s?: string) => statusMap[s || '']?.label || s || '-';
const statusTagType = (s?: string) => statusMap[s || '']?.type || 'info';
const channelLabel = (c?: string) => channelMap[c || ''] || c || '-';

const formatMoney = (n?: number) => (Number(n || 0)).toFixed(2);
const formatTime = (t?: string) => (t ? dayjs(t).format('YYYY-MM-DD HH:mm:ss') : '-');

// 退款原因码
async function loadReasonCodes() {
  try {
    const res: any = await getReasonCodes();
    reasonCodes.value = Array.isArray(res) ? res : res?.list || [];
  } catch {
    reasonCodes.value = [];
  }
}

function buildQuery() {
  if (filter.amountMin != null && filter.amountMax != null && filter.amountMin > filter.amountMax) {
    ElMessage.warning('金额下限不能大于上限');
    return null;
  }
  return {
    page: pagination.page,
    pageSize: pagination.pageSize,
    startDate: filter.dateRange?.[0] || undefined,
    endDate: filter.dateRange?.[1] || undefined,
    status: filter.status || undefined,
    channel: filter.channel || undefined,
    reasonCode: filter.reasonCode || undefined,
    amountMin: filter.amountMin,
    amountMax: filter.amountMax,
    keyword: filter.keyword || undefined,
  };
}

async function fetchList() {
  const params = buildQuery();
  if (!params) return;
  loading.value = true;
  try {
    const res: any = await getRefundList(params);
    tableData.value = res?.list || [];
    pagination.total = res?.total || 0;
    // 统计摘要：优先使用接口返回的 summary
    summary.totalCount = res?.summary?.totalCount ?? res?.total ?? 0;
    summary.totalAmount = res?.summary?.totalAmount ?? 0;
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
  filter.status = '';
  filter.channel = '';
  filter.reasonCode = '';
  filter.amountMin = undefined;
  filter.amountMax = undefined;
  filter.keyword = '';
  pagination.page = 1;
  fetchList();
}

// 审批权限：仅 pending 状态且角色为 store_manager/merchant_admin/merchant_owner
const auditRoles = ['store_manager', 'merchant_admin', 'merchant_owner', 'super_admin'];
function canAudit(row: RefundItem) {
  if (row.status !== 'pending') return false;
  const roles = userStore.roles || [];
  return roles.some((r) => auditRoles.includes(r));
}

// 审批弹窗
const auditVisible = ref(false);
const detailLoading = ref(false);
const submitting = ref(false);
const auditFormRef = ref<FormInstance>();
const detail = ref<Partial<RefundItem>>({});
const auditDecision = ref<'approve' | 'reject' | ''>('');
const auditForm = reactive({ rejectReason: '' });

const auditRules: FormRules = {
  rejectReason: [{ required: true, message: '请输入驳回理由', trigger: 'blur' }],
};

async function openAudit(row: RefundItem) {
  auditDecision.value = '';
  auditForm.rejectReason = '';
  await openDetail(row);
  if (auditVisible.value === false) return; // 详情加载失败则不再打开审批
  auditVisible.value = true;
}

async function openDetail(row: RefundItem) {
  detailLoading.value = true;
  auditVisible.value = true;
  try {
    const res: any = await getRefundDetail(row.id);
    detail.value = { ...row, ...(res || {}) };
  } catch {
    detail.value = { ...row };
  } finally {
    detailLoading.value = false;
  }
}

async function handleAudit(decision: 'approve' | 'reject') {
  auditDecision.value = decision;
  if (decision === 'reject') {
    await nextTick();
    try {
      await auditFormRef.value?.validate();
    } catch {
      return;
    }
  }
  try {
    await ElMessageBox.confirm(
      decision === 'approve' ? '确认通过该退款申请？' : '确认驳回该退款申请？',
      '提示',
      { type: decision === 'approve' ? 'success' : 'warning' },
    );
  } catch {
    return;
  }
  submitting.value = true;
  try {
    await auditRefund(detail.value.id!, {
      decision,
      rejectReason: decision === 'reject' ? auditForm.rejectReason : undefined,
    });
    ElMessage.success(decision === 'approve' ? '审批通过' : '已驳回');
    auditVisible.value = false;
    fetchList();
  } finally {
    submitting.value = false;
  }
}

onMounted(() => {
  loadReasonCodes();
  fetchList();
});
</script>

<style lang="scss" scoped>
.refund-list {
  padding: 16px;

  .filter-card {
    margin-bottom: 12px;

    :deep(.el-card__body) {
      padding-bottom: 2px;
    }

    .range-sep {
      margin: 0 6px;
      color: #909399;
    }
  }

  .summary-bar {
    display: flex;
    align-items: center;
    padding: 12px 16px;
    margin-bottom: 12px;
    background: #f5f7fa;
    border-radius: 4px;

    .summary-item {
      display: flex;
      align-items: center;
      gap: 8px;

      .summary-label {
        font-size: 14px;
        color: #606266;
      }

      .summary-value {
        font-size: 16px;
        font-weight: 600;
        color: #303133;

        &.amount {
          color: #f56c6c;
        }
      }
    }
  }

  .table-card {
    .amount {
      color: #f56c6c;
      font-weight: 600;
    }

    .pagination-wrap {
      display: flex;
      justify-content: flex-end;
      margin-top: 16px;
    }
  }

  .audit-detail {
    .mt16 {
      margin-top: 16px;
    }

    .amount {
      color: #f56c6c;
      font-weight: 600;
    }
  }
}
</style>

<template>
  <div class="order-list">
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
        <el-form-item label="订单状态">
          <el-select v-model="filter.status" placeholder="全部" clearable style="width: 140px">
            <el-option v-for="item in statusOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="支付渠道">
          <el-select v-model="filter.channel" placeholder="全部" clearable style="width: 130px">
            <el-option v-for="item in channelOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="门店">
          <el-select v-model="filter.storeId" placeholder="全部" clearable filterable style="width: 180px">
            <el-option v-for="item in storeOptions" :key="item.id" :label="item.name" :value="item.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="关键字">
          <el-input
            v-model="filter.keyword"
            placeholder="订单号/交易号/手机号"
            clearable
            style="width: 220px"
            @keyup.enter="handleSearch"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :icon="Search" @click="handleSearch">查询</el-button>
          <el-button :icon="Refresh" @click="handleReset">重置</el-button>
          <el-button :icon="Download" @click="handleExportCsv">导出CSV</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 表格 -->
    <el-card class="table-card" shadow="never">
      <el-table v-loading="loading" :data="tableData" border stripe style="width: 100%">
        <el-table-column prop="orderNo" label="订单号" min-width="190" show-overflow-tooltip />
        <el-table-column prop="storeName" label="门店" min-width="140" show-overflow-tooltip>
          <template #default="{ row }">{{ row.storeName || '-' }}</template>
        </el-table-column>
        <el-table-column prop="cashierName" label="收银员" min-width="100" show-overflow-tooltip>
          <template #default="{ row }">{{ row.cashierName || '-' }}</template>
        </el-table-column>
        <el-table-column label="金额" width="120" align="right">
          <template #default="{ row }">
            <span class="amount">￥{{ formatMoney(row.paidAmount ?? row.amount) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="渠道" width="100" align="center">
          <template #default="{ row }">
            <el-tag v-if="row.channel" :type="channelTagType(row.channel)" size="small">
              {{ channelLabel(row.channel) }}
            </el-tag>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="110" align="center">
          <template #default="{ row }">
            <el-tag :type="statusTagType(row.status)" size="small">{{ statusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="支付时间" width="170">
          <template #default="{ row }">{{ formatTime(row.paidAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right" align="center">
          <template #default="{ row }">
            <el-button link type="primary" :icon="View" @click="openDetail(row)">详情</el-button>
            <el-button
              v-hasPermi="'order:refund'"
              link
              type="warning"
              :disabled="!canRefund(row)"
              @click="openRefund(row)"
            >
              退款
            </el-button>
            <el-button v-if="row.status === 'pending'" link type="danger" @click="handleClose(row)">关闭</el-button>
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

    <!-- 详情弹窗 -->
    <el-dialog v-model="detailVisible" title="订单详情" width="680px" :close-on-click-modal="false" destroy-on-close>
      <div v-loading="detailLoading">
        <el-descriptions title="订单信息" :column="2" border size="small">
          <el-descriptions-item label="订单号">{{ detail.orderNo || '-' }}</el-descriptions-item>
          <el-descriptions-item label="交易号">{{ detail.tradeNo || '-' }}</el-descriptions-item>
          <el-descriptions-item label="门店">{{ detail.storeName || '-' }}</el-descriptions-item>
          <el-descriptions-item label="收银员">{{ detail.cashierName || '-' }}</el-descriptions-item>
          <el-descriptions-item label="订单金额">￥{{ formatMoney(detail.amount) }}</el-descriptions-item>
          <el-descriptions-item label="已付金额">￥{{ formatMoney(detail.paidAmount) }}</el-descriptions-item>
          <el-descriptions-item label="已退金额">￥{{ formatMoney(detail.refundedAmount) }}</el-descriptions-item>
          <el-descriptions-item label="支付渠道">{{ channelLabel(detail.channel) }}</el-descriptions-item>
          <el-descriptions-item label="订单状态">
            <el-tag :type="statusTagType(detail.status)" size="small">{{ statusLabel(detail.status) }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="创建时间">{{ formatTime(detail.createdAt) }}</el-descriptions-item>
          <el-descriptions-item label="支付时间">{{ formatTime(detail.paidAt) }}</el-descriptions-item>
          <el-descriptions-item label="关闭时间">{{ formatTime(detail.closedAt) }}</el-descriptions-item>
          <el-descriptions-item label="备注" :span="2">{{ detail.remark || '-' }}</el-descriptions-item>
        </el-descriptions>

        <el-descriptions title="支付信息" :column="2" border size="small" class="mt16">
          <el-descriptions-item label="支付方式">{{ detail.payment?.method || '-' }}</el-descriptions-item>
          <el-descriptions-item label="支付交易号">{{ detail.payment?.tradeNo || detail.tradeNo || '-' }}</el-descriptions-item>
          <el-descriptions-item label="支付时间">{{ formatTime(detail.payment?.paidAt || detail.paidAt) }}</el-descriptions-item>
          <el-descriptions-item label="付款方">{{ detail.payment?.buyerLogonId || detail.payment?.buyer || '-' }}</el-descriptions-item>
        </el-descriptions>
      </div>
      <template #footer>
        <el-button @click="detailVisible = false">关闭</el-button>
      </template>
    </el-dialog>

    <!-- 退款弹窗 -->
    <el-dialog v-model="refundVisible" title="订单退款" width="480px" :close-on-click-modal="false" destroy-on-close>
      <el-form :model="refundForm" label-width="90px">
        <el-form-item label="订单号">
          <span>{{ refundForm.orderNo }}</span>
        </el-form-item>
        <el-form-item label="可退金额">
          <span class="amount">￥{{ formatMoney(refundForm.maxAmount) }}</span>
        </el-form-item>
        <el-form-item label="退款金额">
          <el-input-number
            v-model="refundForm.refundAmount"
            :min="0.01"
            :max="refundForm.maxAmount"
            :precision="2"
            :step="1"
            style="width: 220px"
          />
        </el-form-item>
        <el-form-item label="退款原因">
          <el-select v-model="refundForm.reasonCode" placeholder="请选择退款原因" style="width: 100%">
            <el-option v-for="item in reasonOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="退款说明">
          <el-input
            v-model="refundForm.reason"
            type="textarea"
            :rows="3"
            maxlength="200"
            show-word-limit
            placeholder="请填写退款说明"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="refundVisible = false">取消</el-button>
        <el-button type="primary" :loading="refundLoading" @click="submitRefund">确认退款</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Search, Refresh, View, Download } from '@element-plus/icons-vue';
import dayjs from 'dayjs';
import { getOrderList, getOrderDetail, refundOrder, closeOrder } from '@/api/order';
import { getStoreDropdown } from '@/api/store';
import { exportCsv } from '@/utils/csv';

interface OrderRow {
  id: string;
  orderNo: string;
  tradeNo?: string;
  storeName?: string;
  cashierName?: string;
  amount?: number;
  paidAmount?: number;
  refundedAmount?: number;
  channel?: string;
  status: string;
  paidAt?: string;
  createdAt?: string;
  closedAt?: string;
  remark?: string;
  payment?: any;
  [key: string]: any;
}

interface StoreOption {
  id: string;
  name: string;
}

// 订单状态选项
const statusOptions = [
  { value: 'pending', label: '待支付' },
  { value: 'paid', label: '已支付' },
  { value: 'partial_refunded', label: '部分退款' },
  { value: 'refunded', label: '已退款' },
  { value: 'closed', label: '已关闭' },
  { value: 'failed', label: '支付失败' },
];

// 状态 -> { 标签文本, Tag 颜色类型 }
const statusMap: Record<string, { label: string; type: 'info' | 'success' | 'warning' | 'danger' }> = {
  pending: { label: '待支付', type: 'info' },
  paid: { label: '已支付', type: 'success' },
  partial_refunded: { label: '部分退款', type: 'warning' },
  refunded: { label: '已退款', type: 'danger' },
  closed: { label: '已关闭', type: 'info' },
  failed: { label: '支付失败', type: 'danger' },
};

// 渠道选项
const channelOptions = [
  { value: 'alipay', label: '支付宝' },
  { value: 'wechat', label: '微信' },
];

const channelMap: Record<string, string> = channelOptions.reduce(
  (acc, cur) => ((acc[cur.value] = cur.label), acc),
  {} as Record<string, string>,
);

// 退款原因选项
const reasonOptions = [
  { value: 'customer_request', label: '顾客要求退款' },
  { value: 'out_of_stock', label: '商品缺货' },
  { value: 'service_issue', label: '服务问题' },
  { value: 'duplicate_order', label: '重复下单' },
  { value: 'other', label: '其他' },
];

// 筛选条件
const filter = reactive({
  dateRange: [] as string[],
  status: '',
  channel: '',
  storeId: '',
  keyword: '',
});

const storeOptions = ref<StoreOption[]>([]);
const tableData = ref<OrderRow[]>([]);
const loading = ref(false);

const pagination = reactive({
  page: 1,
  pageSize: 20,
  total: 0,
});

const statusLabel = (s: string) => statusMap[s]?.label || s || '-';
const statusTagType = (s: string) => statusMap[s]?.type || 'info';
const channelLabel = (c: string) => channelMap[c] || c || '-';
const channelTagType = (c: string): 'primary' | 'success' | 'info' => {
  const v = String(c || '').toLowerCase();
  if (v === 'alipay') return 'primary';
  if (v === 'wechat') return 'success';
  return 'info';
};

const formatMoney = (n?: number) => Number(n || 0).toFixed(2);
const formatTime = (t?: string) => (t ? (dayjs(t).isValid() ? dayjs(t).format('YYYY-MM-DD HH:mm:ss') : '-') : '-');

// 是否可退款：仅已支付 / 部分退款 状态可退
function canRefund(row: OrderRow) {
  return row.status === 'paid' || row.status === 'partial_refunded';
}

// 加载门店下拉
async function loadStores() {
  try {
    const res: any = await getStoreDropdown();
    const arr = Array.isArray(res) ? res : res?.list || [];
    storeOptions.value = arr.map((s: any) => ({ id: String(s.id), name: s.name }));
  } catch {
    storeOptions.value = [];
  }
}

function buildQuery() {
  return {
    page: pagination.page,
    pageSize: pagination.pageSize,
    startDate: filter.dateRange?.[0] || undefined,
    endDate: filter.dateRange?.[1] || undefined,
    status: filter.status || undefined,
    channel: filter.channel || undefined,
    storeId: filter.storeId || undefined,
    keyword: filter.keyword || undefined,
  };
}

async function fetchList() {
  loading.value = true;
  try {
    const res: any = await getOrderList(buildQuery());
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
  filter.status = '';
  filter.channel = '';
  filter.storeId = '';
  filter.keyword = '';
  pagination.page = 1;
  fetchList();
}

// 详情弹窗
const detailVisible = ref(false);
const detailLoading = ref(false);
const detail = ref<Partial<OrderRow>>({});

async function openDetail(row: OrderRow) {
  detailVisible.value = true;
  detailLoading.value = true;
  try {
    const res: any = await getOrderDetail(row.id);
    detail.value = { ...row, ...(res || {}) };
  } catch {
    detail.value = { ...row };
  } finally {
    detailLoading.value = false;
  }
}

// 退款弹窗
const refundVisible = ref(false);
const refundLoading = ref(false);
const refundForm = reactive({
  orderId: '',
  orderNo: '',
  maxAmount: 0,
  refundAmount: 0,
  reasonCode: '',
  reason: '',
});

function openRefund(row: OrderRow) {
  if (!canRefund(row)) {
    ElMessage.warning('当前订单状态不可退款');
    return;
  }
  const paid = Number(row.paidAmount ?? row.amount ?? 0);
  const refunded = Number(row.refundedAmount ?? 0);
  refundForm.orderId = row.id;
  refundForm.orderNo = row.orderNo;
  refundForm.maxAmount = Math.max(0, paid - refunded);
  refundForm.refundAmount = refundForm.maxAmount;
  refundForm.reasonCode = '';
  refundForm.reason = '';
  refundVisible.value = true;
}

async function submitRefund() {
  if (!refundForm.refundAmount || refundForm.refundAmount <= 0) {
    ElMessage.warning('请输入退款金额');
    return;
  }
  if (refundForm.refundAmount > refundForm.maxAmount) {
    ElMessage.warning('退款金额不能超过可退金额');
    return;
  }
  if (!refundForm.reason || !refundForm.reason.trim()) {
    ElMessage.warning('请填写退款说明');
    return;
  }
  refundLoading.value = true;
  try {
    await refundOrder({
      orderId: refundForm.orderId,
      refundAmount: refundForm.refundAmount,
      reasonCode: refundForm.reasonCode || undefined,
      reason: refundForm.reason.trim(),
    });
    ElMessage.success('退款申请已提交');
    refundVisible.value = false;
    fetchList();
  } catch {
    // 错误信息由 request 拦截器统一提示
  } finally {
    refundLoading.value = false;
  }
}

// 关闭订单（二次确认）
async function handleClose(row: OrderRow) {
  try {
    await ElMessageBox.confirm(
      `确定要关闭订单 ${row.orderNo} 吗？关闭后将无法继续支付。`,
      '关闭订单',
      { type: 'warning', confirmButtonText: '确定关闭', cancelButtonText: '取消' },
    );
  } catch {
    return;
  }
  try {
    await closeOrder(row.id);
    ElMessage.success('订单已关闭');
    fetchList();
  } catch {
    // 错误信息由 request 拦截器统一提示
  }
}

// CSV 导出（导出当前筛选条件下的数据，最多 10000 条）
async function handleExportCsv() {
  if (loading.value) return;
  loading.value = true;
  try {
    const res: any = await getOrderList({
      ...buildQuery(),
      page: 1,
      pageSize: 10000,
    });
    const rows = res?.list || [];
    if (rows.length === 0) {
      ElMessage.warning('暂无数据可导出');
      return;
    }
    exportCsv(
      rows.map((r: any) => ({
        orderNo: r.orderNo || '',
        storeName: r.store?.name || r.storeName || '',
        cashierName: r.employee?.name || r.cashierName || r.operatorName || '',
        paidAmount: r.paidAmount ?? r.amount ?? 0,
        refundedAmount: r.refundedAmount ?? 0,
        channel: channelLabel(r.paymentChannel || r.channel),
        status: statusLabel(r.status),
        paidAt: formatTime(r.paidAt),
        createdAt: formatTime(r.createdAt),
      })),
      {
        columns: {
          orderNo: '订单号',
          storeName: '门店',
          cashierName: '收银员',
          paidAmount: '实付金额',
          refundedAmount: '已退金额',
          channel: '支付渠道',
          status: '订单状态',
          paidAt: '支付时间',
          createdAt: '创建时间',
        },
        filename: '订单列表',
        moneyFields: ['paidAmount', 'refundedAmount'],
      },
    );
    ElMessage.success(`已导出 ${rows.length} 条订单`);
  } catch {
    // 错误信息由 request 拦截器统一提示
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  loadStores();
  fetchList();
});
</script>

<style lang="scss" scoped>
.order-list {
  padding: 16px;

  .filter-card {
    margin-bottom: 12px;

    :deep(.el-card__body) {
      padding-bottom: 2px;
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

  .mt16 {
    margin-top: 16px;
  }

  .amount {
    color: #f56c6c;
    font-weight: 600;
  }
}
</style>

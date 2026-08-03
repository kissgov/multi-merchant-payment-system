<template>
  <div class="cashier-overview" v-loading="loading">
    <div class="overview-header">
      <div class="header-title">
        <el-icon :size="20"><DataAnalysis /></el-icon>
        <span>收银员概览</span>
      </div>
      <div class="header-actions">
        <span v-if="lastRefreshTime" class="refresh-time">最后更新：{{ lastRefreshTime }}</span>
        <el-button type="primary" plain :icon="Refresh" :loading="loading" @click="loadData">刷新</el-button>
      </div>
    </div>

    <el-row :gutter="16" class="mb16">
      <el-col :span="6">
        <el-card shadow="hover">
          <div class="stat-card">
            <div class="stat-label">今日收款（笔）</div>
            <div class="stat-value">{{ overview.successOrders || 0 }}</div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover">
          <div class="stat-card">
            <div class="stat-label">今日收款（元）</div>
            <div class="stat-value">¥{{ formatAmount(overview.totalPaidAmount) }}</div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover">
          <div class="stat-card">
            <div class="stat-label">今日退款（元）</div>
            <div class="stat-value danger">¥{{ formatAmount(overview.totalRefundAmount) }}</div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover">
          <div class="stat-card">
            <div class="stat-label">今日净收（元）</div>
            <div class="stat-value success">¥{{ formatAmount(overview.netIncome) }}</div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-card shadow="never">
      <template #header>
        <div class="flow-header">
          <span>实时流水</span>
          <el-tag type="success" effect="plain" size="small">实时</el-tag>
        </div>
      </template>
      <el-empty v-if="!recentOrders.length" description="暂无收款记录" :image-size="60" />
      <el-table v-else :data="recentOrders" size="small" stripe max-height="400">
        <el-table-column prop="orderNo" label="订单号" min-width="180" show-overflow-tooltip />
        <el-table-column label="渠道" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="channelTagType(row.channel)" size="small">{{ channelLabel(row.channel) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="金额" width="120" align="right">
          <template #default="{ row }">¥{{ formatAmount(row.amount) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="statusTagType(row.status)" size="small">{{ statusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="门店" min-width="140" show-overflow-tooltip>
          <template #default="{ row }">{{ row.storeName || '-' }}</template>
        </el-table-column>
        <el-table-column label="时间" width="170">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { DataAnalysis, Refresh } from '@element-plus/icons-vue';
import dayjs from 'dayjs';
import { getSummary } from '@/api/report';
import { getOrderList } from '@/api/order';

const loading = ref(false);
const overview = ref<any>({});
const recentOrders = ref<any[]>([]);
const lastRefreshTime = ref('');

const channelMap: Record<string, string> = {
  alipay: '支付宝',
  wechat: '微信',
  unionpay: '银联',
  card: '银行卡',
};

const statusMap: Record<string, { label: string; type: 'info' | 'success' | 'warning' | 'danger' }> = {
  pending: { label: '待支付', type: 'info' },
  paid: { label: '已支付', type: 'success' },
  partial_refunded: { label: '部分退款', type: 'warning' },
  refunded: { label: '已退款', type: 'danger' },
  closed: { label: '已关闭', type: 'info' },
  failed: { label: '支付失败', type: 'danger' },
};

function channelLabel(c: string) {
  return channelMap[c] || c || '-';
}

function channelTagType(c: any): 'primary' | 'success' | 'info' {
  const v = String(c || '').toLowerCase();
  if (v === 'alipay') return 'primary';
  if (v === 'wechat') return 'success';
  return 'info';
}

function statusLabel(s: string) {
  return statusMap[s]?.label || s || '-';
}

function statusTagType(s: string) {
  return statusMap[s]?.type || 'info';
}

function formatAmount(val: any) {
  const n = Number(val || 0);
  return n.toFixed(2);
}

function formatTime(t?: string) {
  return t ? (dayjs(t).isValid() ? dayjs(t).format('YYYY-MM-DD HH:mm:ss') : '-') : '-';
}

async function loadData() {
  loading.value = true;
  try {
    const [summaryRes, orderRes] = await Promise.all([
      getSummary({}),
      getOrderList({ page: 1, pageSize: 10 }),
    ]);
    overview.value = (summaryRes as any)?.overview || {};
    recentOrders.value = (orderRes as any)?.list?.slice(0, 10) || [];
    lastRefreshTime.value = dayjs().format('YYYY-MM-DD HH:mm:ss');
  } catch {
    // ignore
  } finally {
    loading.value = false;
  }
}

let timer: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  loadData();
  timer = setInterval(() => loadData(), 30000);
});

onUnmounted(() => {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
});
</script>

<style lang="scss" scoped>
.cashier-overview {
  padding: 16px;

  .overview-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;

    .header-title {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 18px;
      font-weight: 600;
      color: #303133;

      .el-icon {
        color: #409eff;
      }
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 12px;

      .refresh-time {
        font-size: 13px;
        color: #909399;
      }
    }
  }

  .mb16 {
    margin-bottom: 16px;
  }

  .stat-card {
    text-align: center;
    padding: 16px 0;

    .stat-label {
      font-size: 13px;
      color: #909399;
      margin-bottom: 8px;
    }

    .stat-value {
      font-size: 26px;
      font-weight: 700;
      color: #303133;

      &.danger {
        color: #f56c6c;
      }

      &.success {
        color: #67c23a;
      }
    }
  }

  .flow-header {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 600;
  }
}
</style>
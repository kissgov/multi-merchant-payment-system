<template>
  <div class="report-summary">
    <el-card shadow="never">
      <template #header>
        <div class="header-bar">
          <span>收款汇总报表</span>
          <div class="filters">
            <el-date-picker
              v-model="dateRange"
              type="daterange"
              range-separator="至"
              start-placeholder="开始日期"
              end-placeholder="结束日期"
              value-format="YYYY-MM-DD"
              unlink-panels
              clearable
              @change="handleDateChange"
            />
            <el-button type="primary" :icon="Search" :loading="loading" @click="loadData">查询</el-button>
            <el-button :icon="Download" :disabled="!hasData" @click="handleExportCsv">导出CSV</el-button>
          </div>
        </div>
      </template>

      <div v-loading="loading" class="report-body">
        <el-row :gutter="16" class="mb16">
          <el-col :span="4">
            <el-statistic title="订单总数" :value="overview.totalOrders || 0" />
          </el-col>
          <el-col :span="4">
            <el-statistic title="成功订单" :value="overview.successOrders || 0" />
          </el-col>
          <el-col :span="4">
            <el-statistic title="收款总额" :precision="2" :value="overview.totalPaidAmount || 0" prefix="¥" />
          </el-col>
          <el-col :span="4">
            <el-statistic title="退款总额" :precision="2" :value="overview.totalRefundAmount || 0" prefix="¥" />
          </el-col>
          <el-col :span="4">
            <el-statistic title="退款笔数" :value="overview.refundOrders || 0" />
          </el-col>
          <el-col :span="4">
            <el-statistic title="成功率" :precision="2" :value="overview.successRate || 0" suffix="%" />
          </el-col>
        </el-row>

        <el-divider content-position="left">渠道分布</el-divider>
        <el-empty v-if="!byChannel.length" description="暂无数据" />
        <el-table v-else :data="byChannel" size="small" stripe>
          <el-table-column prop="channel" label="渠道" width="160">
            <template #default="{ row }">{{ channelLabel(row.channel) }}</template>
          </el-table-column>
          <el-table-column prop="orderCount" label="笔数" width="120" align="right" />
          <el-table-column label="金额" align="right">
            <template #default="{ row }">¥{{ formatAmount(row.totalAmount) }}</template>
          </el-table-column>
        </el-table>

        <el-divider content-position="left">门店分布</el-divider>
        <el-empty v-if="!byStore.length" description="暂无数据" />
        <el-table v-else :data="byStore" size="small" stripe>
          <el-table-column prop="storeName" label="门店" width="200" show-overflow-tooltip />
          <el-table-column prop="orderCount" label="笔数" width="120" align="right" />
          <el-table-column label="金额" align="right">
            <template #default="{ row }">¥{{ formatAmount(row.totalAmount) }}</template>
          </el-table-column>
        </el-table>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { Search, Download } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import dayjs from 'dayjs';
import { getSummary } from '@/api/report';
import { exportCsv } from '@/utils/csv';

const dateRange = ref<[string, string] | null>([dayjs().subtract(7, 'day').format('YYYY-MM-DD'), dayjs().format('YYYY-MM-DD')]);
const loading = ref(false);
const overview = ref<any>({});
const byChannel = ref<any[]>([]);
const byStore = ref<any[]>([]);

const hasData = computed(() => overview.value.totalOrders > 0);

const channelMap: Record<string, string> = {
  alipay: '支付宝',
  wechat: '微信',
  unionpay: '银联',
  card: '银行卡',
};

function channelLabel(c: string) {
  return channelMap[c] || c || '-';
}

function formatAmount(val: any) {
  return Number(val || 0).toFixed(2);
}

function handleDateChange() {
  loadData();
}

async function loadData() {
  loading.value = true;
  try {
    const params: any = {};
    if (dateRange.value && dateRange.value.length === 2) {
      params.startDate = dateRange.value[0];
      params.endDate = dateRange.value[1];
    }
    const res: any = await getSummary(params);
    overview.value = res?.overview || {};
    byChannel.value = res?.byChannel || [];
    byStore.value = res?.byStore || [];
  } catch {
    overview.value = {};
    byChannel.value = [];
    byStore.value = [];
  } finally {
    loading.value = false;
  }
}

function handleExportCsv() {
  const rows: Array<Record<string, any>> = [];

  rows.push({
    category: '汇总概览',
    name: '-',
    orderCount: overview.value.successOrders || 0,
    totalAmount: formatAmount(overview.value.totalPaidAmount),
    extra: `退款${overview.value.refundOrders || 0}笔 ¥${formatAmount(overview.value.totalRefundAmount)}`,
  });

  byChannel.value.forEach((c: any) => {
    rows.push({
      category: '渠道分布',
      name: channelLabel(c.channel),
      orderCount: c.orderCount || 0,
      totalAmount: formatAmount(c.totalAmount),
      extra: '',
    });
  });

  byStore.value.forEach((s: any) => {
    rows.push({
      category: '门店分布',
      name: s.storeName || '-',
      orderCount: s.orderCount || 0,
      totalAmount: formatAmount(s.totalAmount),
      extra: '',
    });
  });

  if (rows.length <= 0) {
    ElMessage.warning('暂无数据可导出');
    return;
  }

  exportCsv(rows, {
    columns: {
      category: '分类',
      name: '名称',
      orderCount: '笔数',
      totalAmount: '金额',
      extra: '备注',
    },
    filename: `收款汇总报表_${dayjs().format('YYYYMMDD')}`,
  });
  ElMessage.success('报表已导出');
}

onMounted(loadData);
</script>

<style lang="scss" scoped>
.report-summary {
  padding: 16px;

  .header-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
  }

  .filters {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .mb16 {
    margin-bottom: 16px;
  }

  .report-body {
    min-height: 200px;
  }
}
</style>
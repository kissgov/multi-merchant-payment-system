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
              @change="loadData"
            />
            <el-button type="primary" :icon="Search" @click="loadData">查询</el-button>
            <el-button :icon="Download" @click="handleExportCsv">导出CSV</el-button>
          </div>
        </div>
      </template>

      <el-row :gutter="16" class="mb16">
        <el-col :span="4">
          <el-statistic title="订单总数" :value="overview.totalOrders || 0" />
        </el-col>
        <el-col :span="4">
          <el-statistic title="成功订单" :value="overview.successOrders || 0" />
        </el-col>
        <el-col :span="4">
          <el-statistic title="收款总额" :value="formatAmount(overview.totalPaidAmount)" prefix="¥" />
        </el-col>
        <el-col :span="4">
          <el-statistic title="退款总额" :value="formatAmount(overview.totalRefundAmount)" prefix="¥" />
        </el-col>
        <el-col :span="4">
          <el-statistic title="退款笔数" :value="overview.refundOrders || 0" />
        </el-col>
        <el-col :span="4">
          <el-statistic title="成功率" :value="overview.successRate || 0" suffix="%" />
        </el-col>
      </el-row>

      <el-divider content-position="left">渠道分布</el-divider>
      <el-empty v-if="!byChannel.length" description="暂无数据" />
      <el-table v-else :data="byChannel" size="small">
        <el-table-column prop="channel" label="渠道" />
        <el-table-column prop="orderCount" label="笔数" />
        <el-table-column label="金额">
          <template #default="{ row }">¥{{ formatAmount(row.totalAmount) }}</template>
        </el-table-column>
      </el-table>

      <el-divider content-position="left">门店分布</el-divider>
      <el-empty v-if="!byStore.length" description="暂无数据" />
      <el-table v-else :data="byStore" size="small">
        <el-table-column prop="storeName" label="门店" />
        <el-table-column prop="orderCount" label="笔数" />
        <el-table-column label="金额">
          <template #default="{ row }">¥{{ formatAmount(row.totalAmount) }}</template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { Search, Download } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { getSummary } from '@/api/report';
import { exportCsv } from '@/utils/csv';

const dateRange = ref<[string, string] | null>(null);
const overview = ref<any>({});
const byChannel = ref<any[]>([]);
const byStore = ref<any[]>([]);

/** 金额格式化：数据库以 decimal(12,2) 存储元，直接 toFixed(2) */
function formatAmount(val: any) {
  return Number(val || 0).toFixed(2);
}

async function loadData() {
  try {
    const params: any = {};
    if (dateRange.value && dateRange.value.length === 2) {
      params.startDate = dateRange.value[0];
      params.endDate = dateRange.value[1];
    }
    const res: any = await getSummary(params);
    overview.value = res.overview || {};
    byChannel.value = res.byChannel || [];
    byStore.value = res.byStore || [];
  } catch {
    // ignore
  }
}

/** CSV 导出：汇总概览 + 渠道分布 + 门店分布 */
function handleExportCsv() {
  const rows: Array<Record<string, any>> = [];

  // 概览行
  rows.push({
    category: '汇总概览',
    name: '-',
    orderCount: overview.value.successOrders || 0,
    totalAmount: formatAmount(overview.value.totalPaidAmount),
    extra: `退款${overview.value.refundOrders || 0}笔 ¥${formatAmount(overview.value.totalRefundAmount)}`,
  });

  // 渠道分布
  byChannel.value.forEach((c) => {
    rows.push({
      category: '渠道分布',
      name: c.channel || '-',
      orderCount: c.orderCount || 0,
      totalAmount: formatAmount(c.totalAmount),
      extra: '',
    });
  });

  // 门店分布
  byStore.value.forEach((s) => {
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
    filename: '收款汇总报表',
  });
  ElMessage.success('报表已导出');
}

onMounted(loadData);
</script>

<style scoped>
.header-bar { display: flex; justify-content: space-between; align-items: center; }
.filters { display: flex; gap: 8px; }
.mb16 { margin-bottom: 16px; }
</style>

<template>
  <div class="cashier-overview">
    <el-row :gutter="16">
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

    <el-card shadow="never" class="mt16">
      <template #header>
        <span>实时流水</span>
        <el-button style="float: right" text :icon="Refresh" @click="loadData">刷新</el-button>
      </template>
      <el-empty v-if="!recentOrders.length" description="暂无收款记录" />
      <el-table v-else :data="recentOrders" size="small">
        <el-table-column prop="orderNo" label="订单号" width="200" />
        <el-table-column prop="channel" label="渠道" width="100" />
        <el-table-column prop="amount" label="金额" width="120">
          <template #default="{ row }">¥{{ formatAmount(row.amount) }}</template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100" />
        <el-table-column prop="createdAt" label="时间" />
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { Refresh } from '@element-plus/icons-vue';
import { getSummary } from '@/api/report';

const overview = ref<any>({});
const recentOrders = ref<any[]>([]);

function formatAmount(val: any) {
  const n = Number(val || 0) / 100;
  return n.toFixed(2);
}

async function loadData() {
  try {
    const res: any = await getSummary({});
    overview.value = res.overview || {};
  } catch {
    // ignore
  }
}

onMounted(loadData);
</script>

<style scoped>
.cashier-overview { padding: 4px; }
.stat-card { text-align: center; padding: 12px 0; }
.stat-label { font-size: 13px; color: #909399; margin-bottom: 8px; }
.stat-value { font-size: 24px; font-weight: 600; color: #303133; }
.stat-value.danger { color: #f56c6c; }
.stat-value.success { color: #67c23a; }
.mt16 { margin-top: 16px; }
</style>

<template>
  <div class="dashboard" v-loading="loading">
    <!-- 顶部标题栏 + 刷新 -->
    <div class="dashboard-header">
      <div class="header-title">
        <el-icon :size="22"><DataAnalysis /></el-icon>
        <span>收款数据大屏</span>
      </div>
      <div class="header-actions">
        <span v-if="lastRefreshTime" class="refresh-time">
          最后更新：{{ lastRefreshTime }}
        </span>
        <el-button type="primary" plain :icon="Refresh" :loading="loading" @click="loadData">
          刷新
        </el-button>
      </div>
    </div>

    <!-- KPI 卡片 -->
    <el-row :gutter="16" class="kpi-row">
      <el-col v-for="card in kpiCards" :key="card.label" :span="6">
        <el-card shadow="hover" class="kpi-card" :body-style="{ padding: '20px' }">
          <div class="kpi-card-body">
            <div class="kpi-icon" :style="{ background: card.color }">
              <el-icon :size="26"><component :is="card.icon" /></el-icon>
            </div>
            <div class="kpi-info">
              <div class="kpi-label">{{ card.label }}</div>
              <div class="kpi-value">{{ card.value }}</div>
              <div class="kpi-ratio" :class="card.ratioClass">
                <el-icon class="ratio-arrow">
                  <CaretTop v-if="card.positive" />
                  <CaretBottom v-else />
                </el-icon>
                <span class="ratio-text">{{ card.ratioText }}</span>
                <span class="ratio-label">较昨日</span>
              </div>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 图表行 -->
    <el-row :gutter="16" class="chart-row">
      <el-col :span="14">
        <el-card shadow="hover">
          <template #header>近7日收款趋势</template>
          <v-chart class="chart" :option="trendOption" autoresize />
        </el-card>
      </el-col>
      <el-col :span="10">
        <el-card shadow="hover">
          <template #header>今日渠道占比</template>
          <v-chart class="chart" :option="channelOption" autoresize />
        </el-card>
      </el-col>
    </el-row>

    <!-- 排行表格行 -->
    <el-row :gutter="16" class="rank-row">
      <el-col :span="12">
        <el-card shadow="hover">
          <template #header>今日门店收款排行 TOP10</template>
          <el-table :data="storeRank" size="small" stripe max-height="360">
            <el-table-column type="index" label="排名" width="60" align="center" />
            <el-table-column prop="storeName" label="门店名称" show-overflow-tooltip />
            <el-table-column prop="orderCount" label="订单数" width="90" align="right" />
            <el-table-column label="收款额" width="130" align="right">
              <template #default="{ row }">¥{{ formatMoney(row.amount) }}</template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card shadow="hover">
          <template #header>今日员工收款排行 TOP10</template>
          <el-table :data="employeeRank" size="small" stripe max-height="360">
            <el-table-column type="index" label="排名" width="60" align="center" />
            <el-table-column prop="employeeName" label="员工姓名" show-overflow-tooltip />
            <el-table-column prop="orderCount" label="订单数" width="90" align="right" />
            <el-table-column label="收款额" width="130" align="right">
              <template #default="{ row }">¥{{ formatMoney(row.amount) }}</template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
    </el-row>

    <!-- 实时流水 -->
    <el-card shadow="hover" class="flow-card">
      <template #header>
        <div class="flow-header">
          <span class="flow-title">实时流水（最近10笔）</span>
          <el-tag type="success" effect="plain" size="small">实时</el-tag>
        </div>
      </template>
      <el-table :data="latestOrders" size="small" stripe max-height="280">
        <el-table-column prop="orderNo" label="订单号" min-width="180" show-overflow-tooltip />
        <el-table-column label="金额" width="130" align="right">
          <template #default="{ row }">¥{{ formatMoney(row.amount) }}</template>
        </el-table-column>
        <el-table-column label="渠道" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="channelTagType(row.channel)" size="small">
              {{ channelText(row.channel) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="storeName" label="门店" min-width="140" show-overflow-tooltip />
        <el-table-column prop="cashierName" label="收银员" min-width="100" show-overflow-tooltip />
        <el-table-column label="时间" width="170">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import {
  DataAnalysis,
  Refresh,
  CaretTop,
  CaretBottom,
  Money,
  ShoppingCart,
  CircleCheck,
  Wallet,
} from '@element-plus/icons-vue';
import VChart from 'vue-echarts';
import { use } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { LineChart, PieChart } from 'echarts/charts';
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent,
} from 'echarts/components';
import dayjs from 'dayjs';
import { getBigScreen } from '@/api/report';

use([
  CanvasRenderer,
  LineChart,
  PieChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent,
]);

interface KpiData {
  todayAmount?: number;
  todayAmountRatio?: number;
  todayOrderCount?: number;
  todayOrderCountRatio?: number;
  todaySuccessRate?: number;
  todaySuccessRateRatio?: number;
  todayNetIncome?: number;
  todayNetIncomeRatio?: number;
}

interface TrendData {
  dates?: string[];
  amounts?: number[];
}

interface ChannelData {
  name: string;
  value: number;
}

interface RankItem {
  storeName?: string;
  employeeName?: string;
  orderCount?: number;
  amount?: number;
}

interface LatestOrder {
  orderNo?: string;
  amount?: number;
  channel?: string;
  storeName?: string;
  cashierName?: string;
  createdAt?: string;
}

interface BigScreenData {
  kpi?: KpiData;
  trend?: TrendData;
  channels?: ChannelData[];
  storeRank?: RankItem[];
  employeeRank?: RankItem[];
  latestOrders?: LatestOrder[];
}

const loading = ref(false);
const data = ref<BigScreenData>({});
const lastRefreshTime = ref('');

const kpi = computed(() => data.value.kpi || {});
const storeRank = computed(() => data.value.storeRank || []);
const employeeRank = computed(() => data.value.employeeRank || []);
const latestOrders = computed(() => data.value.latestOrders || []);

/** 金额格式化：toFixed(2) + 千分位 */
function formatMoney(val: any): string {
  const n = Number(val);
  if (isNaN(n)) return '0.00';
  return n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** 整数格式化 + 千分位 */
function formatNumber(val: any): string {
  const n = Number(val);
  if (isNaN(n)) return '0';
  return Math.trunc(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** 百分比格式化（入参为小数，如 0.12 表示 12%） */
function formatRate(val: any): string {
  const n = Number(val);
  if (isNaN(n)) return '0.00%';
  return `${(n * 100).toFixed(2)}%`;
}

/** 环比格式化：返回文本与正负 */
function formatRatio(val: any): { text: string; positive: boolean } {
  const n = Number(val);
  if (isNaN(n) || n === 0) return { text: '0.00%', positive: true };
  const percent = n * 100;
  return { text: `${Math.abs(percent).toFixed(2)}%`, positive: percent >= 0 };
}

/** 时间格式化 */
function formatTime(time: any): string {
  if (!time) return '-';
  const d = dayjs(time);
  return d.isValid() ? d.format('YYYY-MM-DD HH:mm:ss') : '-';
}

/** 渠道文本 */
function channelText(channel: any): string {
  const map: Record<string, string> = {
    alipay: '支付宝',
    wechat: '微信',
    unionpay: '银联',
  };
  return map[String(channel || '').toLowerCase()] || channel || '-';
}

/** 渠道标签类型 */
function channelTagType(channel: any): 'primary' | 'success' | 'info' {
  const c = String(channel || '').toLowerCase();
  if (c === 'alipay') return 'primary';
  if (c === 'wechat') return 'success';
  return 'info';
}

/** KPI 卡片数据 */
const kpiCards = computed(() => {
  const amountRatio = formatRatio(kpi.value.todayAmountRatio);
  const orderRatio = formatRatio(kpi.value.todayOrderCountRatio);
  const rateRatio = formatRatio(kpi.value.todaySuccessRateRatio);
  const incomeRatio = formatRatio(kpi.value.todayNetIncomeRatio);
  return [
    {
      label: '今日收款额',
      value: `¥${formatMoney(kpi.value.todayAmount)}`,
      ratioText: amountRatio.text,
      positive: amountRatio.positive,
      ratioClass: amountRatio.positive ? 'up' : 'down',
      icon: Money,
      color: 'linear-gradient(135deg, #409eff, #66b1ff)',
    },
    {
      label: '今日订单数',
      value: formatNumber(kpi.value.todayOrderCount),
      ratioText: orderRatio.text,
      positive: orderRatio.positive,
      ratioClass: orderRatio.positive ? 'up' : 'down',
      icon: ShoppingCart,
      color: 'linear-gradient(135deg, #67c23a, #85ce61)',
    },
    {
      label: '今日成功率',
      value: formatRate(kpi.value.todaySuccessRate),
      ratioText: rateRatio.text,
      positive: rateRatio.positive,
      ratioClass: rateRatio.positive ? 'up' : 'down',
      icon: CircleCheck,
      color: 'linear-gradient(135deg, #e6a23c, #ebb563)',
    },
    {
      label: '今日净收入',
      value: `¥${formatMoney(kpi.value.todayNetIncome)}`,
      ratioText: incomeRatio.text,
      positive: incomeRatio.positive,
      ratioClass: incomeRatio.positive ? 'up' : 'down',
      icon: Wallet,
      color: 'linear-gradient(135deg, #f56c6c, #f78989)',
    },
  ];
});

/** 近7日收款趋势折线图配置 */
const trendOption = computed(() => {
  const trend = data.value.trend || {};
  const dates = trend.dates || [];
  const amounts = trend.amounts || [];
  return {
    tooltip: {
      trigger: 'axis',
      formatter: (params: any) => {
        const item = params[0];
        return `${item.axisValue}<br/>${item.marker}${item.seriesName}：¥${formatMoney(item.value)}`;
      },
    },
    grid: { left: 60, right: 24, top: 30, bottom: 30 },
    xAxis: {
      type: 'category',
      data: dates,
      boundaryGap: false,
      axisLine: { lineStyle: { color: '#dcdfe6' } },
      axisLabel: { color: '#606266' },
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        color: '#606266',
        formatter: (v: number) => formatMoney(v),
      },
      splitLine: { lineStyle: { color: '#f0f0f0' } },
    },
    series: [
      {
        name: '收款额',
        type: 'line',
        smooth: true,
        data: amounts,
        symbol: 'circle',
        symbolSize: 8,
        itemStyle: { color: '#409eff' },
        lineStyle: { width: 3, color: '#409eff' },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(64,158,255,0.4)' },
              { offset: 1, color: 'rgba(64,158,255,0.02)' },
            ],
          },
        },
      },
    ],
  };
});

/** 今日渠道占比饼图配置 */
const channelOption = computed(() => {
  const channels = data.value.channels || [];
  const pieData = channels.map((c) => ({ name: c.name, value: Number(c.value) || 0 }));
  return {
    tooltip: {
      trigger: 'item',
      formatter: '{b}: ¥{c} ({d}%)',
    },
    legend: {
      bottom: 0,
      icon: 'circle',
      textStyle: { color: '#606266' },
    },
    color: ['#409eff', '#67c23a', '#e6a23c', '#f56c6c'],
    series: [
      {
        name: '渠道占比',
        type: 'pie',
        radius: ['40%', '68%'],
        center: ['50%', '45%'],
        avoidLabelOverlap: true,
        itemStyle: {
          borderRadius: 6,
          borderColor: '#fff',
          borderWidth: 2,
        },
        label: { show: false },
        emphasis: {
          label: {
            show: true,
            fontSize: 14,
            fontWeight: 'bold',
            formatter: '{b}\n{d}%',
          },
        },
        data: pieData,
      },
    ],
  };
});

/** 加载数据 */
async function loadData() {
  loading.value = true;
  try {
    const res: any = await getBigScreen();
    data.value = (res || {}) as BigScreenData;
    lastRefreshTime.value = dayjs().format('YYYY-MM-DD HH:mm:ss');
  } catch {
    // 错误信息由 request 拦截器统一提示
  } finally {
    loading.value = false;
  }
}

let timer: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  loadData();
  // 自动每30秒刷新
  timer = setInterval(loadData, 30000);
});

onUnmounted(() => {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
});
</script>

<style lang="scss" scoped>
.dashboard {
  padding-bottom: 8px;
}

.dashboard-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;

  .header-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 20px;
    font-weight: 600;
    color: #303133;

    .el-icon {
      color: #409eff;
    }
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 16px;

    .refresh-time {
      font-size: 13px;
      color: #909399;
    }
  }
}

.kpi-row {
  margin-bottom: 16px;
}

.kpi-card {
  border-radius: 8px;

  .kpi-card-body {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .kpi-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 56px;
    height: 56px;
    border-radius: 12px;
    color: #fff;
    flex-shrink: 0;
  }

  .kpi-info {
    flex: 1;
    min-width: 0;

    .kpi-label {
      font-size: 13px;
      color: #909399;
      margin-bottom: 4px;
    }

    .kpi-value {
      font-size: 24px;
      font-weight: 700;
      color: #303133;
      line-height: 1.2;
      margin-bottom: 4px;
    }

    .kpi-ratio {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 12px;

      .ratio-arrow {
        font-size: 14px;
      }

      .ratio-text {
        font-weight: 600;
      }

      .ratio-label {
        color: #c0c4cc;
        margin-left: 2px;
      }

      &.up {
        color: #67c23a;
      }

      &.down {
        color: #f56c6c;
      }
    }
  }
}

.chart-row,
.rank-row {
  margin-bottom: 16px;
}

.chart {
  height: 320px;
}

.flow-card {
  .flow-header {
    display: flex;
    align-items: center;
    gap: 8px;

    .flow-title {
      font-weight: 600;
    }
  }
}

:deep(.el-card__header) {
  font-weight: 600;
  color: #303133;
}
</style>

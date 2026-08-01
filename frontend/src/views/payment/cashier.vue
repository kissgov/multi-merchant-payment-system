<template>
  <div class="cashier-page">
    <!-- 顶部渠道选择 -->
    <div class="channel-bar">
      <div
        class="channel-btn alipay"
        :class="{ active: channel === 'alipay' }"
        @click="selectChannel('alipay')"
      >
        <span class="channel-text">支付宝</span>
      </div>
      <div
        class="channel-btn wechat"
        :class="{ active: channel === 'wechat' }"
        @click="selectChannel('wechat')"
      >
        <span class="channel-text">微信</span>
      </div>
    </div>

    <div class="cashier-body">
      <!-- 左侧：金额输入区 + 数字键盘 -->
      <div class="amount-panel">
        <div class="amount-display">
          <span class="currency">¥</span>
          <span class="amount-num">{{ amountDisplay }}</span>
        </div>
        <div class="keypad">
          <button
            v-for="key in keypadKeys"
            :key="key"
            class="keypad-btn"
            :class="{ 'key-del': key === 'del' }"
            @click="pressKey(key)"
          >
            {{ key === 'del' ? '⌫' : key }}
          </button>
        </div>
        <button class="keypad-btn key-clear" @click="pressKey('clear')">清空</button>
      </div>

      <!-- 右侧：收款模式 + 操作 -->
      <div class="mode-panel">
        <el-tabs v-model="mode" class="mode-tabs">
          <el-tab-pane label="扫码收款" name="micropay">
            <div class="mode-content">
              <div class="mode-hint">被扫：扫描顾客付款码完成收款</div>
              <el-input
                v-model="authCode"
                placeholder="请将光标聚焦于此，用扫码枪扫描顾客付款码"
                size="large"
                clearable
                @keyup.enter="handleMicropay"
              >
                <template #prefix>
                  <el-icon><Search /></el-icon>
                </template>
              </el-input>
              <el-button
                type="primary"
                size="large"
                class="confirm-btn"
                :loading="paying"
                @click="handleMicropay"
              >
                确认收款 ¥{{ amountDisplay }}
              </el-button>
              <div class="tip">提示：直接用扫码枪扫顾客的付款码即可自动收款</div>
            </div>
          </el-tab-pane>

          <el-tab-pane label="收款码" name="qrcode">
            <div class="mode-content">
              <div class="mode-hint">主扫：生成二维码请顾客扫码支付</div>
              <template v-if="!qrCodeUrl">
                <el-button
                  type="primary"
                  size="large"
                  class="confirm-btn"
                  :loading="paying"
                  @click="handleCreateQr"
                >
                  生成二维码 ¥{{ amountDisplay }}
                </el-button>
                <div class="tip">提示：生成二维码后请顾客用{{ channelText }}扫码支付</div>
              </template>
              <template v-else>
                <div class="qr-wrap">
                  <img :src="qrCodeUrl" alt="收款二维码" class="qr-img" />
                  <div class="qr-info">
                    <div class="qr-amount">¥{{ amountDisplay }}</div>
                    <div class="qr-channel">{{ channelText }}</div>
                    <div class="qr-countdown" :class="{ expired: countdown <= 0 }">
                      <template v-if="countdown > 0">剩余 {{ countdown }} 秒</template>
                      <template v-else>二维码已过期</template>
                    </div>
                  </div>
                  <el-button
                    v-if="countdown <= 0"
                    size="large"
                    type="primary"
                    plain
                    @click="handleCreateQr"
                  >
                    重新生成
                  </el-button>
                </div>
              </template>
            </div>
          </el-tab-pane>
        </el-tabs>
      </div>
    </div>

    <!-- 最近收款记录 -->
    <div class="recent-section">
      <div class="section-title">最近收款记录</div>
      <el-empty v-if="recentRecords.length === 0" description="暂无收款记录" :image-size="60" />
      <ul v-else class="recent-list">
        <li v-for="(r, i) in recentRecords" :key="i" class="recent-item">
          <span class="r-channel" :class="r.channel">{{ channelTextOf(r.channel) }}</span>
          <span class="r-amount">¥{{ formatMoney(r.amount) }}</span>
          <span class="r-status" :class="r.success ? 'ok' : 'fail'">
            {{ r.success ? '成功' : '失败' }}
          </span>
          <span class="r-time">{{ r.time }}</span>
          <span class="r-no">{{ r.orderNo }}</span>
        </li>
      </ul>
    </div>

    <!-- 收款结果弹窗 -->
    <el-dialog
      v-model="result.visible"
      :title="result.success ? '收款成功' : '收款失败'"
      width="420px"
      :close-on-click-modal="false"
      :show-close="true"
    >
      <div class="result-box">
        <div class="result-icon" :class="result.success ? 'success' : 'fail'">
          <el-icon v-if="result.success"><Select /></el-icon>
          <el-icon v-else><CloseBold /></el-icon>
        </div>
        <template v-if="result.success">
          <div class="result-amount">¥{{ formatMoney(result.amount) }}</div>
          <div class="result-channel">{{ channelTextOf(result.channel) }} 收款成功</div>
        </template>
        <template v-else>
          <div class="result-fail">收款失败</div>
          <div class="result-reason">{{ result.reason }}</div>
        </template>
      </div>
      <template #footer>
        <el-button type="primary" size="large" @click="result.visible = false">完成</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { ElMessage } from 'element-plus';
import dayjs from 'dayjs';
import { micropay, createQrCode, queryPayment } from '@/api/payment';

type Channel = 'alipay' | 'wechat';

const channel = ref<Channel>('alipay');
const amountValue = ref('0');
const mode = ref<'micropay' | 'qrcode'>('micropay');
const authCode = ref('');
const paying = ref(false);

const qrCodeUrl = ref('');
const qrOrderId = ref('');
const countdown = ref(0);

const recentRecords = ref<
  Array<{
    orderNo: string;
    amount: number;
    channel: Channel;
    success: boolean;
    time: string;
  }>
>([]);

const result = ref({
  visible: false,
  success: false,
  amount: 0,
  channel: 'alipay' as Channel,
  reason: '',
});

const keypadKeys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'];

const amountDisplay = computed(() => {
  const v = amountValue.value;
  if (!v || v === '0') return '0.00';
  return v;
});

const amountNumber = computed(() => parseFloat(amountValue.value) || 0);

const channelText = computed(() => (channel.value === 'alipay' ? '支付宝' : '微信'));

function channelTextOf(c: Channel) {
  return c === 'alipay' ? '支付宝' : '微信';
}

function formatMoney(n: number) {
  return Number(n || 0).toFixed(2);
}

function nowStr() {
  return dayjs().format('YYYY-MM-DD HH:mm:ss');
}

function selectChannel(c: Channel) {
  if (paying.value) return;
  channel.value = c;
}

// 数字键盘输入
function pressKey(key: string) {
  if (paying.value) return;
  const v = amountValue.value;

  if (key === 'del') {
    amountValue.value = v.length > 1 ? v.slice(0, -1) : '0';
    return;
  }
  if (key === 'clear') {
    amountValue.value = '0';
    return;
  }
  if (key === '.') {
    if (v.includes('.')) return;
    amountValue.value = v + '.';
    return;
  }
  // 数字键
  if (v === '0') {
    amountValue.value = key;
  } else {
    // 限制小数位最多 2 位
    if (v.includes('.')) {
      const dec = v.split('.')[1] || '';
      if (dec.length >= 2) return;
    }
    // 限制总长度
    if (v.replace('.', '').length >= 10) return;
    amountValue.value = v + key;
  }
}

// 切换收款模式时清理二维码 / 轮询
watch(mode, () => {
  stopPolling();
  clearQr();
  paying.value = false;
  authCode.value = '';
});

// ============ 被扫：扫码枪监听 ============
// 当焦点不在输入框时，捕获扫码枪快速输入的字符，回车后自动收款
let scanBuffer = '';
let scanTimer: ReturnType<typeof setTimeout> | null = null;

function onGlobalKeydown(e: KeyboardEvent) {
  if (mode.value !== 'micropay' || amountNumber.value <= 0) return;
  if (paying.value || result.value.visible) return;
  if (e.ctrlKey || e.altKey || e.metaKey) return;

  const target = e.target as HTMLElement | null;
  const tag = target?.tagName;
  // 焦点在输入框时由其自身的 @keyup.enter 处理
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;

  if (e.key === 'Enter') {
    if (scanBuffer.length >= 8) {
      authCode.value = scanBuffer;
      scanBuffer = '';
      handleMicropay();
      e.preventDefault();
    } else {
      scanBuffer = '';
    }
    return;
  }
  if (e.key.length === 1) {
    scanBuffer += e.key;
    if (scanTimer) clearTimeout(scanTimer);
    scanTimer = setTimeout(() => {
      scanBuffer = '';
    }, 80);
  }
}

// ============ 被扫收款 ============
async function handleMicropay() {
  if (paying.value) return;
  if (amountNumber.value <= 0) {
    ElMessage.warning('请输入收款金额');
    return;
  }
  const code = authCode.value.trim();
  if (code.length < 8) {
    ElMessage.warning('请输入或扫描顾客付款码');
    return;
  }
  paying.value = true;
  const amt = amountNumber.value;
  const ch = channel.value;
  try {
    const res: any = await micropay({
      channel: ch,
      amount: amt,
      authCode: code,
      subject: '收银台收款',
    });
    handlePayResponse(res, amt, ch);
  } catch (e: any) {
    paying.value = false;
    const reason = e?.response?.data?.message || '收款请求失败';
    addRecent('', amt, ch, false);
    showResult(false, amt, ch, reason);
  }
}

function handlePayResponse(res: any, amt: number, ch: Channel) {
  const status = res?.status || res?.orderStatus;
  const orderId = res?.orderId || res?.id || res?.orderNo || '';
  const orderNo = res?.orderNo || orderId;

  if (
    status === 'SUCCESS' ||
    status === 'PAID' ||
    status === 'TRADE_SUCCESS' ||
    status === 'success'
  ) {
    paying.value = false;
    addRecent(orderNo, amt, ch, true);
    showResult(true, amt, ch);
    resetForNext();
  } else if (
    status === 'WAITING_PAYER' ||
    status === 'WAIT_BUYER_PAY' ||
    status === 'PROCESSING' ||
    status === 'waiting_payer'
  ) {
    ElMessage.info('等待顾客支付中...');
    if (orderId) startPolling(orderId, amt, ch);
  } else {
    paying.value = false;
    const reason = res?.failReason || res?.errorMsg || res?.message || '收款失败';
    addRecent(orderNo, amt, ch, false);
    showResult(false, amt, ch, reason);
  }
}

// ============ 主扫：生成二维码 ============
async function handleCreateQr() {
  if (paying.value) return;
  if (amountNumber.value <= 0) {
    ElMessage.warning('请输入收款金额');
    return;
  }
  paying.value = true;
  clearQr();
  const amt = amountNumber.value;
  const ch = channel.value;
  try {
    const res: any = await createQrCode({
      channel: ch,
      amount: amt,
      subject: '收银台收款',
      expireSeconds: 300,
    });
    paying.value = false;
    qrCodeUrl.value = res?.qrCodeUrl || res?.codeUrl || res?.url || '';
    qrOrderId.value = res?.orderId || res?.id || res?.orderNo || '';
    if (!qrCodeUrl.value) {
      showResult(false, amt, ch, '二维码生成失败');
      return;
    }
    startCountdown(res?.expireSeconds || 300);
    if (qrOrderId.value) startPolling(qrOrderId.value, amt, ch);
  } catch (e: any) {
    paying.value = false;
    const reason = e?.response?.data?.message || '二维码生成失败';
    showResult(false, amt, ch, reason);
  }
}

// ============ 支付状态轮询 ============
const MAX_POLL = 30;
const POLL_INTERVAL = 2000;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let pollCount = 0;
// 轮询上下文（金额/渠道），避免金额被重置后丢失
let pollAmount = 0;
let pollChannel: Channel = 'alipay';

function startPolling(orderId: string, amt: number, ch: Channel) {
  stopPolling();
  pollAmount = amt;
  pollChannel = ch;
  pollCount = 0;
  pollTimer = setInterval(async () => {
    pollCount++;
    try {
      const res: any = await queryPayment(orderId);
      handleQueryResult(res);
    } catch {
      // 忽略瞬时错误，继续轮询
    }
    if (pollCount >= MAX_POLL) {
      stopPolling();
      stopCountdown();
      paying.value = false;
      if (!result.value.visible) {
        addRecent('', pollAmount, pollChannel, false);
        showResult(false, pollAmount, pollChannel, '支付超时，请重试');
      }
    }
  }, POLL_INTERVAL);
}

function handleQueryResult(res: any) {
  const status = res?.status || res?.orderStatus;
  const orderNo = res?.orderNo || '';

  if (
    status === 'SUCCESS' ||
    status === 'PAID' ||
    status === 'TRADE_SUCCESS' ||
    status === 'success'
  ) {
    stopPolling();
    stopCountdown();
    paying.value = false;
    addRecent(orderNo, pollAmount, pollChannel, true);
    showResult(true, pollAmount, pollChannel);
    clearQr();
    resetForNext();
  } else if (
    status === 'FAILED' ||
    status === 'CLOSED' ||
    status === 'EXPIRED' ||
    status === 'PAY_FAIL' ||
    status === 'failed' ||
    status === 'closed'
  ) {
    stopPolling();
    stopCountdown();
    paying.value = false;
    const reason = res?.failReason || res?.errorMsg || '支付失败';
    addRecent(orderNo, pollAmount, pollChannel, false);
    showResult(false, pollAmount, pollChannel, reason);
  }
  // 其它状态继续轮询
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

// ============ 二维码倒计时 ============
let countdownTimer: ReturnType<typeof setInterval> | null = null;

function startCountdown(sec: number) {
  stopCountdown();
  countdown.value = sec;
  countdownTimer = setInterval(() => {
    countdown.value--;
    if (countdown.value <= 0) {
      stopCountdown();
      stopPolling();
    }
  }, 1000);
}

function stopCountdown() {
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
}

function clearQr() {
  qrCodeUrl.value = '';
  qrOrderId.value = '';
  countdown.value = 0;
  stopCountdown();
  stopPolling();
}

// ============ 结果与记录 ============
function showResult(success: boolean, amount: number, ch: Channel, reason = '') {
  result.value = { visible: true, success, amount, channel: ch, reason };
}

function addRecent(orderNo: string, amount: number, ch: Channel, success: boolean) {
  recentRecords.value.unshift({
    orderNo: orderNo || '-',
    amount,
    channel: ch,
    success,
    time: nowStr(),
  });
  if (recentRecords.value.length > 5) recentRecords.value.length = 5;
}

function resetForNext() {
  authCode.value = '';
  amountValue.value = '0';
}

onMounted(() => {
  window.addEventListener('keydown', onGlobalKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onGlobalKeydown);
  stopPolling();
  stopCountdown();
  if (scanTimer) clearTimeout(scanTimer);
});
</script>

<style lang="scss" scoped>
.cashier-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: calc(100vh - 116px);
}

/* 渠道选择 */
.channel-bar {
  display: flex;
  gap: 16px;

  .channel-btn {
    flex: 1;
    height: 76px;
    border-radius: 12px;
    border: 2px solid #e4e7ed;
    background: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.2s;
    user-select: none;

    .channel-text {
      font-size: 24px;
      font-weight: 700;
      color: #606266;
    }

    &.alipay.active {
      background: #1677ff;
      border-color: #1677ff;
      .channel-text {
        color: #fff;
      }
    }

    &.wechat.active {
      background: #07c160;
      border-color: #07c160;
      .channel-text {
        color: #fff;
      }
    }

    &:hover {
      border-color: #c0c4cc;
    }
  }
}

.cashier-body {
  display: flex;
  gap: 16px;
  align-items: stretch;
}

/* 金额输入区 + 键盘 */
.amount-panel {
  width: 380px;
  background: #fff;
  border-radius: 12px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;

  .amount-display {
    height: 104px;
    border-radius: 10px;
    background: linear-gradient(135deg, #f5f7fa, #eef2f7);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;

    .currency {
      font-size: 30px;
      color: #909399;
    }

    .amount-num {
      font-size: 52px;
      font-weight: 700;
      color: #303133;
      line-height: 1;
    }
  }

  .keypad {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;

    .keypad-btn {
      height: 62px;
      border: 1px solid #dcdfe6;
      border-radius: 10px;
      background: #fff;
      font-size: 26px;
      color: #303133;
      cursor: pointer;
      transition: all 0.15s;

      &:hover {
        background: #ecf5ff;
        border-color: #409eff;
        color: #409eff;
      }

      &:active {
        transform: scale(0.96);
      }

      &.key-del {
        font-size: 28px;
        color: #f56c6c;
        &:hover {
          background: #fef0f0;
          border-color: #f56c6c;
          color: #f56c6c;
        }
      }
    }
  }

  .key-clear {
    height: 52px;
    border: 1px solid #dcdfe6;
    border-radius: 10px;
    background: #fafafa;
    font-size: 20px;
    color: #606266;
    cursor: pointer;
    transition: all 0.15s;

    &:hover {
      background: #f4f4f5;
      border-color: #909399;
    }

    &:active {
      transform: scale(0.98);
    }
  }
}

/* 收款模式 */
.mode-panel {
  flex: 1;
  background: #fff;
  border-radius: 12px;
  padding: 8px 20px 20px;
  display: flex;
  flex-direction: column;

  :deep(.el-tabs__header) {
    margin-bottom: 16px;
  }

  :deep(.el-tabs__item) {
    font-size: 16px;
    height: 48px;
    line-height: 48px;
  }

  .mode-content {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding-top: 8px;

    .mode-hint {
      font-size: 14px;
      color: #909399;
    }

    .confirm-btn {
      width: 100%;
      height: 60px;
      font-size: 22px;
      font-weight: 600;
      margin-top: 8px;
    }

    .tip {
      font-size: 13px;
      color: #909399;
      text-align: center;
    }
  }

  .qr-wrap {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
    padding: 8px 0 16px;

    .qr-img {
      width: 240px;
      height: 240px;
      border: 1px solid #ebeef5;
      border-radius: 10px;
      padding: 8px;
      background: #fff;
    }

    .qr-info {
      text-align: center;

      .qr-amount {
        font-size: 34px;
        font-weight: 700;
        color: #f56c6c;
        line-height: 1.2;
      }

      .qr-channel {
        font-size: 16px;
        color: #606266;
        margin-top: 4px;
      }

      .qr-countdown {
        font-size: 16px;
        color: #67c23a;
        margin-top: 6px;

        &.expired {
          color: #f56c6c;
        }
      }
    }
  }
}

/* 最近收款记录 */
.recent-section {
  background: #fff;
  border-radius: 12px;
  padding: 16px 20px;

  .section-title {
    font-size: 16px;
    font-weight: 600;
    color: #303133;
    margin-bottom: 12px;
  }

  .recent-list {
    list-style: none;
    margin: 0;
    padding: 0;

    .recent-item {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 10px 0;
      border-bottom: 1px solid #f0f0f0;
      font-size: 14px;

      &:last-child {
        border-bottom: none;
      }

      .r-channel {
        padding: 2px 10px;
        border-radius: 4px;
        color: #fff;
        font-size: 12px;
        flex-shrink: 0;

        &.alipay {
          background: #1677ff;
        }

        &.wechat {
          background: #07c160;
        }
      }

      .r-amount {
        font-size: 18px;
        font-weight: 600;
        color: #303133;
        min-width: 100px;
      }

      .r-status {
        font-size: 13px;
        flex-shrink: 0;

        &.ok {
          color: #67c23a;
        }

        &.fail {
          color: #f56c6c;
        }
      }

      .r-time {
        color: #909399;
        font-size: 13px;
      }

      .r-no {
        color: #909399;
        font-size: 13px;
        margin-left: auto;
      }
    }
  }
}

/* 收款结果弹窗 */
.result-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 16px 0 8px;

  .result-icon {
    width: 76px;
    height: 76px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 42px;
    color: #fff;

    &.success {
      background: #67c23a;
    }

    &.fail {
      background: #f56c6c;
    }
  }

  .result-amount {
    font-size: 38px;
    font-weight: 700;
    color: #303133;
    line-height: 1.2;
  }

  .result-channel {
    font-size: 16px;
    color: #909399;
  }

  .result-fail {
    font-size: 22px;
    font-weight: 600;
    color: #f56c6c;
  }

  .result-reason {
    font-size: 14px;
    color: #606266;
    max-width: 320px;
    text-align: center;
    word-break: break-all;
  }
}
</style>

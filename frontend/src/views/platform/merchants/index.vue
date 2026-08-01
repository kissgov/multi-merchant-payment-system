<template>
  <div class="merchant-list">
    <el-card shadow="never">
      <template #header>
        <div class="header-bar">
          <span>商户列表</span>
          <el-button type="primary" :icon="Plus" @click="dialogVisible = true">新增商户</el-button>
        </div>
      </template>

      <el-table :data="list" v-loading="loading" border>
        <el-table-column prop="name" label="商户名称" width="200" />
        <el-table-column prop="merchantNo" label="商户编号" width="150" />
        <el-table-column prop="contactPerson" label="联系人" width="120" />
        <el-table-column prop="contactPhone" label="联系电话" width="150" />
        <el-table-column prop="platformFeeRate" label="费率" width="100">
          <template #default="{ row }">{{ (row.platformFeeRate * 100).toFixed(2) }}%</template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === 'active' ? 'success' : 'danger'">
              {{ row.status === 'active' ? '启用' : '停用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="创建时间" />
      </el-table>

      <el-pagination
        v-if="total > 0"
        class="mt16"
        :current-page="page"
        :page-size="pageSize"
        :total="total"
        layout="total, prev, pager, next"
        @current-change="onPageChange"
      />
    </el-card>

    <el-dialog v-model="dialogVisible" title="新增商户" width="500px">
      <el-form :model="form" label-width="100px">
        <el-form-item label="商户名称">
          <el-input v-model="form.name" placeholder="请输入商户名称" />
        </el-form-item>
        <el-form-item label="联系人">
          <el-input v-model="form.contactPerson" placeholder="请输入联系人" />
        </el-form-item>
        <el-form-item label="联系电话">
          <el-input v-model="form.contactPhone" placeholder="请输入联系电话" />
        </el-form-item>
        <el-form-item label="平台费率">
          <el-input-number v-model="form.platformFeeRate" :precision="4" :step="0.001" :min="0" :max="1" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleCreate">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { Plus } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import request from '@/api/request';

const list = ref<any[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const loading = ref(false);
const dialogVisible = ref(false);

const form = reactive({
  name: '',
  contactPerson: '',
  contactPhone: '',
  platformFeeRate: 0.0038,
});

async function loadData() {
  loading.value = true;
  try {
    const res: any = await request.get('/api/merchants', { params: { page: page.value, pageSize: pageSize.value } });
    list.value = res.list || [];
    total.value = res.total || 0;
  } catch {
    // ignore
  } finally {
    loading.value = false;
  }
}

function onPageChange(p: number) {
  page.value = p;
  loadData();
}

async function handleCreate() {
  if (!form.name) {
    ElMessage.warning('请输入商户名称');
    return;
  }
  try {
    await request.post('/api/merchants', form);
    ElMessage.success('创建成功');
    dialogVisible.value = false;
    form.name = '';
    form.contactPerson = '';
    form.contactPhone = '';
    form.platformFeeRate = 0.0038;
    loadData();
  } catch {
    // error handled by interceptor
  }
}

onMounted(loadData);
</script>

<style scoped>
.header-bar { display: flex; justify-content: space-between; align-items: center; }
.mt16 { margin-top: 16px; }
</style>

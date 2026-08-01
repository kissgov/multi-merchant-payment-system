<template>
  <div class="roles-page">
    <el-card class="table-card" shadow="never">
      <div class="card-header">
        <span class="title">角色权限管理</span>
        <el-button v-hasPermi="'rbac:role_create'" type="primary" :icon="Plus" @click="openCreate">
          新增角色
        </el-button>
      </div>

      <el-table v-loading="loading" :data="tableData" border stripe style="width: 100%">
        <el-table-column prop="name" label="角色名称" min-width="140" show-overflow-tooltip />
        <el-table-column prop="code" label="编码" min-width="160" show-overflow-tooltip />
        <el-table-column prop="description" label="描述" min-width="180" show-overflow-tooltip>
          <template #default="{ row }">{{ row.description || '-' }}</template>
        </el-table-column>
        <el-table-column prop="dataScope" label="数据范围" width="130" align="center">
          <template #default="{ row }">{{ dataScopeLabel(row.dataScope) }}</template>
        </el-table-column>
        <el-table-column prop="isBuiltin" label="内置" width="90" align="center">
          <template #default="{ row }">
            <el-tag v-if="row.isBuiltin" type="success" size="small">内置</el-tag>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column prop="enabled" label="启用状态" width="110" align="center">
          <template #default="{ row }">
            <el-switch
              :model-value="row.enabled"
              :disabled="row.isBuiltin && !row.enabled"
              @change="(val) => handleToggleEnabled(row as RoleItem, Boolean(val))"
            />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="180" fixed="right" align="center">
          <template #default="{ row }">
            <el-button link type="primary" :icon="Setting" @click="openEdit(row as RoleItem)">编辑权限</el-button>
            <el-button
              link
              type="danger"
              :icon="Delete"
              :disabled="row.isBuiltin"
              @click="handleDelete(row as RoleItem)"
            >
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 编辑/新增弹窗 -->
    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? '编辑角色' : '新增角色'"
      width="720px"
      :close-on-click-modal="false"
      destroy-on-close
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="90px">
        <el-divider content-position="left">基本信息</el-divider>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="角色名称" prop="name">
              <el-input v-model="form.name" placeholder="请输入角色名称" maxlength="30" show-word-limit />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="数据范围" prop="dataScope">
              <el-select v-model="form.dataScope" placeholder="请选择" style="width: 100%">
                <el-option v-for="item in dataScopeOptions" :key="item.value" :label="item.label" :value="item.value" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="描述" prop="description">
          <el-input v-model="form.description" placeholder="请输入描述" maxlength="100" show-word-limit />
        </el-form-item>
        <el-form-item v-if="form.dataScope === 'multi_store'" label="授权门店" prop="customStoreIds">
          <el-select
            v-model="form.customStoreIds"
            multiple
            filterable
            placeholder="请选择门店"
            style="width: 100%"
          >
            <el-option v-for="item in storeOptions" :key="item.id" :label="item.name" :value="item.id" />
          </el-select>
        </el-form-item>

        <el-divider content-position="left">权限分配</el-divider>
        <div v-loading="treeLoading" class="tree-wrap">
          <el-tree
            ref="treeRef"
            :data="menuTree"
            :props="treeProps"
            node-key="id"
            show-checkbox
            :check-strictly="checkStrictly"
            :default-expand-all="false"
            :expand-on-click-node="false"
            highlight-current
          />
        </div>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, nextTick } from 'vue';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import { Plus, Delete, Setting } from '@element-plus/icons-vue';
import {
  getRoleList,
  getRoleDetail,
  createRole,
  updateRole,
  deleteRole,
  getAllMenus,
} from '@/api/rbac';
import { getStoreDropdown } from '@/api/store';

interface RoleItem {
  id: string;
  name: string;
  code: string;
  description?: string;
  dataScope: string;
  isBuiltin: boolean;
  enabled: boolean;
}

interface MenuNode {
  id: string;
  name: string;
  children?: MenuNode[];
}

interface StoreOption {
  id: string;
  name: string;
}

const dataScopeOptions = [
  { value: 'all', label: '全部数据' },
  { value: 'merchant_all', label: '商户全部数据' },
  { value: 'multi_store', label: '自定义门店' },
  { value: 'current_store', label: '当前门店' },
  { value: 'self', label: '仅本人' },
];

const dataScopeMap: Record<string, string> = dataScopeOptions.reduce(
  (acc, cur) => ((acc[cur.value] = cur.label), acc),
  {} as Record<string, string>,
);

const dataScopeLabel = (s: string) => dataScopeMap[s] || s || '-';

const loading = ref(false);
const tableData = ref<RoleItem[]>([]);

const dialogVisible = ref(false);
const isEdit = ref(false);
const submitting = ref(false);
const formRef = ref<FormInstance>();

const form = reactive({
  id: '',
  name: '',
  description: '',
  dataScope: 'self',
  customStoreIds: [] as string[],
});

const rules: FormRules = {
  name: [{ required: true, message: '请输入角色名称', trigger: 'blur' }],
  dataScope: [{ required: true, message: '请选择数据范围', trigger: 'change' }],
  customStoreIds: [
    {
      validator: (_rule, value, callback) => {
        if (form.dataScope === 'multi_store' && (!value || value.length === 0)) {
          callback(new Error('数据范围为自定义门店时请至少选择一个门店'));
        } else {
          callback();
        }
      },
      trigger: 'change',
    },
  ],
};

// 权限树
const treeRef = ref();
const menuTree = ref<MenuNode[]>([]);
const treeLoading = ref(false);
const checkStrictly = ref(false);
const treeProps = { label: 'name', children: 'children' };

// 门店下拉
const storeOptions = ref<StoreOption[]>([]);

async function loadRoles() {
  loading.value = true;
  try {
    const res: any = await getRoleList({ pageSize: 999 });
    tableData.value = Array.isArray(res) ? res : res?.list || [];
  } catch {
    tableData.value = [];
  } finally {
    loading.value = false;
  }
}

async function loadMenuTree() {
  if (menuTree.value.length > 0) return;
  treeLoading.value = true;
  try {
    const res: any = await getAllMenus();
    menuTree.value = Array.isArray(res) ? res : res?.list || [];
  } catch {
    menuTree.value = [];
  } finally {
    treeLoading.value = false;
  }
}

async function loadStoreOptions() {
  try {
    const res: any = await getStoreDropdown();
    storeOptions.value = Array.isArray(res) ? res : res?.list || [];
  } catch {
    storeOptions.value = [];
  }
}

function resetForm() {
  form.id = '';
  form.name = '';
  form.description = '';
  form.dataScope = 'self';
  form.customStoreIds = [];
  formRef.value?.clearValidate();
  treeRef.value?.setCheckedKeys([]);
}

async function openCreate() {
  isEdit.value = false;
  resetForm();
  dialogVisible.value = true;
  await Promise.all([loadMenuTree(), loadStoreOptions()]);
  await nextTick();
  treeRef.value?.setCheckedKeys([]);
}

async function openEdit(row: RoleItem) {
  isEdit.value = true;
  resetForm();
  dialogVisible.value = true;
  await Promise.all([loadMenuTree(), loadStoreOptions()]);

  try {
    const detail: any = await getRoleDetail(row.id);
    form.id = row.id;
    form.name = detail?.name ?? row.name;
    form.description = detail?.description ?? row.description ?? '';
    form.dataScope = detail?.dataScope ?? row.dataScope ?? 'self';
    form.customStoreIds = detail?.customStoreIds ?? [];

    // 回显权限树：临时关闭父子联动以精确回显
    const menuIds: string[] = detail?.menuIds || [];
    checkStrictly.value = true;
    await nextTick();
    treeRef.value?.setCheckedKeys(menuIds);
    await nextTick();
    checkStrictly.value = false;
  } catch {
    ElMessage.error('获取角色详情失败');
  }
}

async function handleSubmit() {
  try {
    await formRef.value?.validate();
  } catch {
    return;
  }

  const checkedKeys = treeRef.value?.getCheckedKeys() || [];
  const halfCheckedKeys = treeRef.value?.getHalfCheckedKeys() || [];
  const menuIds = [...checkedKeys, ...halfCheckedKeys];

  if (menuIds.length === 0) {
    ElMessage.warning('请至少分配一项权限');
    return;
  }

  submitting.value = true;
  try {
    const payload: any = {
      name: form.name,
      description: form.description,
      dataScope: form.dataScope,
      menuIds,
    };
    if (form.dataScope === 'multi_store') {
      payload.customStoreIds = form.customStoreIds;
    }

    if (isEdit.value) {
      await updateRole(form.id, payload);
      ElMessage.success('更新成功');
    } else {
      await createRole(payload);
      ElMessage.success('创建成功');
    }
    dialogVisible.value = false;
    loadRoles();
  } finally {
    submitting.value = false;
  }
}

async function handleToggleEnabled(row: RoleItem, val: boolean) {
  try {
    await updateRole(row.id, { enabled: val });
    row.enabled = val;
    ElMessage.success(val ? '已启用' : '已禁用');
  } catch {
    // 失败保持原状
  }
}

async function handleDelete(row: RoleItem) {
  if (row.isBuiltin) {
    ElMessage.warning('内置角色不可删除');
    return;
  }
  try {
    await ElMessageBox.confirm(`确认删除角色「${row.name}」？`, '提示', { type: 'warning' });
  } catch {
    return;
  }
  try {
    await deleteRole(row.id);
    ElMessage.success('删除成功');
    loadRoles();
  } catch {
    // 错误已由拦截器提示
  }
}

onMounted(() => {
  loadRoles();
});
</script>

<style lang="scss" scoped>
.roles-page {
  padding: 16px;

  .table-card {
    .card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16px;

      .title {
        font-size: 16px;
        font-weight: 600;
        color: #303133;
      }
    }
  }

  .tree-wrap {
    max-height: 320px;
    overflow: auto;
    padding: 8px 12px;
    border: 1px solid #ebeef5;
    border-radius: 4px;
    background: #fafafa;
  }
}
</style>

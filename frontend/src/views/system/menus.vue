<template>
  <div class="menu-mgmt">
    <el-card shadow="never">
      <template #header>
        <span>菜单管理</span>
      </template>
      <el-alert title="菜单权限由后端初始化自动生成，如需调整请直接修改数据库或后端种子数据。" type="info" :closable="false" show-icon />
      <el-table :data="menuTree" row-key="id" border default-expand-all class="mt16">
        <el-table-column prop="name" label="名称" width="200" />
        <el-table-column prop="path" label="路径" width="200" />
        <el-table-column prop="component" label="组件" width="200" />
        <el-table-column prop="permKey" label="权限标识" width="200" />
        <el-table-column prop="type" label="类型" width="100" />
        <el-table-column prop="sort" label="排序" width="80" />
        <el-table-column prop="icon" label="图标" width="100" />
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { getAllMenus } from '@/api/rbac';

const menuTree = ref<any[]>([]);

onMounted(async () => {
  try {
    const res: any = await getAllMenus(true);
    menuTree.value = res || [];
  } catch {
    // ignore
  }
});
</script>

<style scoped>
.mt16 { margin-top: 16px; }
</style>

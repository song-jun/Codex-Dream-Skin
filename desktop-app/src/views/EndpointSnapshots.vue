<!--
  组件名称：EndpointSnapshots
  组件描述：管理 API Workbench 的接口对比快照；属性：无；事件：无；异常：本地存储不可用时展示为空列表。
-->
<template>
  <section class="snapshot-page">
    <header class="snapshot-header">
      <div>
        <h2>{{ endpointSnapshotUi.title }}</h2>
        <p>{{ endpointSnapshotUi.description }}</p>
      </div>
      <el-button :disabled="snapshots.length === 0" plain type="danger" @click="clearSnapshots">
        <el-icon><Delete /></el-icon>
        <span>{{ endpointSnapshotUi.clear }}</span>
      </el-button>
    </header>

    <el-empty v-if="snapshots.length === 0" :description="endpointSnapshotUi.empty" />
    <div v-else class="snapshot-list">
      <article v-for="snapshot in snapshots" :key="snapshot.key" class="snapshot-item">
        <div class="snapshot-main">
          <span class="snapshot-kind">{{ getSnapshotKind(snapshot.key) }}</span>
          <strong :title="getSnapshotName(snapshot.key)">{{ getSnapshotName(snapshot.key) }}</strong>
          <span>{{ snapshot.endpointCount }} {{ endpointSnapshotUi.endpointCount }}</span>
          <span :title="endpointSnapshotUi.updatedAt">{{ formatEndpointSnapshotTime(snapshot.updatedAt) }}</span>
        </div>
        <div class="snapshot-actions">
          <el-tooltip :content="endpointSnapshotUi.generate" placement="top">
            <el-button
              :aria-label="endpointSnapshotUi.generate"
              :disabled="!snapshot.hasDocument"
              circle
              text
              type="primary"
              @click="generateSnapshot(snapshot)"
            >
              <el-icon><MagicStick /></el-icon>
            </el-button>
          </el-tooltip>
          <el-tooltip :content="endpointSnapshotUi.delete" placement="top">
            <el-button :aria-label="endpointSnapshotUi.delete" text type="danger" @click="removeSnapshot(snapshot.key)">
              <el-icon><Delete /></el-icon>
            </el-button>
          </el-tooltip>
        </div>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
/** 接口快照工作区页面逻辑。 */
import { ref } from "vue";
import { ElMessage } from "element-plus";
import { Delete, MagicStick } from "@element-plus/icons-vue";
import router from "@/router";
import { useDocStore } from "@/stores/doc";
import {
  clearEndpointSnapshots,
  getEndpointSnapshotDocument,
  listEndpointSnapshots,
  removeEndpointSnapshot,
  type EndpointSnapshotRecord,
} from "@/core/endpointDiff";
import {
  endpointSnapshotUi,
  formatEndpointSnapshotTime,
} from "@/components/snapshots/endpointSnapshotUi";

/** 当前接口快照列表，操作后从本地存储重新读取。 */
const snapshots = ref<EndpointSnapshotRecord[]>(listEndpointSnapshots());
const docStore = useDocStore();

/** 从快照键中提取供用户识别的来源名称。 */
function getSnapshotName(key: string): string {
  return key.startsWith("file:") ? key.slice("file:".length) : key;
}

/** 根据快照键区分本地 JSON 文件和远程接口地址。 */
function getSnapshotKind(key: string): string {
  return key.startsWith("file:") ? endpointSnapshotUi.filePrefix : endpointSnapshotUi.urlPrefix;
}

/**
 * 恢复快照中的完整文档并跳转到代码生成页面。
 * @param snapshot 用户选择的快照摘要。
 */
function generateSnapshot(snapshot: EndpointSnapshotRecord): void {
  const document = getEndpointSnapshotDocument(snapshot.key);
  if (!document) {
    ElMessage.warning(endpointSnapshotUi.legacySnapshot);
    return;
  }
  docStore.loadSnapshot(
    document,
    snapshot.key.startsWith("file:") ? getSnapshotName(snapshot.key) : undefined,
  );
  ElMessage.success(endpointSnapshotUi.generateSuccess);
  void router.push({ name: "api-workbench-generate" });
}

/** 删除单条快照并刷新列表。 */
function removeSnapshot(key: string): void {
  removeEndpointSnapshot(key);
  snapshots.value = listEndpointSnapshots();
}

/** 清空全部快照并刷新列表。 */
function clearSnapshots(): void {
  clearEndpointSnapshots();
  snapshots.value = [];
}
</script>

<style scoped>
.snapshot-page { display: grid; gap: 20px; max-width: 1120px; margin: 0 auto; padding: 28px; }
.snapshot-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; }
.snapshot-header h2 { margin: 0 0 8px; color: var(--text-primary); font-size: 24px; }
.snapshot-header p { margin: 0; color: var(--text-secondary); line-height: 1.6; }
.snapshot-list { display: grid; gap: 8px; }
.snapshot-item { display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: 56px; padding: 10px 14px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-card, #fff); }
.snapshot-main { display: grid; grid-template-columns: 72px minmax(0, 1fr) auto minmax(188px, auto); align-items: center; gap: 12px; min-width: 0; width: 100%; }
.snapshot-actions { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
.snapshot-kind { color: var(--text-secondary); font-size: 12px; }
.snapshot-main strong { overflow: hidden; color: var(--text-primary); text-overflow: ellipsis; white-space: nowrap; }
.snapshot-main > span:not(.snapshot-kind) { color: var(--text-secondary); font-size: 13px; white-space: nowrap; }
@media (max-width: 720px) { .snapshot-page { padding: 20px; } .snapshot-header { display: grid; } .snapshot-item { align-items: flex-end; } .snapshot-main { grid-template-columns: minmax(0, 1fr) auto; } .snapshot-kind { grid-column: 1 / -1; } .snapshot-main > span:last-child { grid-column: 1 / -1; } }
</style>

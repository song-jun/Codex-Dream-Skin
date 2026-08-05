<template>
  <el-dialog
    v-model="visible"
    title="设置"
    width="1000px"
    :close-on-click-modal="false"
    @closed="onClosed"
  >
    <el-tabs v-model="tab">
      <!-- 调用配置 -->
      <el-tab-pane label="调用配置" name="invoke">
        <el-form :model="form" label-width="120px" size="default">
          <el-form-item label="API 基础 URL">
            <el-input v-model="form.baseUrl" placeholder="例如 http://host/platform" />
            <div class="form-tip">完整地址，含协议+主机+路径，优先级最高</div>
          </el-form-item>
          <el-form-item label="业务前缀">
            <el-input v-model="form.urlPrefix" placeholder="例如 /platform" />
            <div class="form-tip">仅路径；当 baseUrl 为空时拼到 apiUrl 的 origin 后面</div>
          </el-form-item>
          <el-form-item label="登录路径">
            <el-input v-model="form.loginPath" />
          </el-form-item>
          <el-form-item label="用户信息路径">
            <el-input v-model="form.userInfoPath" />
          </el-form-item>
          <el-form-item label="超时(ms)">
            <el-input-number v-model="form.timeout" :min="1000" :step="1000" />
          </el-form-item>
        </el-form>
      </el-tab-pane>

      <!-- 环境变量（可编辑） -->
      <el-tab-pane label="环境变量" name="env">
        <div class="env-toolbar">
          <div class="form-tip">来自 .env 文件，新增/编辑后立即写盘，并同步到进程环境</div>
          <div class="env-toolbar-actions">
            <el-button size="small" type="primary" @click="onAddRow">
              <el-icon><Plus /></el-icon>
              <span>新增</span>
            </el-button>
            <el-button
              size="small"
              type="warning"
              plain
              :disabled="!inElectron"
              @click="onResetEnv"
              title="从 .env.example 恢复默认配置"
            >
              <el-icon><RefreshLeft /></el-icon>
              <span>重置为默认</span>
            </el-button>
          </div>
        </div>

        <el-table :key="reloadTick" :data="envRows" size="small" border class="env-table">
          <el-table-column label="变量名" width="280">
            <template #default="{ row }">
              <el-input
                v-model="row.key"
                size="small"
                placeholder="OPENAPI_XXX"
                spellcheck="false"
              />
            </template>
          </el-table-column>
          <el-table-column label="值">
            <template #default="{ row }">
              <el-input
                v-model="row.value"
                size="small"
                placeholder="value"
                spellcheck="false"
              />
            </template>
          </el-table-column>
          <el-table-column label="描述" min-width="220">
            <template #default="{ row }">
              <el-input
                v-model="row.description"
                size="small"
                placeholder="可选，保存时会作为 # 注释行写入 .env"
                spellcheck="false"
              />
            </template>
          </el-table-column>
          <el-table-column label="操作" width="80" align="center" fixed="right">
            <template #default="{ $index }">
              <el-button
                size="small"
                type="danger"
                link
                @click="onRemoveRow($index)"
              >
                <el-icon><Delete /></el-icon>
                <span>删除</span>
              </el-button>
            </template>
          </el-table-column>
        </el-table>

        <el-alert
          v-if="envError"
          :title="envError"
          type="error"
          :closable="false"
          show-icon
          class="env-error"
        />

        <el-alert
          title="注意：变量名以 OPENAPI_ 开头才会被前端读取"
          type="info"
          :closable="false"
          show-icon
          class="env-hint"
        />
      </el-tab-pane>
    </el-tabs>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button v-if="tab === 'invoke'" type="primary" @click="onSaveInvoke">保存调用配置</el-button>
      <el-button
        v-else
        type="primary"
        :loading="envSaving"
        :title="inElectron ? '保存到 .env 文件' : '保存到浏览器 localStorage（仅当前浏览器有效）'"
        @click="onSaveEnv"
      >
        保存到 .env
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch, computed, nextTick } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Delete, Plus, RefreshLeft } from '@element-plus/icons-vue';
import { useConfigStore } from '@/stores/config';
import { reloadEnv } from '@/core/env';

// localStorage 集中存储 key（避免 OPENAPI_* 污染顶层 namespace）
const ENV_STORAGE_KEY = 'apiWorkbench:env';
const TRANSITION_LOADING_KEY = 'codexDreamSkin:transition-loading';
const TRANSITION_LOADING_EVENT = 'codexDreamSkin:transition-loading';
const TRANSITION_LOADING_END_EVENT = 'codexDreamSkin:transition-loading-end';

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  (e: 'saved'): void;
}>();

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v)
});
// 模板里不能用 window.*（Vue 实例不暴露 window），包成 computed
const inElectron = computed(() => typeof window !== 'undefined' && typeof window.electronAPI?.resetEnv === 'function');

function startTransitionLoading() {
  sessionStorage.setItem(TRANSITION_LOADING_KEY, '1');
  window.dispatchEvent(new Event(TRANSITION_LOADING_EVENT));
}

function stopTransitionLoading() {
  sessionStorage.removeItem(TRANSITION_LOADING_KEY);
  window.dispatchEvent(new Event(TRANSITION_LOADING_END_EVENT));
}

const tab = ref('invoke');
const configStore = useConfigStore();

const form = ref({ ...configStore.config });
// reloadTick：每次打开 dialog 自增，绑到 el-table 的 :key，强制重建（解决编辑后行不刷新的问题）
const reloadTick = ref(0);
watch(
  () => props.modelValue,
  (v) => {
    if (v) {
      form.value = { ...configStore.config };
      // 先清空再加载，确保 el-input v-model 不会 hold 旧 row 引用
      envRows.value = [];
      reloadTick.value++;
      nextTick().then(() => loadEnvRows());
    }
  }
);

// ===== 调用配置 =====
function onSaveInvoke() {
  configStore.config.baseUrl = form.value.baseUrl;
  configStore.config.urlPrefix = form.value.urlPrefix;
  configStore.config.loginPath = form.value.loginPath;
  configStore.config.userInfoPath = form.value.userInfoPath;
  configStore.config.timeout = form.value.timeout;
  configStore.save();
  visible.value = false;
  ElMessage.success('调用配置已保存');
}

// ===== 环境变量 =====
interface EnvRow {
  key: string;
  value: string;
  description: string;
}
const envRows = ref<EnvRow[]>([]);
const envError = ref('');
const envSaving = ref(false);

function loadEnvRows() {
  // 1) 优先：Electron 模式从 .env 文件直接读（含 description）
  if (window.electronAPI?.loadEnv) {
    window.electronAPI
      .loadEnv()
      .then((res) => {
        if (res.success && res.items && res.items.length > 0) {
          envRows.value = res.items.map((it) => ({
            key: it.key,
            value: it.value,
            description: it.description || '',
          }));
          envError.value = '';
          return;
        }
        // .env 不存在或解析为空，fallback 到运行时环境
        loadEnvRowsFromRuntime();
      })
      .catch(() => loadEnvRowsFromRuntime());
    return;
  }
  // 2) 浏览器模式：从 localStorage / __RUNTIME_ENV__ 读（无 description）
  loadEnvRowsFromRuntime();
}

function loadEnvRowsFromRuntime() {
  let env: Record<string, string> = {};
  try {
    const raw = localStorage.getItem(ENV_STORAGE_KEY);
    if (raw) env = JSON.parse(raw);
  } catch { /* ignore */ }
  if (Object.keys(env).length === 0) {
    env = (window.__RUNTIME_ENV__ || {}) as Record<string, string>;
  }
  // 去重：同时存在 OPENAPI_X 和 VITE_OPENAPI_X 时只保留 OPENAPI_X
  const map = new Map<string, string>();
  for (const [k, v] of Object.entries(env)) {
    if (k.startsWith('VITE_OPENAPI_')) {
      const realKey = k.replace(/^VITE_/, '');
      if (!map.has(realKey)) map.set(realKey, v);
    } else if (k.startsWith('OPENAPI_')) {
      map.set(k, v);
    }
  }
  envRows.value = Array.from(map.entries()).map(([key, value]) => ({ key, value, description: '' }));
  envError.value = '';
}

function onAddRow() {
  envRows.value.push({ key: '', value: '', description: '' });
}

function onRemoveRow(index: number) {
  envRows.value.splice(index, 1);
}

async function onSaveEnv() {
  envError.value = '';

  // 1) 校验
  const validRows = envRows.value.filter((r) => r.key.trim() !== '');
  const keys = validRows.map((r) => r.key.trim());
  const dup = keys.filter((k, i) => keys.indexOf(k) !== i);
  if (dup.length > 0) {
    envError.value = `存在重复的变量名：${dup.join(', ')}`;
    return;
  }
  if (validRows.length === 0) {
    envError.value = '至少保留一个有效变量';
    return;
  }

  // 2) 二次确认
  const isWeb = !window.electronAPI || typeof window.electronAPI.saveEnv !== 'function';
  const confirmMsg = isWeb
    ? `将把 ${validRows.length} 个环境变量保存到当前浏览器的 localStorage（仅本浏览器有效）。\n\n如需让其他设备/部署生效，请改用桌面端编辑 .env 文件。\n\n是否继续？`
    : `将把 ${validRows.length} 个环境变量写回 .env 文件，是否继续？`;
  try {
    await ElMessageBox.confirm(confirmMsg, '确认保存', {
      type: 'warning',
      confirmButtonText: '保存',
      cancelButtonText: '取消',
    });
  } catch {
    return; // 用户取消
  }

  envSaving.value = true;
  try {
    const items = validRows.map((r) => ({ key: r.key.trim(), value: r.value, description: r.description || '' }));

    if (isWeb) {
      // === 网页端：写 localStorage 集中 key + 同步 __RUNTIME_ENV__ + reloadEnv 实时生效 ===
      // 1) 写集中 key
      const env: Record<string, string> = {};
      items.forEach((it) => { env[it.key] = it.value; });
      localStorage.setItem(ENV_STORAGE_KEY, JSON.stringify(env));
      // 2) 同步到 __RUNTIME_ENV__（含 VITE_ 镜像，兼容 import.meta.env 读取路径）
      const runtime = window.__RUNTIME_ENV__ || ({} as Record<string, string>);
      for (const k of Object.keys(runtime)) {
        if (k.startsWith('OPENAPI_') || k.startsWith('VITE_OPENAPI_')) delete runtime[k];
      }
      items.forEach((it) => {
        runtime[it.key] = it.value;
        runtime[`VITE_${it.key}`] = it.value;
      });
      window.__RUNTIME_ENV__ = runtime;
      // 3) **关键**：reloadEnv 让所有 import 端立即拿到新值（ES Module live binding）
      reloadEnv();
      ElMessage.success(`已保存 ${items.length} 个变量，立即生效`);
      visible.value = false;
      emit('saved');
      return;
    }

    // === 桌面端：调主进程 IPC 写 .env 文件 ===
    startTransitionLoading();
    const res = await window.electronAPI?.saveEnv(items);
    if (res && res.success) {
      // 同步更新 window.__RUNTIME_ENV__（桌面端 .env 已改 + 主进程 process.env 已更新）
      const env = (window.__RUNTIME_ENV__ || {}) as Record<string, string>;
      for (const k of Object.keys(env)) {
        if (k.startsWith('OPENAPI_') || k.startsWith('VITE_OPENAPI_')) delete env[k];
      }
      items.forEach((it) => {
        env[it.key] = it.value;
        env[`VITE_${it.key}`] = it.value;
      });
      window.__RUNTIME_ENV__ = env;
      // reloadEnv 让 import 端实时拿到新值
      reloadEnv();
      ElMessage.success('环境变量已保存到 .env，立即生效');
      visible.value = false;
      emit('saved');
    } else {
      stopTransitionLoading();
      envError.value = res?.error || '保存失败';
    }
  } catch (err) {
    stopTransitionLoading();
    envError.value = err instanceof Error ? err.message : String(err);
  } finally {
    envSaving.value = false;
  }
}

async function onResetEnv() {
  envError.value = '';
  if (!window.electronAPI?.resetEnv) {
    // === 网页端重置：清 localStorage 集中 key，reloadEnv 立即生效 ===
    const hasStored = !!localStorage.getItem(ENV_STORAGE_KEY);
    if (!hasStored) {
      ElMessage.info('当前没有自定义的环境变量需要重置');
      return;
    }
    try {
      await ElMessageBox.confirm(
        '将清空当前浏览器的自定义环境变量，恢复为默认。\n\n是否继续？',
        '确认重置',
        { type: 'warning', confirmButtonText: '重置', cancelButtonText: '取消' },
      );
    } catch {
      return;
    }
    localStorage.removeItem(ENV_STORAGE_KEY);
    // 清空 __RUNTIME_ENV__ 里的 OPENAPI_*
    const runtime = (window.__RUNTIME_ENV__ || {}) as Record<string, string>;
    for (const k of Object.keys(runtime)) {
      if (k.startsWith('OPENAPI_') || k.startsWith('VITE_OPENAPI_')) delete runtime[k];
    }
    // reloadEnv 让 import 端立即拿到默认值
    reloadEnv();
    ElMessage.success('已重置，立即生效');
    visible.value = false;
    emit('saved');
    return;
  }
  // 二次确认（重置会覆盖现有 .env，不可撤销）
  try {
    await ElMessageBox.confirm(
      '将 .env 恢复为 .env.example 的默认内容，现有自定义变量会被覆盖，是否继续？',
      '确认重置',
      { type: 'warning', confirmButtonText: '重置', cancelButtonText: '取消' },
    );
  } catch {
    return;
  }
  envSaving.value = true;
  try {
    const res = await window.electronAPI?.resetEnv();
    if (res.success && res.items) {
      // 用 .env.example 的 items 同步到 envRows（带 description）
      envRows.value = res.items.map((it) => ({
        key: it.key,
        value: it.value,
        description: it.description || '',
      }));
      // 同步到 window.__RUNTIME_ENV__
      const env = (window.__RUNTIME_ENV__ || {}) as Record<string, string>;
      for (const k of Object.keys(env)) {
        if (k.startsWith('OPENAPI_') || k.startsWith('VITE_OPENAPI_')) delete env[k];
      }
      for (const it of res.items) {
        env[it.key] = it.value;
        env[`VITE_${it.key}`] = it.value;
      }
      window.__RUNTIME_ENV__ = env;
      // reloadEnv 让 import 端实时拿到新值
      reloadEnv();
      ElMessage.success(`已重置为 ${res.items.length} 个默认变量，立即生效`);
      visible.value = false;
      emit('saved');
    } else {
      envError.value = res.error || '重置失败';
    }
  } catch (err) {
    envError.value = err instanceof Error ? err.message : String(err);
  } finally {
    envSaving.value = false;
  }
}

function onClosed() {
  tab.value = 'invoke';
  envError.value = '';
}
</script>

<style scoped>
.form-tip {
  color: #94a3b8;
  font-size: 12px;
  line-height: 1.5;
  margin-top: 4px;
}
.env-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.env-toolbar .form-tip {
  margin-top: 0;
}
.env-toolbar-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}
.env-table {
  margin-bottom: 12px;
}
.env-error {
  margin-bottom: 8px;
}
.env-hint {
  margin-top: 8px;
}
</style>

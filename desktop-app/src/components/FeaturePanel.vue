<!--
  组件名称：FeaturePanel
  组件职责：展示已授权的 API 与 Skin 功能入口。
  安全边界：API 区域只读展示连接状态，不读取或修改官方配置。
-->
<script setup lang="ts">
import { ref, watch } from "vue";
import { Connection, Monitor, RefreshRight, Setting } from "@element-plus/icons-vue";
import { useWorkbenchContext } from "../composables/useWorkbench";

type FeatureCategory = "api" | "skin";

const props = defineProps<{ category: FeatureCategory }>();
const emit = defineEmits<{ "update:category": [category: FeatureCategory] }>();
const selectedCategory = ref<FeatureCategory>(props.category);

const {
  snapshot,
  currentConnection,
  canPause,
  canResume,
  selectView,
  runAction,
  restoreSkin,
} = useWorkbenchContext();

watch(
  () => props.category,
  (category) => {
    selectedCategory.value = category;
  },
);

function selectCategory(value: string | undefined) {
  if (value !== "api" && value !== "skin") return;
  selectedCategory.value = value;
  emit("update:category", value);
}
</script>

<template>
  <section class="feature-page">
    <div class="feature-page-header">
      <div>
        <div class="eyebrow">FEATURES</div>
        <h2>功能</h2>
        <p>选择功能类别，查看已授权的 API 与 Skin 操作。</p>
      </div>
      <el-select
        :model-value="selectedCategory"
        class="feature-category-select"
        aria-label="功能类别"
        @change="selectCategory"
      >
        <el-option label="API" value="api" />
        <el-option label="Skin" value="skin" />
      </el-select>
    </div>

    <div v-if="selectedCategory === 'api'" class="feature-grid">
      <article class="feature-card">
        <div class="feature-card-icon"><Connection /></div>
        <div>
          <strong>连接状态</strong>
          <p>{{ snapshot?.codexRunning ? "Codex 正在运行" : "Codex 未运行" }}</p>
        </div>
        <span class="feature-card-value">{{ currentConnection?.endpoint ?? "未连接" }}</span>
      </article>
      <article class="feature-card feature-card-muted">
        <div class="feature-card-icon"><Setting /></div>
        <div>
          <strong>官方 API 配置</strong>
          <p>由 Codex 官方应用管理</p>
        </div>
        <span class="feature-card-note">本工具不读取或修改 API Key、Base URL 和提供商设置。</span>
      </article>
    </div>

    <div v-else class="feature-grid">
      <article class="feature-card">
        <div class="feature-card-icon"><Monitor /></div>
        <div>
          <strong>主题控制</strong>
          <p>切换主题、编辑外观参数和背景图片</p>
        </div>
        <el-button type="primary" @click="selectView('overview')">打开</el-button>
      </article>
      <article class="feature-card">
        <div class="feature-card-icon"><RefreshRight /></div>
        <div>
          <strong>运行控制</strong>
          <p>管理 Dream Skin 的当前注入状态</p>
        </div>
        <div class="feature-card-actions">
          <el-button v-if="canPause" :icon="RefreshRight" @click="runAction('pause', [], '皮肤已暂停。')">暂停</el-button>
          <el-button v-if="canResume" type="primary" :icon="RefreshRight" @click="runAction('resume', [], '皮肤已恢复。')">恢复</el-button>
          <el-button type="danger" plain @click="restoreSkin">恢复官方外观</el-button>
        </div>
      </article>
    </div>
  </section>
</template>

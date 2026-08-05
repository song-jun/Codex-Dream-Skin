<!-- 功能面板：在 Skin 与 API Workbench 之间切换。 -->
<script setup lang="ts">
import { ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Monitor, RefreshRight } from "@element-plus/icons-vue";
import ApiWorkbenchPanel from "../api-workbench/ApiWorkbenchPanel.vue";
import { useWorkbenchContext } from "../composables/useWorkbench";

type FeatureCategory = "api" | "skin";

const props = defineProps<{ category: FeatureCategory }>();
const emit = defineEmits<{ "update:category": [category: FeatureCategory] }>();
const selectedCategory = ref<FeatureCategory>(props.category);
const route = useRoute();
const router = useRouter();

const { canPause, canResume, selectView, runAction, restoreSkin } = useWorkbenchContext();

watch(
  () => props.category,
  (category) => {
    selectedCategory.value = category;
  },
);

watch(
  selectedCategory,
  (category) => {
    if (category === "api" && !route.path.startsWith("/api-workbench")) {
      void router.push("/api-workbench/doc");
    }
  },
  { immediate: true },
);

function selectCategory(value: string | undefined) {
  if (value !== "api" && value !== "skin") return;
  selectedCategory.value = value;
  emit("update:category", value);
}
</script>

<template>
  <section class="feature-page" :class="{ 'feature-page-api': selectedCategory === 'api' }">
    <div class="feature-page-header">
      <div>
        <div class="eyebrow">FEATURES</div>
        <h2>{{ selectedCategory === "api" ? "API Workbench" : "Codex Dream Skin" }}</h2>
        <p v-if="selectedCategory === 'api'">加载 OpenAPI 文档、生成 TypeScript API 代码并直接调用接口。</p>
        <p v-else>管理主题、背景图和 Dream Skin 运行状态。</p>
      </div>
      <el-select
        :model-value="selectedCategory"
        class="feature-category-select"
        aria-label="功能模块"
        @change="selectCategory"
      >
        <el-option label="API Workbench" value="api" />
        <el-option label="Codex Dream Skin" value="skin" />
      </el-select>
    </div>

    <ApiWorkbenchPanel v-if="selectedCategory === 'api'" />

    <div v-else class="feature-grid">
      <article class="feature-card">
        <div class="feature-card-icon"><Monitor /></div>
        <div>
          <strong>主题控制</strong>
          <p>切换主题、编辑外观参数和背景图片。</p>
        </div>
        <el-button type="primary" @click="selectView('overview')">打开</el-button>
      </article>
      <article class="feature-card">
        <div class="feature-card-icon"><RefreshRight /></div>
        <div>
          <strong>运行控制</strong>
          <p>管理 Dream Skin 当前注入状态。</p>
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

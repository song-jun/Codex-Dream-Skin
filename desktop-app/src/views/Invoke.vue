<template>
  <div class="page-container">
    <div class="page-header">
      <div>
        <div class="page-title">调用接口</div>
        <div class="sub-tip">登录认证后选择接口、编辑参数、发送请求并查看响应（带中文字段注释）</div>
      </div>
      <LoginForm
        :is-logged-in="isLoggedIn"
        :has-token="!!token"
        :username="userInfo?.name || userInfo?.username || ''"
        :is-logging-in="loginLoading"
        v-model="showLoginDialog"
        v-model:tab="loginTab"
        v-model:login-form="loginForm"
        v-model:token-input="tokenInput"
        @login="login"
        @logout="logout"
      />
    </div>

    <el-alert
      v-if="!docStore.doc"
      title="请先在「OpenAPI 文档」页加载文档"
      type="info"
      :closable="false"
    />

    <template v-else>
      <el-row :gutter="16" style="height: calc(100% - 80px);">
        <!-- 左：接口列表 -->
        <el-col :span="6" style="height: 100%;">
          <el-card shadow="never" class="card-full" body-style="height: 100%; padding: 12px; display: flex; flex-direction: column;">
            <el-input v-model="searchText" placeholder="搜索 tag/接口" size="small" clearable style="margin-bottom: 8px;">
              <template #prefix><el-icon><Search /></el-icon></template>
            </el-input>
            <el-scrollbar style="flex: 1;">
              <div v-for="t in filteredTags" :key="t.name" class="tag-block">
                <div class="tag-header" @click="toggleTag(t.name)">
                  <el-icon v-if="expandedTags[t.name]"><ArrowDown /></el-icon>
                  <el-icon v-else><ArrowRight /></el-icon>
                  <span class="tag-name">{{ t.name || '[无分组]' }}</span>
                  <el-tag size="small">{{ t.endpoints.length }}</el-tag>
                </div>
                <div v-if="expandedTags[t.name]" class="tag-endpoints">
                  <div
                    v-for="ep in t.endpoints"
                    :key="ep.path + ep.method"
                    :class="['endpoint-item', { active: selectedEndpoint && selectedEndpoint.path === ep.path && selectedEndpoint.method === ep.method }]"
                    @click="selectEndpoint(ep)"
                  >
                    <span :class="['method-tag', `method-${ep.method.toLowerCase()}`]">{{ ep.method.toUpperCase() }}</span>
                    <span class="ep-summary">{{ ep.summary || ep.path }}</span>
                  </div>
                </div>
              </div>
            </el-scrollbar>
          </el-card>
        </el-col>

        <!-- 中：请求参数 -->
        <el-col :span="9" style="height: 100%;">
          <RequestForm
            :selected-endpoint="selectedEndpoint"
            :param-list="paramList"
            :form-values="formValues"
            :request-form="requestForm"
            :is-invoking="isInvoking"
            :is-logged-in="isLoggedIn"
            @update:form-values="formValues = $event"
            @reset="resetParams"
            @invoke="invoke"
            @show-login="showLoginDialog = true"
          />
        </el-col>

        <!-- 右：响应结果 -->
        <el-col :span="9" style="height: 100%;">
          <ResponsePanel
            :response="response"
            :error="error"
            :is-invoking="isInvoking"
          />
        </el-col>
      </el-row>
    </template>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import LoginForm from '@/components/invoke/LoginForm.vue';
import RequestForm from '@/components/invoke/RequestForm.vue';
import ResponsePanel from '@/components/invoke/ResponsePanel.vue';
import { useInvoke } from '@/composables/useInvoke';

/**
 * Invoke 页面
 *
 * 状态/逻辑全部委派给 useInvoke composable；本组件只负责：
 * - 页面标题区（header + LoginForm 嵌入）
 * - 左栏：tag 分组 + 搜索 + 接口列表
 * - 中栏 / 右栏：组合 RequestForm / ResponsePanel
 */
const {
  docStore,
  // 认证
  isLoggedIn,
  token,
  userInfo,
  showLoginDialog,
  loginTab,
  loginForm,
  tokenInput,
  loginLoading,
  login,
  logout,
  // 接口选择
  searchText,
  expandedTags,
  selectedEndpoint,
  filteredTags,
  toggleTag,
  selectEndpoint,
  // 参数
  paramList,
  formValues,
  requestForm,
  resetParams,
  // 调用
  isInvoking,
  response,
  error,
  invoke,
  // 生命周期
  init
} = useInvoke();

onMounted(() => {
  init();
});
</script>

<style scoped>
.card-full { height: 100%; }
.sub-tip {
  color: #6b7280;
  font-size: 12px;
  margin-top: 4px;
}
.tag-block {
  margin-bottom: 4px;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
}
.tag-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  cursor: pointer;
  background: #f8fafc;
  user-select: none;
}
.tag-name {
  flex: 1;
  font-weight: 500;
  font-size: 13px;
}
.tag-endpoints {
  padding: 6px 10px;
}
.endpoint-item {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
  padding: 4px 6px;
  cursor: pointer;
  border-radius: 3px;
  font-size: 13px;
}
.endpoint-item:hover {
  background: #f1f5f9;
}
.endpoint-item.active {
  background: #dbeafe;
  color: var(--brand-primary);
}
.method-tag {
  display: inline-block;
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 3px;
  font-weight: 600;
  color: #fff;
}
/* .method-get/post/put/patch/delete 颜色统一在 styles/main.css 中定义（设计系统） */
.ep-summary {
  font-size: 13px;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>

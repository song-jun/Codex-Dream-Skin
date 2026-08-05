<template>
  <el-card shadow="never" class="card-full" body-style="height: 100%; padding: 12px; display: flex; flex-direction: column;">
    <template v-if="selectedEndpoint">
      <!-- 接口信息 -->
      <div class="endpoint-info">
        <div class="endpoint-title">
          <span :class="['method-tag', `method-${selectedEndpoint.method.toLowerCase()}`]">
            {{ selectedEndpoint.method.toUpperCase() }}
          </span>
          <span>{{ selectedEndpoint.summary }}</span>
        </div>
        <div class="endpoint-path">{{ selectedEndpoint.path }}</div>
        <div class="endpoint-meta">分组：{{ selectedEndpoint.tag || '无' }}</div>
      </div>

      <el-divider style="margin: 12px 0;" />

      <!-- 未登录：引导登录 -->
      <div v-if="!isLoggedIn" class="need-login">
        <el-empty :image-size="80" description="请先登录后再编辑参数和发送请求" />
        <el-button type="primary" @click="emit('show-login')">立即登录</el-button>
      </div>

      <!-- 已登录：参数编辑 -->
      <template v-else>
        <el-form
          v-if="paramList.length > 0"
          :model="formValues"
          label-position="top"
          size="default"
          class="param-form"
        >
          <el-form-item
            v-for="p in paramList"
            :key="p.name"
            :label="p.name"
            :required="p.required"
          >
            <template #label>
              <span>
                <el-tag :type="inOutTagType(p.in)" size="small" style="margin-right: 6px;">
                  {{ inOutLabel(p.in) }}
                </el-tag>
                <span>{{ p.name }}</span>
                <span v-if="p.required" style="color: #f56c6c; margin-left: 4px;">*</span>
                <span style="color: #94a3b8; margin-left: 6px; font-weight: normal;">{{ p.type }}</span>
              </span>
            </template>
            <el-input
              v-if="p.type === 'boolean'"
              :model-value="formValues[p.name]"
              placeholder="true / false"
              @update:model-value="(v: any) => updateField(p.name, v)"
            />
            <el-input-number
              v-else-if="p.type.includes('integer') || p.type.includes('number')"
              :model-value="formValues[p.name]"
              :controls="false"
              style="width: 100%;"
              @update:model-value="(v: any) => updateField(p.name, v)"
            />
            <el-input
              v-else
              :model-value="formValues[p.name]"
              :type="p.in === 'body' && p.description?.includes('JSON') ? 'textarea' : 'text'"
              :rows="p.in === 'body' ? 3 : 1"
              :placeholder="p.description || p.name"
              @update:model-value="(v: any) => updateField(p.name, v)"
            />
            <div v-if="p.description" class="param-desc">{{ p.description }}</div>
          </el-form-item>
        </el-form>
        <el-empty v-else :image-size="60" description="该接口无参数" />

        <div class="param-actions">
          <el-button @click="emit('reset')">重置</el-button>
          <el-button
            type="primary"
            :loading="isInvoking"
            :disabled="!canInvoke"
            @click="emit('invoke')"
          >
            <el-icon><Promotion /></el-icon>
            <span>发送请求</span>
          </el-button>
        </div>
      </template>
    </template>

    <el-empty v-else description="请从左侧选择一个接口" />
  </el-card>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { IEndpointInfo, IParamDisplayInfo } from '@/core/types';
import type { IRequestForm } from '@/composables/useInvoke';

/**
 * 请求参数面板
 * - 顶部：接口信息（method / URL / 摘要 / 分组）
 * - 中部：未登录 → 引导登录；已登录 → 自动生成的参数表单
 * - 底部：重置 / 发送
 *
 * 实际的 method/url/headers/params/body 由父组件从 useInvoke().requestForm 计算得到，
 * 本组件负责 UI 展示与编辑透传。
 */
const props = defineProps<{
  selectedEndpoint: IEndpointInfo | null;
  paramList: IParamDisplayInfo[];
  formValues: Record<string, any>;
  requestForm: IRequestForm;
  isInvoking: boolean;
  isLoggedIn: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:formValues', v: Record<string, any>): void;
  (e: 'reset'): void;
  (e: 'invoke'): void;
  (e: 'show-login'): void;
}>();

const canInvoke = computed(() => !!props.selectedEndpoint && props.isLoggedIn);

function updateField(name: string, value: any) {
  emit('update:formValues', { ...props.formValues, [name]: value });
}

function inOutTagType(inLoc: string) {
  if (inLoc === 'path') return 'danger';
  if (inLoc === 'query') return 'warning';
  return 'primary';
}

function inOutLabel(inLoc: string) {
  if (inLoc === 'path') return 'PATH';
  if (inLoc === 'query') return 'QUERY';
  return 'BODY';
}
</script>

<style scoped>
.card-full { height: 100%; }
.endpoint-info {
  padding: 4px 0;
}
.endpoint-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 600;
  color: #111827;
}
.endpoint-path {
  font-family: 'Fira Code', 'Consolas', monospace;
  color: #475569;
  margin: 6px 0;
  font-size: 12px;
  word-break: break-all;
}
.endpoint-meta {
  font-size: 12px;
  color: #94a3b8;
}
.param-form {
  flex: 1;
  overflow: auto;
}
.param-desc {
  font-size: 12px;
  color: #94a3b8;
  line-height: 1.5;
  margin-top: 2px;
}
.param-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid #e5e7eb;
  margin-top: 12px;
}
.need-login {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 16px;
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
</style>

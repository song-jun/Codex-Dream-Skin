<template>
  <!-- 头部认证信息：已登录显示用户名 + 登出；未登录显示登录按钮 -->
  <div class="auth-info">
    <el-tag v-if="isLoggedIn" type="success" size="small">
      <el-icon><User /></el-icon>
      <span>{{ username || '已登录' }}</span>
    </el-tag>
    <el-tag v-else-if="hasToken" type="warning" size="small">Token 已加载</el-tag>
    <el-tag v-else type="info" size="small">未登录</el-tag>

    <el-button v-if="isLoggedIn" size="small" @click="emit('logout')">
      <el-icon><SwitchButton /></el-icon>
      <span>退出</span>
    </el-button>
    <el-button v-else size="small" type="primary" @click="showDialog = true">
      <el-icon><Key /></el-icon>
      <span>登录</span>
    </el-button>
  </div>

  <!-- 登录弹窗：用户名密码 / Token 二选一 -->
  <el-dialog
    v-model="showDialog"
    title="登录认证"
    width="420px"
    :close-on-click-modal="false"
  >
    <el-tabs v-model="activeTab">
      <el-tab-pane label="用户名密码" name="login">
        <el-form :model="form" label-width="80px" size="default">
          <el-form-item label="用户名">
            <el-input
              :model-value="form.username"
              @update:model-value="(v: string) => updateFormField('username', v)"
              @keyup.enter="emit('login')"
            />
          </el-form-item>
          <el-form-item label="密码">
            <el-input
              :model-value="form.password"
              type="password"
              show-password
              @update:model-value="(v: string) => updateFormField('password', v)"
              @keyup.enter="emit('login')"
            />
          </el-form-item>
        </el-form>
      </el-tab-pane>
      <el-tab-pane label="Token" name="token">
        <el-form label-width="80px" size="default">
          <el-form-item label="Token">
            <el-input
              :model-value="tokenValue"
              type="textarea"
              :rows="3"
              placeholder="粘贴 Token"
              @update:model-value="emit('update:tokenInput', $event)"
            />
          </el-form-item>
        </el-form>
      </el-tab-pane>
    </el-tabs>
    <template #footer>
      <el-button @click="showDialog = false">取消</el-button>
      <el-button type="primary" :loading="isLoggingIn" @click="emit('login')">登录</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Key, SwitchButton, User } from '@element-plus/icons-vue';

/**
 * 登录/登出展示与弹窗组件
 * - 头部：已登录显示用户名 + 登出按钮；未登录显示登录按钮
 * - 弹窗：用户名密码 / Token 两种登录方式
 *
 * 表单状态由父组件（useInvoke）持有，本组件只负责 UI 渲染与交互透传
 */
const props = defineProps<{
  isLoggedIn: boolean;
  /** 兼容：仅 token 但还没拿到 userInfo 时显示黄色 tag */
  hasToken?: boolean;
  username: string;
  isLoggingIn: boolean;
  /** dialog 可见性 v-model */
  modelValue: boolean;
  /** tab 标识（'login' | 'token'）v-model */
  tab: 'login' | 'token';
  loginForm: { username: string; password: string };
  tokenInput: string;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  (e: 'update:tab', v: 'login' | 'token'): void;
  (e: 'update:loginForm', v: { username: string; password: string }): void;
  (e: 'update:tokenInput', v: string): void;
  (e: 'login'): void;
  (e: 'logout'): void;
}>();

const showDialog = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v)
});

const activeTab = computed({
  get: () => props.tab,
  set: (v) => emit('update:tab', v as 'login' | 'token')
});

const form = computed(() => props.loginForm);
const tokenValue = computed(() => props.tokenInput);

function updateFormField(key: 'username' | 'password', value: string) {
  emit('update:loginForm', { ...props.loginForm, [key]: value });
}
</script>

<style scoped>
.auth-info {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>

<template>
  <el-dialog
    :model-value="modelValue"
    title="设置业务前缀"
    width="420px"
    @update:model-value="(v: boolean) => $emit('update:modelValue', v)"
  >
    <el-form label-width="80px">
      <el-form-item label="URL 前缀">
        <el-input
          :model-value="draft"
          placeholder="例如 /platform"
          @update:model-value="(v: any) => $emit('update:draft', v)"
        />
      </el-form-item>
      <el-alert type="info" :closable="false" show-icon>
        留空表示不添加前缀；OpenAPI 文档地址中检测到的业务前缀会作为参考
      </el-alert>
    </el-form>
    <template #footer>
      <el-button @click="$emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" @click="$emit('confirm')">确定</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
/**
 * UrlPrefixDialog.vue - URL 业务前缀弹窗
 * - modelValue 控制显示
 * - draft 是双向绑定的输入草稿
 * - confirm 由父级处理写回 urlPrefix
 */
defineProps<{
  modelValue: boolean;
  draft: string;
}>();

defineEmits<{
  (e: "update:modelValue", v: boolean): void;
  (e: "update:draft", v: string): void;
  (e: "confirm"): void;
}>();
</script>

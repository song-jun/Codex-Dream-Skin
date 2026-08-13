<!-- 自定义 Swagger 加载面板：读取服务配置后选择服务并加载对应 OpenAPI 文档。 -->
<template>
  <el-form label-position="top" size="default" class="custom-swagger-form">
    <el-form-item :label="customSwaggerLoaderUi.domainLabel">
      <el-input
        :model-value="domain"
        :placeholder="customSwaggerLoaderUi.domainPlaceholder"
        @update:model-value="emit('update:domain', $event)"
      />
    </el-form-item>
    <el-form-item :label="customSwaggerLoaderUi.configLabel">
      <el-input
        :model-value="configPath"
        :placeholder="customSwaggerLoaderUi.configPlaceholder"
        @update:model-value="emit('update:configPath', $event)"
      />
    </el-form-item>
    <el-form-item :label="customSwaggerLoaderUi.serviceLabel">
      <el-select
        :model-value="selectedServiceUrl"
        class="custom-swagger-service"
        clearable
        :disabled="services.length === 0"
        :placeholder="customSwaggerLoaderUi.servicePlaceholder"
        @update:model-value="emit('update:selectedServiceUrl', $event)"
      >
        <el-option
          v-for="service in services"
          :key="service.url"
          :label="service.name"
          :value="service.url"
        />
      </el-select>
    </el-form-item>
    <div class="custom-swagger-actions">
      <el-button
        type="primary"
        :loading="isFetching"
        @click="emit('fetchServices')"
      >
        <el-icon><Connection /></el-icon>
        <span>{{ customSwaggerLoaderUi.fetchServices }}</span>
      </el-button>
      <el-button
        type="primary"
        plain
        :disabled="!selectedServiceUrl"
        :loading="isLoadingDocument"
        @click="emit('loadDocument')"
      >
        <el-icon><Download /></el-icon>
        <span>{{ customSwaggerLoaderUi.loadDocument }}</span>
      </el-button>
      <el-button
        type="primary"
        :disabled="!hasLoaded"
        @click="emit('generate')"
      >
        <el-icon><MagicStick /></el-icon>
        <span>{{ customSwaggerLoaderUi.generateCode }}</span>
      </el-button>
    </div>
    <el-empty
      v-if="hasFetched && services.length === 0"
      :description="customSwaggerLoaderUi.emptyServices"
      :image-size="56"
    />
  </el-form>
</template>

<script setup lang="ts">
/** 自定义 Swagger 加载面板的输入、选择与动作事件定义。 */
import { Connection, Download, MagicStick } from "@element-plus/icons-vue";
import type { SwaggerServiceOption } from "@/core/swaggerConfig";
import { customSwaggerLoaderUi } from "@/components/docviewer/customSwaggerLoaderUi";

defineProps<{
  domain: string;
  configPath: string;
  selectedServiceUrl: string;
  services: SwaggerServiceOption[];
  isFetching: boolean;
  isLoadingDocument: boolean;
  hasFetched: boolean;
  hasLoaded: boolean;
}>();

const emit = defineEmits<{
  (e: "update:domain", value: string): void;
  (e: "update:configPath", value: string): void;
  (e: "update:selectedServiceUrl", value: string): void;
  (e: "fetchServices"): void;
  (e: "loadDocument"): void;
  (e: "generate"): void;
}>();
</script>

<style scoped lang="scss">
.custom-swagger-form {
  max-width: 560px;
}
.custom-swagger-service {
  width: 100%;
}
.custom-swagger-actions {
  margin-top: 12px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  .el-button + .el-button {
    margin-left: 0;
  }
}
</style>

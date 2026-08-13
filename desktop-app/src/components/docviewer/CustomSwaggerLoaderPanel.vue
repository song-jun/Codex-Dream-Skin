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
    <div v-if="selectedServiceUrl" class="custom-swagger-addresses">
      <div class="custom-swagger-address-row">
        <div class="custom-swagger-address-content">
          <span>{{ customSwaggerLoaderUi.configAddressLabel }}</span>
          <code :title="configAddress">{{ configAddress }}</code>
        </div>
        <el-tooltip :content="customSwaggerLoaderUi.copyConfigAddress" placement="top">
          <el-button
            :icon="CopyDocument"
            text
            circle
            :disabled="!configAddress"
            :aria-label="customSwaggerLoaderUi.copyConfigAddress"
            @click="copyAddress(configAddress, customSwaggerLoaderUi.configAddressCopied)"
          />
        </el-tooltip>
      </div>
      <div class="custom-swagger-address-row">
        <div class="custom-swagger-address-content">
          <span>{{ customSwaggerLoaderUi.documentAddressLabel }}</span>
          <code :title="documentAddress">{{ documentAddress }}</code>
        </div>
        <el-tooltip :content="customSwaggerLoaderUi.copyDocumentAddress" placement="top">
          <el-button
            :icon="CopyDocument"
            text
            circle
            :disabled="!documentAddress"
            :aria-label="customSwaggerLoaderUi.copyDocumentAddress"
            @click="copyAddress(documentAddress, customSwaggerLoaderUi.documentAddressCopied)"
          />
        </el-tooltip>
      </div>
    </div>
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
import { computed } from "vue";
import { Connection, CopyDocument, Download, MagicStick } from "@element-plus/icons-vue";
import { buildSwaggerUrl, type SwaggerServiceOption } from "@/core/swaggerConfig";
import { customSwaggerLoaderUi } from "@/components/docviewer/customSwaggerLoaderUi";
import { copyToClipboard } from "@/utils/clipboard";

const props = defineProps<{
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

/** 根据当前填写的域名与路径生成完整地址，输入未完成时不展示无效内容。 */
function resolveAddress(path: string): string {
  try {
    return buildSwaggerUrl(props.domain, path);
  } catch {
    return "";
  }
}

const configAddress = computed(() => resolveAddress(props.configPath));
const documentAddress = computed(() => resolveAddress(props.selectedServiceUrl));

/** 复制当前行地址，并由统一剪贴板工具反馈结果。 */
function copyAddress(value: string, message: string): void {
  if (value) void copyToClipboard(value, message);
}
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
.custom-swagger-addresses {
  display: grid;
  gap: 8px;
  margin-top: 4px;
}
.custom-swagger-address-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 8px 10px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 4px;
  background: var(--el-fill-color-lighter);
}
.custom-swagger-address-content {
  display: grid;
  gap: 2px;
  min-width: 0;
  flex: 1;
}
.custom-swagger-address-content span {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.custom-swagger-address-content code {
  overflow: hidden;
  color: var(--el-text-color-primary);
  font-family: "Fira Code", "Consolas", monospace;
  font-size: 12px;
  line-height: 18px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>

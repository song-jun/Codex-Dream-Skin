import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { IOpenAPIDocument, IEndpointInfo } from '@/core/types';
import { fetchOpenAPIDocument } from '@/core/fetcher';
import { parseEndpoints, extractTags } from '@/core/parser';
import { formatJson } from '@/utils/formatJson';

export const useDocStore = defineStore('doc', () => {
  const doc = ref<IOpenAPIDocument | null>(null);
  const sourceUrl = ref<string>('');
  const sourceFileName = ref<string>('');
  const rawJson = ref<string>('');
  const loading = ref(false);
  const error = ref<string>('');
  const newEndpointKeys = ref<string[]>([]);
  const missingEndpointKeys = ref<string[]>([]);
  const missingEndpoints = ref<IEndpointInfo[]>([]);
  const showOnlyNewEndpoints = ref(false);
  const showOnlyMissingEndpoints = ref(false);

  const endpoints = computed<IEndpointInfo[]>(() => (doc.value ? parseEndpoints(doc.value) : []));
  const tags = computed<string[]>(() => (doc.value ? extractTags(doc.value) : []));

  /**
   * 加载文档：优先用 url，失败/无 url 时回退到 rawJson
   */
  async function loadFromUrl(url: string) {
    if (!url) {
      error.value = '请输入 API 文档地址';
      return false;
    }
    loading.value = true;
    error.value = '';
    try {
      const res = await fetchOpenAPIDocument(url);
      if (!res.success || !res.data) {
        error.value = res.error || '获取文档失败';
        return false;
      }
      doc.value = res.data;
      sourceUrl.value = url;
      sourceFileName.value = '';
      rawJson.value = formatJson(res.data);
      return true;
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      return false;
    } finally {
      loading.value = false;
    }
  }

  /**
   * 解析 OpenAPI JSON，并保留来自本地文件时的文件名供工作台展示。
   * @param json 待解析的 OpenAPI JSON 文本。
   * @param fileName 本地导入文件名；手动编辑或历史记录解析时不传。
   * @returns 是否成功解析为 OpenAPI 3.x 文档。
   */
  function loadFromJson(json: string, fileName?: string) {
    if (!json || !json.trim()) {
      error.value = '请粘贴或输入 OpenAPI JSON';
      return false;
    }
    try {
      const parsed = JSON.parse(json);
      // 简单校验
      if (typeof parsed.openapi !== 'string' || !parsed.openapi.startsWith('3.')) {
        error.value = '文档格式不正确：缺少 openapi 3.x 字段';
        return false;
      }
      if (!parsed.paths) {
        error.value = '文档格式不正确：缺少 paths 字段';
        return false;
      }
      doc.value = parsed;
      sourceUrl.value = '';
      sourceFileName.value = fileName?.trim() || '';
      rawJson.value = formatJson(parsed);
      error.value = '';
      return true;
    } catch (e: any) {
      error.value = `JSON 解析失败：${e?.message || e}`;
      return false;
    }
  }

  /**
   * 将已校验的快照文档恢复到工作区，不重新触发接口差异对比。
   * @param document 从接口快照读取的完整 OpenAPI 文档。
   * @param fileName 本地文件快照的显示名称；远程快照不传。
   */
  function loadSnapshot(document: IOpenAPIDocument, fileName?: string) {
    doc.value = document;
    sourceUrl.value = '';
    sourceFileName.value = fileName?.trim() || '';
    rawJson.value = formatJson(document);
    error.value = '';
    newEndpointKeys.value = [];
    missingEndpointKeys.value = [];
    missingEndpoints.value = [];
    showOnlyNewEndpoints.value = false;
    showOnlyMissingEndpoints.value = false;
  }

  function clear() {
    doc.value = null;
    sourceUrl.value = '';
    sourceFileName.value = '';
    rawJson.value = '';
    error.value = '';
    newEndpointKeys.value = [];
    missingEndpointKeys.value = [];
    missingEndpoints.value = [];
    showOnlyNewEndpoints.value = false;
    showOnlyMissingEndpoints.value = false;
  }

  return {
    doc,
    sourceUrl,
    sourceFileName,
    rawJson,
    loading,
    error,
    newEndpointKeys,
    missingEndpointKeys,
    missingEndpoints,
    showOnlyNewEndpoints,
    showOnlyMissingEndpoints,
    endpoints,
    tags,
    loadFromUrl,
    loadFromJson,
    loadSnapshot,
    clear
  };
});

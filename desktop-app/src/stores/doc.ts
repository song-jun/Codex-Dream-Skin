import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { IOpenAPIDocument, IEndpointInfo } from '@/core/types';
import { fetchOpenAPIDocument } from '@/core/fetcher';
import { parseEndpoints, extractTags } from '@/core/parser';
import { formatJson } from '@/utils/formatJson';

export const useDocStore = defineStore('doc', () => {
  const doc = ref<IOpenAPIDocument | null>(null);
  const sourceUrl = ref<string>('');
  const rawJson = ref<string>('');
  const loading = ref(false);
  const error = ref<string>('');

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
      rawJson.value = formatJson(res.data);
      return true;
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      return false;
    } finally {
      loading.value = false;
    }
  }

  function loadFromJson(json: string) {
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
      rawJson.value = formatJson(parsed);
      error.value = '';
      return true;
    } catch (e: any) {
      error.value = `JSON 解析失败：${e?.message || e}`;
      return false;
    }
  }

  function clear() {
    doc.value = null;
    sourceUrl.value = '';
    rawJson.value = '';
    error.value = '';
  }

  return {
    doc,
    sourceUrl,
    rawJson,
    loading,
    error,
    endpoints,
    tags,
    loadFromUrl,
    loadFromJson,
    clear
  };
});

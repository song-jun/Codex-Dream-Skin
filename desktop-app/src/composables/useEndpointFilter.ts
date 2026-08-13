/**
 * 接口筛选/搜索 composable
 * 共用给 Generate.vue / DocViewer.vue
 * 能力：tag 分组、tag 按中文/英文名排序、按搜索词过滤接口
 */
import { computed, type Ref } from "vue";
import type { IEndpointInfo } from "@/core/types";

export interface TagGroup {
  name: string;
  endpoints: IEndpointInfo[];
}

export function useEndpointFilter(
  endpointsRef: Ref<IEndpointInfo[]>,
  searchTextDebounced: Ref<string>,
  newEndpointKeysRef?: Ref<Set<string>>,
  showOnlyNewRef?: Ref<boolean>,
  missingEndpointsRef?: Ref<IEndpointInfo[]>,
  missingEndpointKeysRef?: Ref<Set<string>>,
  showOnlyMissingRef?: Ref<boolean>,
) {
  /** 全部 tag 分组（按 tag 名排序） */
  const tagGroups = computed<TagGroup[]>(() => {
    const map = new Map<string, IEndpointInfo[]>();
    for (const ep of [...endpointsRef.value, ...(missingEndpointsRef?.value ?? [])]) {
      const key = ep.tag || "";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(ep);
    }
    return Array.from(map.entries())
      .map(([name, endpoints]) => ({ name, endpoints }))
      .sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"));
  });

  /** 搜索后的 tag 分组（接口按 summary/path/tag 命中搜索词） */
  const filteredTags = computed<TagGroup[]>(() => {
    const q = searchTextDebounced.value.trim().toLowerCase();
    return tagGroups.value
      .map((t) => ({
        name: t.name,
        endpoints: t.endpoints.filter(
          (e) =>
            (!showOnlyNewRef?.value ||
              newEndpointKeysRef?.value.has(`${e.method.toUpperCase()}\u0000${e.path}`)) &&
            (!showOnlyMissingRef?.value ||
              missingEndpointKeysRef?.value.has(`${e.method.toUpperCase()}\u0000${e.path}`)) &&
            (!q ||
              (e.summary || "").toLowerCase().includes(q) ||
              e.path.toLowerCase().includes(q) ||
              t.name.toLowerCase().includes(q)),
        ),
      }))
      .filter((t) => t.endpoints.length > 0);
  });

  /** 搜索后接口总数 */
  const filteredCount = computed(() =>
    filteredTags.value.reduce((s, t) => s + t.endpoints.length, 0),
  );

  return { tagGroups, filteredTags, filteredCount };
}

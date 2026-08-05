/**
 * 一键导出 composable
 * 提供 onSave（部分导出）/ onSaveAll（一键全部导出）两个动作
 * - 走 exportStore 顶栏 loading（跨页面持续）
 * - 成功通知走节流合并（避免桌面端狂刷）
 * - 失败立即通知（错误不能丢）
 */
import { ref, type Ref, nextTick } from "vue";
import { ElMessage, ElNotification } from "element-plus";
import { useExportStore } from "@/stores/export";
import { useDocStore } from "@/stores/doc";
import type { IEndpointInfo, IGeneratedCode } from "@/core/types";
import { generateCodeForMultipleEndpoints } from "@/core/generator";
import {
  buildTagToDirMap,
  buildModuleReadme,
  buildModulesMapDoc,
} from "@/utils/moduleDoc";
import { sleep } from "@/utils/sleep";
import {
  pickOutputDir,
  writeItemsToDir,
  writeItemsToDirRaw,
  clearPendingDirHandle,
  type WriteResult,
} from "./useDirectoryPicker";
export interface UseExportOptions {
  selectedEndpoints: Ref<IEndpointInfo[]>;
  generatedCode: Ref<IGeneratedCode | null>;
  urlPrefix: Ref<string>;
}

export function useExport(opts: UseExportOptions) {
  // 从 opts 解构 ref（必须在闭包顶部解构，否则内部函数无法访问）
  const { selectedEndpoints, generatedCode, urlPrefix } = opts;

  const exportStore = useExportStore();
  const docStore = useDocStore();
  const isSaving = ref(false);

  // ===== 通知节流：避免桌面端狂刷 63 条 =====
  const pendingSuccess: string[] = [];
  let notifTimer: ReturnType<typeof setTimeout> | null = null;
  const flushPendingSuccess = () => {
    if (notifTimer) {
      clearTimeout(notifTimer);
      notifTimer = null;
    }
    if (pendingSuccess.length === 0) return;
    const tags = pendingSuccess.splice(0, pendingSuccess.length);
    const summary =
      tags.length <= 3
        ? tags.join("、")
        : `${tags.slice(0, 3).join("、")} 等 ${tags.length} 个`;
    ElNotification.success({
      title: `✓ 已生成 ${tags.length} 个模块`,
      message: summary,
      duration: 2000,
      position: "bottom-right",
      offset: 20,
    });
  };
  const scheduleFlush = () => {
    if (notifTimer) return;
    notifTimer = setTimeout(() => {
      notifTimer = null;
      flushPendingSuccess();
    }, 200);
  };
  // ============================================

  /**
   * 部分导出：不分模块，直接把全部选中接口写到 type.ts / index.ts
   * 用 generatedCode 缓存（不再重新跑 generateCodeForMultipleEndpoints）
   */
  async function onSave(): Promise<void> {
    if (!generatedCode.value || selectedEndpoints.value.length === 0) return;
    if (!docStore.doc) return;
    if (isSaving.value) return;

    isSaving.value = true;
    try {
      const items = [
        { path: "type.ts", content: generatedCode.value.typeFile },
        { path: "index.ts", content: generatedCode.value.indexFile },
      ];
      const result = await writeItemsToDir(items);
      if (result.success) {
        ElNotification.success({
          title: "✓ 已保存到目录",
          message: `${items.length} 个文件（type.ts / index.ts）→ ${result.dir}`,
          duration: 4000,
          position: "bottom-right",
          offset: 20,
        });
      } else {
        ElNotification.error({
          title: "✗ 保存失败",
          message: "请检查目录权限或重试",
          duration: 4500,
          position: "bottom-right",
          offset: 20,
        });
      }
    } catch (err) {
      ElNotification.error({
        title: "✗ 保存失败",
        message: err instanceof Error ? err.message : String(err),
        duration: 4500,
        position: "bottom-right",
        offset: 20,
      });
    } finally {
      isSaving.value = false;
    }
  }

  /**
   * 一键全部导出
   * 1. 选目录
   * 2. 按 tag 分组 → 唯一英文目录名
   * 3. 批量生成所有模块的代码（pure CPU）
   * 4. 单次 IPC 写盘（合并所有 items → 1 次 writeFiles）
   * 5. 根目录追加 MODULES.md
   * 6. 顶栏永久 loading（export store 持有）
   */
  async function onSaveAll(): Promise<void> {
    if (!docStore.doc || docStore.endpoints.length === 0) {
      ElMessage.warning("当前没有可导出的接口");
      return;
    }

    // 标志：本轮 pickOutputDir 是否成功拿过 handle（finally 用来判断要不要清空）
    let handleAcquiredThisRun = false;

    // 1) 先选目录（提前失败，避免后续无谓计算）
    const dir = await pickOutputDir();
    if (!dir) return;
    handleAcquiredThisRun = true;

    const allEndpoints = docStore.endpoints;
    const tagged = allEndpoints.filter((e) => e.tag && e.tag.trim() !== "");
    const untagged = allEndpoints.filter((e) => !e.tag || e.tag.trim() === "");

    // 2) tag → 唯一英文目录名
    const tagToDir = buildTagToDirMap(tagged);

    // 3) 按 tag 分组（按目录名排序）
    const tagGroups = new Map<string, IEndpointInfo[]>();
    for (const ep of tagged) {
      const t = ep.tag!;
      if (!tagGroups.has(t)) tagGroups.set(t, []);
      tagGroups.get(t)!.push(ep);
    }
    const sortedTags = Array.from(tagGroups.keys()).sort((a, b) =>
      tagToDir.get(a)!.localeCompare(tagToDir.get(b)!),
    );

    const total = sortedTags.length + (untagged.length > 0 ? 1 : 0);
    const moduleSummaries: Array<{ tag: string; dir: string; count: number }> =
      [];
    const allItems: Array<{ path: string; content: string }> = [];

    // 4) 启动 store 状态
    exportStore.start(total);
    exportStore.setCurrentTag("生成代码中…");
    console.log(
      `[一键全部导出] 开始: ${sortedTags.length} 个有 tag 模块 + ${
        untagged.length > 0 ? 1 : 0
      } 个未分组 → 目标 ${dir}`,
    );

    try {
      let successCount = 0;
      let failCount = 0;
      const generatedAt = Date.now();

      // === 第一阶段：批量生成所有模块的代码（pure CPU，0 IPC）===
      const generateOneModule = (
        label: string,
        dirName: string,
        eps: IEndpointInfo[],
        stepIndex: number,
      ) => {
        try {
          exportStore.update(
            stepIndex,
            `${label} → ${dirName === "." ? "根目录" : dirName + "/"}`,
          );
          const code = generateCodeForMultipleEndpoints(
            docStore.doc!,
            eps,
            urlPrefix.value,
          );
          if (dirName === ".") {
            allItems.push({ path: "type.ts", content: code.typeFile });
            allItems.push({ path: "index.ts", content: code.indexFile });
          } else {
            allItems.push({
              path: `${dirName}/type.ts`,
              content: code.typeFile,
            });
            allItems.push({
              path: `${dirName}/index.ts`,
              content: code.indexFile,
            });
            allItems.push({
              path: `${dirName}/README.md`,
              content: buildModuleReadme(label, dirName, eps),
            });
          }
          moduleSummaries.push({ tag: label, dir: dirName, count: eps.length });
          successCount++;
          // 注意：成功通知**不在这里发**，等写盘确认成功后再发
        } catch (e) {
          failCount++;
          console.error(`[一键全部导出] ✗ ${label} 生成失败：`, e);
          ElNotification.error({
            title: `✗ ${label}`,
            message: `生成失败：${e instanceof Error ? e.message : String(e)}`,
            duration: 4000,
            position: "bottom-right",
            offset: 20,
          });
        }
      };

      for (let i = 0; i < sortedTags.length; i++) {
        const tag = sortedTags[i];
        const eps = tagGroups.get(tag)!;
        const dirName = tagToDir.get(tag)!;
        generateOneModule(tag, dirName, eps, i);
        await sleep(0);
      }
      if (untagged.length > 0) {
        generateOneModule("(无分组)", ".", untagged, sortedTags.length);
        await sleep(0);
      }

      // MODULES.md 一并加入批次
      if (moduleSummaries.length > 0) {
        allItems.push({
          path: "MODULES.md",
          content: buildModulesMapDoc(moduleSummaries),
        });
      }

      console.log(
        `[一键全部导出] 生成完成: ${successCount}/${total} 模块，${allItems.length} 个文件 ` +
          `（耗时 ${Date.now() - generatedAt}ms）`,
      );

      // === 第二阶段：单次写盘（1 次 IPC）===
      if (allItems.length === 0) {
        ElMessage.warning("没有可写入的文件");
        return;
      }

      // 写盘前：done 保持 total（生成已完），用 currentTag 反映"写盘阶段"
      // 避免"63/63 已完成"的视觉假象（实际还有写盘要跑）
      exportStore.setCurrentTag(`写盘 0/${allItems.length} 个文件`);
      const writeStart = Date.now();
      // 实时进度：每个文件完成就更新 currentTag
      const results = await writeItemsToDirRaw(
        dir,
        allItems,
        (written, totalFiles) => {
          exportStore.setCurrentTag(`写盘 ${written}/${totalFiles} 个文件`);
        },
      );
      const writeMs = Date.now() - writeStart;

      // 写盘后：currentTag 反映"已完成"
      exportStore.setCurrentTag(
        `写盘完成 ${results.length - results.filter((r) => !r.success).length}/${results.length} 个文件`,
      );

      const failed = results.filter((r) => !r.success);
      const writeFailCount = failed.length;
      console.log(
        `[一键全部导出] 写盘完成: ${results.length - writeFailCount}/${results.length} 个文件成功 ` +
          `（耗时 ${writeMs}ms）`,
      );

      // === 通知：按"写盘结果"反推哪些模块成功 ===
      // 一个模块下任何文件失败 → 该模块算失败；否则算成功
      const isModuleFailed = (s: { dir: string }) => {
        if (s.dir === ".") {
          // 根目录模块：失败文件是 type.ts / index.ts（无 /）
          return failed.some((f) => !f.path.includes("/"));
        }
        return failed.some((f) => f.path.startsWith(`${s.dir}/`));
      };

      // 1) 失败的模块：立即逐条 error 通知（错误信息不能丢）
      for (const s of moduleSummaries) {
        if (!isModuleFailed(s)) continue;
        const moduleFails = failed.filter((f) =>
          s.dir === "."
            ? !f.path.includes("/")
            : f.path.startsWith(`${s.dir}/`),
        );
        const detail = moduleFails
          .map((f) => `${f.path.split("/").pop()}: ${f.error}`)
          .join("\n");
        ElNotification.error({
          title: `✗ 写盘失败：${s.tag}`,
          message: detail,
          duration: 6000,
          position: "bottom-right",
          offset: 20,
        });
      }

      // 2) 成功的模块：累积到 pendingSuccess，节流合并弹一条汇总
      for (const s of moduleSummaries) {
        if (!isModuleFailed(s)) pendingSuccess.push(s.tag);
      }
      scheduleFlush();
      // 立刻刷一次（避免被下面 exportStore.finish 抢时机）
      flushPendingSuccess();

      // 10) 收尾汇总
      const totalMs = Date.now() - generatedAt;
      console.log(
        `[一键全部导出] 结束: 生成 ${successCount}/${total} 模块，写入 ${results.length - writeFailCount}/${results.length} 个文件，总耗时 ${totalMs}ms`,
      );
      if (failCount === 0 && writeFailCount === 0) {
        ElNotification.success({
          title: "一键全部导出完成",
          message: `共 ${successCount} 个模块，${allItems.length} 个文件，耗时 ${totalMs}ms → ${dir}`,
          duration: 4000,
          position: "bottom-right",
          offset: 20,
        });
      } else {
        ElNotification.warning({
          title: "一键全部导出完成（部分失败）",
          message: `生成 ${successCount} 个，失败 ${failCount} 个；写入 ${results.length - writeFailCount} 个，失败 ${writeFailCount} 个`,
          duration: 5000,
          position: "bottom-right",
          offset: 20,
        });
      }
    } finally {
      exportStore.finish();
      // **关键**：只有本轮 pickOutputDir 成功拿到的 handle 才清空
      if (handleAcquiredThisRun) {
        clearPendingDirHandle();
      }
    }
  }

  return { isSaving, onSave, onSaveAll };
}

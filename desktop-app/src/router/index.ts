import { createRouter, createWebHashHistory } from "vue-router";

/** Dream Skin 工作台不使用路由视图，但仍需注册根路径以避免启动时产生未匹配路由警告。 */
const skinWorkspaceRoute = { render: () => null };

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: "/",
      name: "skin-workspace",
      component: skinWorkspaceRoute,
    },
    {
      path: "/api-workbench",
      redirect: "/api-workbench/doc",
    },
    {
      path: "/api-workbench/doc",
      name: "api-workbench-doc",
      component: () => import("../views/DocViewer.vue"),
      meta: { title: "OpenAPI 文档" },
    },
    {
      path: "/api-workbench/generate",
      name: "api-workbench-generate",
      component: () => import("../views/Generate.vue"),
      meta: { title: "生成代码" },
    },
    {
      path: "/api-workbench/invoke",
      name: "api-workbench-invoke",
      component: () => import("../views/Invoke.vue"),
      meta: { title: "调用接口" },
    },
    {
      path: "/api-workbench/snapshots",
      name: "api-workbench-snapshots",
      component: () => import("../views/EndpointSnapshots.vue"),
      meta: { title: "接口快照" },
    },
  ],
});

export default router;

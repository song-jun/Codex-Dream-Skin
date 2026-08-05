import { createRouter, createWebHashHistory } from "vue-router";

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
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
  ],
});

export default router;

<!--
  应用入口：创建唯一的 Dream Skin 工作台状态，并提供给所有页面组件。
-->
<script setup lang="ts">
import { provide } from "vue";
import AppShell from "./components/AppShell.vue";
import { createWorkbench, WORKBENCH_KEY } from "./composables/useWorkbench";

provide(WORKBENCH_KEY, createWorkbench());
</script>

<template>
  <AppShell />
</template>

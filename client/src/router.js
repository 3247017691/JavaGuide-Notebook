import { createRouter, createWebHistory } from "vue-router";
import DesktopShell from "./components/shell/DesktopShell.vue";
import NotebookPage from "./components/notebook/NotebookPage.vue";

/* 保留原始 URL 语义：正文内链 /read/**.html、/chapter.html?c=、/index.html 全部零改动 */
const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", name: "desktop", component: DesktopShell },
    { path: "/index.html", name: "nb-home", component: NotebookPage },
    { path: "/chapter.html", name: "nb-chapter", component: NotebookPage },
    { path: "/read/:path(.*)", name: "nb-read", component: NotebookPage },
    { path: "/:pathMatch(.*)*", redirect: "/" },
  ],
});

export default router;

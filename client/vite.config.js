import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

/* 开发态：Vite 只管 SPA 壳与前端资源；数据与内容全部代理给本机 Express（3000）。
   老入口（/index.html、/chapter.html、/read/*.html）在 dev 里改写到 /，
   由 vue-router 的同名路由接住 —— 生产环境由 Express 的 SPA fallback 兜底。 */
const rewriteLegacyHtml = () => ({
  name: "rewrite-legacy-html",
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      const url = (req.url || "").split("?")[0];
      if (url === "/index.html" || url === "/chapter.html" || /^\/read\/.+/i.test(url)) {
        req.url = "/";
      }
      next();
    });
  },
});

export default defineConfig({
  plugins: [vue(), rewriteLegacyHtml()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3000",
      "/content": "http://localhost:3000",
      "/img": "http://localhost:3000",
      "/vendor": "http://localhost:3000",
      "/jbl": "http://localhost:3000",
    },
  },
  build: {
    outDir: "dist",
    chunkSizeWarningLimit: 1800,
  },
});

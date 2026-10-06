import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { studyPages, studyTemplatePath, writeStudyPages } from "./scripts/study-pages.mjs";

writeStudyPages();

export default defineConfig({
  plugins: [{
    name: "study-pages",
    configureServer(server) {
      server.watcher.on("change", (path) => {
        if (path === studyTemplatePath) writeStudyPages();
      });
    },
  }],
  build: {
    rollupOptions: {
      input: Object.fromEntries(
        ["index", ...studyPages.map((page) => `${page.path}/index`), "about/index", "privacy-policy/index", "copyright/index", "contact/index"].map(
          (page) => [page, fileURLToPath(new URL(`./${page}.html`, import.meta.url))],
        ),
      ),
    },
  },
});

import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { studyPages, studyTemplatePath, writeStudyPages } from "./scripts/study-pages.mjs";
import { writeMaterialPages, materialTemplatePath, writeSitemap } from "./scripts/material-pages.mjs";

writeStudyPages();
let materials = writeMaterialPages();

export default defineConfig({
  plugins: [{
    name: "study-pages",
    configureServer(server) {
      server.watcher.on("change", (path) => {
        if (path === studyTemplatePath) writeStudyPages();
        if (path === materialTemplatePath || /\/public\/data\/(kanji|stories)\.json$/.test(path)) materials = writeMaterialPages();
      });
    },
  }, {
    name: "material-sitemap",
    apply: "build",
    closeBundle() {
      writeSitemap(new URL("./dist/", import.meta.url), materials);
    },
  }],
  build: {
    rollupOptions: {
      input: Object.fromEntries(
        ["index", ...studyPages.map((page) => `${page.path}/index`), ...materials.map((page) => `${page.path}/index`), "about/index", "privacy-policy/index", "copyright/index", "contact/index"].map(
          (page) => [page, fileURLToPath(new URL(`./${page}.html`, import.meta.url))],
        ),
      ),
    },
  },
});

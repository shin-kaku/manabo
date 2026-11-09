import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { studyPages, studyTemplatePath, writeStudyPages } from "./scripts/study-pages.mjs";
import { writeMaterialPages, materialTemplatePath, writeSitemap } from "./scripts/material-pages.mjs";

import { writeKanjiListData } from "./scripts/kanji-list-data.mjs";

writeStudyPages();
writeKanjiListData();
let materials = writeMaterialPages();

export default defineConfig({
  plugins: [{
    name: "adsense-site-verification",
    transformIndexHtml: () => [{
      tag: "meta",
      attrs: { name: "google-adsense-account", content: "ca-pub-6751763449937427" },
      injectTo: "head",
    }],
  }, {
    name: "saved-theme-before-paint",
    transformIndexHtml: {
      order: "pre",
      handler: () => [{
        tag: "script",
        children: readFileSync(new URL("./src/theme-init.js", import.meta.url), "utf8"),
        injectTo: "head-prepend",
      }],
    },
  }, {
    name: "study-pages",
    configureServer(server) {
      server.watcher.on("change", (path) => {
        if (/\/public\/data\/(kanji|media)\.json$/.test(path)) writeKanjiListData();
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

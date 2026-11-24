import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { studyNavigation } from "./scripts/study-nav.mjs";
import { studyPages, studyTemplatePath, writeStudyPages } from "./scripts/study-pages.mjs";
import { writeKanjiListData } from "./scripts/kanji-list-data.mjs";

const generator = fileURLToPath(new URL("./scripts/material-pages.mjs", import.meta.url));
function generateMaterials() {
  // A fresh Node process reads the newly generated route index on every data change.
  return JSON.parse(execFileSync(process.execPath, [generator], { encoding: "utf8" }));
}

writeStudyPages();
writeKanjiListData();
const materials = generateMaterials();

export default defineConfig({
  plugins: [{
    name: "home-study-navigation",
    transformIndexHtml(html, context) {
      if (context.path === "/index.html" || context.path === "/") return html.replace("<!-- STUDY_NAV -->", studyNavigation());
    },
  }, {
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
        if (path === studyTemplatePath || path.endsWith("/public/data/stories.json")) writeStudyPages();
        if (path === studyTemplatePath ||
            /\/src\/(materials\.html|(?:entry-art-zoom|material-directory-data|study-path|reading-groups|kanji-components|media|image-sources)\.js)$/.test(path) ||
            /\/scripts\/(material-directory|material-pages|character-pages|html)\.mjs$/.test(path) ||
            /\/public\/data\/(kanji|stories|media)\.json$/.test(path)) generateMaterials();
      });
    },
  }, {
    name: "material-sitemap",
    apply: "build",
    closeBundle() {
      const base = readFileSync(new URL("./public/sitemap.xml", import.meta.url), "utf8");
      const additional = materials.filter(path => path !== "kanji")
        .map(path => `  <url><loc>https://kanjimanabo.com/${path}/</loc></url>`).join("\n");
      writeFileSync(new URL("./dist/sitemap.xml", import.meta.url), base.replace("</urlset>", `${additional}\n</urlset>`));
    },
  }],
  build: {
    rollupOptions: {
      input: Object.fromEntries(
        ["index", "materials/kanji/index", ...studyPages.map((page) => `${page.path}/index`), ...materials.map(path => `${path}/index`), "about/index", "privacy-policy/index", "copyright/index", "contact/index"].map(
          (page) => [page, fileURLToPath(new URL(`./${page}.html`, import.meta.url))],
        ),
      ),
    },
  },
});

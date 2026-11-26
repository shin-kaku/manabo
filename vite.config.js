import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { studyNavigation } from "./scripts/study-nav.mjs";
import { studyPages, studyTemplatePath, writeStudyPages } from "./scripts/study-pages.mjs";
import { writeKanjiListData } from "./scripts/kanji-list-data.mjs";

const generator = fileURLToPath(new URL("./scripts/material-pages.mjs", import.meta.url));
const starpathBuilder = fileURLToPath(new URL("./previews/starpath/scripts/build.mjs", import.meta.url));
const starpathPreview = fileURLToPath(new URL("./previews/starpath/preview.py", import.meta.url));
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
      const devGame = join(tmpdir(), `manabo-starpath-dev-${process.pid}.html`);
      server.httpServer?.once("close", () => rmSync(devGame, { force: true }));
      const studyPaths = new Set(["/learn/", "/learn/choice/", "/reading/", "/learn/game/"]);
      server.middlewares.use(async (req, res, next) => {
        const path = new URL(req.url, "http://localhost").pathname;
        const cover = path.match(/^\/images\/(quiz-preview-starpath(?:-dark)?\.webp)$/);
        if (cover) {
          res.setHeader("Content-Type", "image/webp");
          res.end(readFileSync(new URL(`./previews/starpath/${cover[1]}`, import.meta.url)));
          return;
        }
        const normalized = path.endsWith("/index.html") ? path.slice(0, -10) : path.endsWith("/") ? path : `${path}/`;
        if (!studyPaths.has(normalized)) return next();
        try {
          if (normalized === "/learn/game/") execFileSync(process.execPath, [starpathBuilder, "--out", devGame], { stdio: "pipe" });
          const html = execFileSync("python3", [starpathPreview, "--render-dev", normalized], {
            encoding: "utf8", maxBuffer: 4 * 1024 * 1024, env: { ...process.env, MANABO_STARPATH_DEV_GAME: devGame },
          });
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.setHeader("Cache-Control", "no-store");
          res.end(await server.transformIndexHtml(req.url, html));
        } catch (error) { next(error); }
      });
      server.watcher.on("change", (path) => {
        if (/\/public\/data\/(kanji|media)\.json$/.test(path)) writeKanjiListData();
        if (path === studyTemplatePath) writeStudyPages();
        if (path === studyTemplatePath ||
            /\/src\/(materials\.html|(?:entry-art-zoom|material-directory-data|study-path|reading-groups|kanji-components|media|image-sources)\.js)$/.test(path) ||
            /\/scripts\/(material-directory|material-pages|character-pages|html)\.mjs$/.test(path) ||
            /\/public\/data\/(kanji|stories|media)\.json$/.test(path)) generateMaterials();
        if (/\/previews\/starpath\/(?:src\/template\.html|data\/(?:shapes|overrides)\.json|scripts\/build\.mjs|choice-setup\.(?:css|js)|preview\.py)$/.test(path)) {
          server.ws.send({ type: "full-reload" });
        }
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
        ["index", "textbook/index", "quiz/index", "quiz/choice/index", "materials/kanji/index", ...studyPages.map((page) => `${page.path}/index`), ...materials.map(path => `${path}/index`), "about/index", "privacy-policy/index", "copyright/index", "contact/index"].map(
          (page) => [page, fileURLToPath(new URL(`./${page}.html`, import.meta.url))],
        ),
      ),
    },
  },
});

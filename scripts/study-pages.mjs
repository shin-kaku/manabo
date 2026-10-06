import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { studySeo } from "../src/seo.js";

const root = new URL("../", import.meta.url);
export const studyPages = [
  { path: "kanji", section: "kanji", title: "한자 도감" },
  { path: "reading", section: "story", title: "한자 독해" },
  { path: "quiz", section: "game", title: "한자 문제" },
];

// All study pages share index.html, so layout changes only need one edit.
export function writeStudyPages() {
  const template = readFileSync(new URL("index.html", root), "utf8");
  for (const page of studyPages) {
    let html = template
      .replace(/<title>[^<]*<\/title>/, `<title>${studySeo[page.section].title}</title>`)
      .replace(/(<meta\s+name="description"\s+content=")[^"]*("\s*\/>)/, `$1${studySeo[page.section].description}$2`)
      .replace(/(<meta\s+property="og:title"\s+content=")[^"]*("\s*\/>)/, `$1${studySeo[page.section].title}$2`)
      .replace(/(<meta\s+property="og:description"\s+content=")[^"]*("\s*\/>)/, `$1${studySeo[page.section].description}$2`)
      .replace(/(<link\s+rel="canonical"\s+href=")[^"]*("\s*\/>)/, `$1${studySeo[page.section].canonical}$2`)
      .replace(/(<meta\s+property="og:url"\s+content=")[^"]*("\s*\/>)/, `$1https://kanjimanabo.com/${page.path}/$2`);
    for (const candidate of studyPages) {
      const view = `${candidate.section === "story" ? "story" : candidate.section === "game" ? "game" : "kanji"}View`;
      html = html.replace(new RegExp(`(<section id="${view}" class="[^"]*")(?: hidden)?(>)`), `$1${candidate === page ? "" : " hidden"}$2`);
      const id = candidate.section === "kanji" ? "navKanji" : candidate.section === "story" ? "navStory" : "navGame";
      html = html.replace(new RegExp(`(<a id="${id}" class=")[^"]*(" href="[^"]*")(?: aria-current="page")?`), `$1site-tab${candidate === page ? " active" : ""}$2${candidate === page ? ' aria-current="page"' : ""}`);
    }
    const directory = new URL(`${page.path}/`, root);
    mkdirSync(directory, { recursive: true });
    writeFileSync(new URL("index.html", directory), html);
  }
}

export const studyTemplatePath = fileURLToPath(new URL("index.html", root));

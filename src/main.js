      let DATA = [];
      const els = {
        grid: document.getElementById("grid"),
        search: document.getElementById("search"),
        grade: document.getElementById("grade"),
        jlpt: document.getElementById("jlpt"),
        sort: document.getElementById("sort"),
        reset: document.getElementById("reset"),
        resultCount: document.getElementById("resultCount"),
        sentinel: document.getElementById("sentinel"),
        sortLabel: document.getElementById("sortLabel"),
        sortIndex: document.getElementById("sortIndex"),
        kanjiView: document.getElementById("kanjiView"),
        storyView: document.getElementById("storyView"),
        gameView: document.getElementById("gameView"),
        navKanji: document.getElementById("navKanji"),
        navStory: document.getElementById("navStory"),
        navGame: document.getElementById("navGame"),
        storyCopy: document.getElementById("storyCopy"),
        storyTitle: document.getElementById("storyTitle"),
        gradeStoryLevels: document.getElementById("gradeStoryLevels"),
        jlptStoryLevels: document.getElementById("jlptStoryLevels"),
        gameSetup: document.getElementById("gameSetup"),
        gameGrade: document.getElementById("gameGrade"),
        gameJlpt: document.getElementById("gameJlpt"),
        gameCount: document.getElementById("gameCount"),
        gameStart: document.getElementById("gameStart"),
        gamePlay: document.getElementById("gamePlay"),
        gameProgress: document.getElementById("gameProgress"),
        gameProgressBar: document.getElementById("gameProgressBar"),
        gameScore: document.getElementById("gameScore"),
        gameQuestion: document.getElementById("gameQuestion"),
        gameQuestionLabel: document.getElementById("gameQuestionLabel"),
        gameGlyph: document.getElementById("gameGlyph"),
        gamePicture: document.getElementById("gamePicture"),
        gameChoices: document.getElementById("gameChoices"),
        gameFeedback: document.getElementById("gameFeedback"),
        gameMistakes: document.getElementById("gameMistakes"),
        gameMistakesTitle: document.getElementById("gameMistakesTitle"),
        gameMistakesGuide: document.getElementById("gameMistakesGuide"),
        gameMistakesList: document.getElementById("gameMistakesList"),
        gameNext: document.getElementById("gameNext"),
        gameSettingsButton: document.getElementById("gameSettingsButton"),
      };
      let STORIES = [];
      let activeStoryId = "";

      const BATCH = 96;
      let view = [];
      let rendered = 0;
      let selectedStroke = null;
      let selectedSound = null;

      const text = (v) => (v ?? "").toString().trim();
      const displayLabel = (v) =>
        text(v)
          .replace(/^중학\s*(\d+)$/, "중학교 $1학년")
          .replace(/^고교\s*(\d+)$/, "고등학교 $1학년")
          .replace(/^중학(?=\s|$)/, "중학교")
          .replace(/^고교(?=\s|$)/, "고등학교")
          .replace("초등학교 ", "초");
      const storyDisplayLabel = (v) =>
        text(v)
          .replace(/^JLPT N([1-5])\((\d+)\)$/, "JLPT N$1-$2")
          .replace(/^(?:초등학교|초등|초)\s*(\d+)(?:학년)?$/, "초등 $1")
          .replace(/^(?:중학교|중학|중등)\s*(\d+)(?:학년)?$/, "중등$1")
          .replace(/^(?:고등학교|고교|고등)\s*(\d+)(?:학년)?$/, "고등 $1");
      let KANJI_SET = new Set(DATA.map((d) => text(d["한자"])).filter(Boolean));
      let KANJI_MAP = new Map(DATA.map((d) => [text(d["한자"]), d]));
      let RELATED_KANJI = new Map();
      function mnemonicComponents(raw) {
        const components = new Set();
        for (const match of text(raw).matchAll(/[（(]([^()（）]+)[）)]/g)) {
          for (const ch of match[1]) {
            if (/\p{Script=Han}/u.test(ch)) components.add(ch);
          }
        }
        return [...components];
      }
      function rebuildDataIndexes() {
        KANJI_SET = new Set(DATA.map((d) => text(d["한자"])).filter(Boolean));
        KANJI_MAP = new Map(DATA.map((d) => [text(d["한자"]), d]));
        RELATED_KANJI = new Map();
        const ordered = DATA.slice().sort(
          (a, b) => numberOrInf(a["획"]) - numberOrInf(b["획"]) ||
            numberOrInf(a["암기순"]) - numberOrInf(b["암기순"]),
        );
        for (const d of ordered) {
          const ch = text(d["한자"]);
          if (!ch) continue;
          for (const component of mnemonicComponents(d["풀이"])) {
            if (!RELATED_KANJI.has(component)) RELATED_KANJI.set(component, new Set());
            RELATED_KANJI.get(component).add(ch);
          }
        }
      }
      async function loadSavedData() {
        const [kanjiResponse, storiesResponse] = await Promise.all([
          fetch("/data/kanji.json"),
          fetch("/data/stories.json"),
        ]);
        if (!kanjiResponse.ok || !storiesResponse.ok) {
          throw new Error("저장된 학습 데이터 요청에 실패했습니다.");
        }
        const [kanji, stories] = await Promise.all([
          kanjiResponse.json(),
          storiesResponse.json(),
        ]);
        if (!Array.isArray(kanji) || !kanji.length) {
          throw new Error("한자 데이터 형식이 올바르지 않습니다.");
        }
        if (!Array.isArray(stories) || !stories.length) {
          throw new Error("독해 데이터 형식이 올바르지 않습니다.");
        }
        DATA = kanji;
        STORIES = stories;
        activeStoryId =
          STORIES.find((s) => s.category === "학년별")?.id ||
          STORIES[0]?.id ||
          "";
        rebuildDataIndexes();
        document.documentElement.dataset.dataSource = "saved";
      }
      const numberOrInf = (v) => {
        const s = text(v);
        if (!s) return Infinity;
        const n = Number(s);
        return Number.isFinite(n) ? n : Infinity;
      };
      const koreanCollator = new Intl.Collator("ko", {
        sensitivity: "base",
        numeric: true,
      });
      const primaryReading = (v) => text(v).split(/\s*[,|/]\s*/)[0] || "";
      const compareKorean = (a, b) => {
        const aa = primaryReading(a),
          bb = primaryReading(b);
        if (!aa && !bb) return 0;
        if (!aa) return 1;
        if (!bb) return -1;
        return koreanCollator.compare(aa, bb);
      };
      const SOUND_GROUP_LABELS = [
        "가",
        "가",
        "나",
        "다",
        "다",
        "라",
        "마",
        "바",
        "바",
        "사",
        "사",
        "아",
        "자",
        "자",
        "차",
        "카",
        "타",
        "파",
        "하",
      ];
      function soundGroup(v) {
        const first = Array.from(primaryReading(v))[0] || "";
        const code = first.charCodeAt(0);
        if (code < 0xac00 || code > 0xd7a3) return "";
        return SOUND_GROUP_LABELS[Math.floor((code - 0xac00) / 588)] || "";
      }
      function renderSortIndex(sortMode, source = view) {
        els.sortIndex.replaceChildren();
        let items = [];
        if (sortMode === "strokes") {
          const seen = new Set();
          source.forEach((d) => {
            const n = numberOrInf(d["획"]);
            if (Number.isFinite(n) && !seen.has(n)) {
              seen.add(n);
              items.push({ label: `${n}획`, stroke: n });
            }
          });
          items.sort((a, b) => a.stroke - b.stroke);
          els.sortIndex.setAttribute("aria-label", "획수 필터");
        } else if (sortMode === "sound") {
          const groups = new Set(
            source.map((d) => soundGroup(d["음"])).filter(Boolean),
          );
          [
            "가",
            "나",
            "다",
            "라",
            "마",
            "바",
            "사",
            "아",
            "자",
            "차",
            "카",
            "타",
            "파",
            "하",
          ].forEach((label) => {
            if (groups.has(label)) items.push({ label, sound: label });
          });
          els.sortIndex.setAttribute("aria-label", "한자음 초성 필터");
        }
        els.sortIndex.hidden = !items.length;
        items.forEach((item) => {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "sort-index-button";
          button.textContent = item.label;
          if (sortMode === "strokes") {
            const active = selectedStroke === item.stroke;
            button.classList.toggle("active", active);
            button.setAttribute("aria-pressed", String(active));
            button.addEventListener("click", () => {
              selectedStroke = active ? null : item.stroke;
              apply();
            });
          } else {
            const active = selectedSound === item.sound;
            button.classList.toggle("active", active);
            button.setAttribute("aria-pressed", String(active));
            button.addEventListener("click", () => {
              selectedSound = active ? null : item.sound;
              apply();
            });
          }
          els.sortIndex.append(button);
        });
      }
      const pad = (v) => {
        const n = numberOrInf(v);
        return Number.isFinite(n) ? String(n).padStart(4, "0") : "—";
      };
      function driveFileId(url) {
        const u = text(url);
        if (!u) return "";
        const patterns = [
          /\/file\/d\/([^/?#]+)/i,
          /\/d\/([^/?#]+)/i,
          /[?&]id=([^&#]+)/i,
        ];
        for (const p of patterns) {
          const m = u.match(p);
          if (m) return decodeURIComponent(m[1]);
        }
        return "";
      }
      function imageCandidates(...sources) {
        const urls = [];
        sources.forEach((source) => {
          const u = text(source);
          if (!u) return;
          const id = driveFileId(u);
          if (id) {
            const e = encodeURIComponent(id);
            // Drive's public-image endpoints occasionally behave differently per file/browser.
            // Keep three forms, then move to the next sheet image if one fails.
            urls.push(`https://drive.google.com/uc?export=view&id=${e}`);
            urls.push(`https://drive.google.com/thumbnail?id=${e}&sz=w1200`);
            urls.push(`https://lh3.googleusercontent.com/d/${e}=w1200`);
          } else {
            urls.push(u);
          }
        });
        return [...new Set(urls)];
      }
      function sortGrade(a, b) {
        const rank = (s) => {
          const elementary = s.match(/초등(?:학교)?\s*(\d+)학년/);
          if (elementary) return Number(elementary[1]);

          const middle = s.match(/중학(?:교)?\s*(\d+)?/);
          if (middle) return 20 + Number(middle[1] || 0);

          const high = s.match(/(?:고교|고등(?:학교)?)\s*(\d+)?/);
          if (high) return 30 + Number(high[1] || 0);

          return 99;
        };
        return rank(a) - rank(b) || a.localeCompare(b, "ko");
      }
      function populateFilters() {
        const grades = [
          ...new Set(
            DATA.map((d) => text(d["학년"])).filter((v) => v && v !== "참고"),
          ),
        ].sort(sortGrade);
        grades.forEach((v) =>
          els.grade.add(new Option(storyDisplayLabel(v), v)),
        );
        const jlpts = [
          ...new Set(DATA.map((d) => text(d["등급"])).filter(Boolean)),
        ].sort((a, b) => {
          const na = Number((a.match(/N(\d)/) || [])[1] || 99),
            nb = Number((b.match(/N(\d)/) || [])[1] || 99);
          return nb - na || a.localeCompare(b); // N5 -> N1
        });
        jlpts.forEach((v) => els.jlpt.add(new Option(displayLabel(v), v)));
        grades.forEach((v) =>
          els.gameGrade.add(new Option(storyDisplayLabel(v), v)),
        );
        jlpts.forEach((v) => els.gameJlpt.add(new Option(displayLabel(v), v)));
      }

      const READING_LABELS = { "㉧": "음독", "㉭": "훈독", "㉫": "특수 읽기" };
      function parseExamples(raw) {
        const groups = [];
        let current = { marker: "", label: "예시", items: [] };
        const flush = () => {
          if (current.items.length) groups.push(current);
        };
        text(raw)
          .split("\n")
          .map((v) => v.trim())
          .forEach((line) => {
            if (!line || line === "-") return;
            if (READING_LABELS[line]) {
              flush();
              current = {
                marker: line,
                label: READING_LABELS[line],
                items: [],
              };
            } else {
              current.items.push(line);
            }
          });
        flush();
        return groups;
      }
      function parseReadings(raw) {
        const value = text(raw);
        if (!value || value === "無し") return [];
        return value
          .split(/\s*\|\s*/)
          .map((part) => {
            const m = part.trim().match(/^(㉧|㉭|㉫)\s*(.*)$/);
            return m
              ? { marker: m[1], label: READING_LABELS[m[1]], value: m[2] }
              : { marker: "", label: "읽기", value: part.trim() };
          })
          .filter((v) => v.value && v.value !== "無し");
      }
      const popover = {
        root: document.getElementById("kanjiPopover"),
        glyph: document.getElementById("popoverGlyph"),
        meaning: document.getElementById("popoverMeaning"),
        meta: document.getElementById("popoverMeta"),
        note: document.getElementById("popoverNote"),
        go: document.getElementById("popoverGo"),
      };
      const detail = {
        overlay: document.getElementById("detailOverlay"),
        content: document.getElementById("detailContent"),
        back: document.getElementById("detailBack"),
        close: document.getElementById("detailClose"),
      };
      const imageViewer = {
        overlay: document.getElementById("imageOverlay"),
        image: document.getElementById("imageZoom"),
        fallback: document.getElementById("imageFallback"),
        close: document.getElementById("imageClose"),
      };
      let popoverKanji = "",
        popoverAnchor = null,
        popoverCloseTimer = null;
      let detailReturnFocus = null,
        imageReturnFocus = null,
        detailCurrentKanji = "",
        detailHistory = [];
      function positionKanjiPopover(anchor) {
        const rect = anchor.getBoundingClientRect(),
          box = popover.root.getBoundingClientRect(),
          gap = 2,
          pad = 14;
        let top = rect.top - box.height - gap;
        if (top < pad) top = rect.bottom + gap;
        top = Math.max(
          pad,
          Math.min(top, window.innerHeight - box.height - pad),
        );
        const left = Math.max(
          pad,
          Math.min(
            rect.left + (rect.width - box.width) / 2,
            window.innerWidth - box.width - pad,
          ),
        );
        popover.root.style.top = `${top}px`;
        popover.root.style.left = `${left}px`;
      }
      function showKanjiPopover(ch, anchor) {
        const d = KANJI_MAP.get(ch);
        if (!d) return;
        clearTimeout(popoverCloseTimer);
        if (popoverAnchor && popoverAnchor !== anchor)
          popoverAnchor.setAttribute("aria-expanded", "false");
        popoverKanji = ch;
        popoverAnchor = anchor;
        popover.glyph.textContent = ch;
        popover.meaning.textContent = text(d["훈, 음"]);
        popover.meta.replaceChildren();
        [
          text(d["학년"]),
          text(d["등급"]),
        ]
          .filter(Boolean)
          .forEach((v) => {
            const c = document.createElement("span");
            c.className = "chip";
            c.textContent = displayLabel(v);
            popover.meta.append(c);
          });
        popover.note.textContent = text(d["풀이"]);
        popover.note.hidden = !text(d["풀이"]);
        popover.root.hidden = false;
        anchor.setAttribute("aria-expanded", "true");
        requestAnimationFrame(() => positionKanjiPopover(anchor));
      }
      function hideKanjiPopover() {
        clearTimeout(popoverCloseTimer);
        if (popoverAnchor) popoverAnchor.setAttribute("aria-expanded", "false");
        popover.root.hidden = true;
        popoverKanji = "";
        popoverAnchor = null;
      }
      function schedulePopoverClose() {
        clearTimeout(popoverCloseTimer);
        popoverCloseTimer = setTimeout(hideKanjiPopover, 320);
      }
      function renderKanjiDetail(ch) {
        const d = KANJI_MAP.get(ch);
        if (!d) return;
        const card = createCard(d, true);
        card.classList.add("flipped");
        card.tabIndex = -1;
        card.setAttribute("aria-pressed", "true");
        const detailVisual = card.querySelector(".visual");
        detailVisual.tabIndex = -1;
        detailVisual.removeAttribute("role");
        detailVisual.removeAttribute("aria-label");
        detail.content.replaceChildren(card);
        detailCurrentKanji = ch;
        detail.back.hidden = !detailHistory.length;
        const previous = detailHistory[detailHistory.length - 1] || "";
        detail.back.setAttribute(
          "aria-label",
          previous
            ? `${previous} 한자로 돌아가기`
            : "이전에 본 한자로 돌아가기",
        );
      }
      function openKanjiDetail(ch, returnFocus = popoverAnchor) {
        const d = KANJI_MAP.get(ch);
        if (!d) return;
        const alreadyOpen = !detail.overlay.hidden;
        if (alreadyOpen && detailCurrentKanji && detailCurrentKanji !== ch)
          detailHistory.push(detailCurrentKanji);
        if (!alreadyOpen) {
          detailReturnFocus = returnFocus;
          detailHistory = [];
        }
        hideKanjiPopover();
        renderKanjiDetail(ch);
        detail.overlay.hidden = false;
        document.body.classList.add("detail-open");
        (alreadyOpen && detailHistory.length
          ? detail.back
          : detail.close
        ).focus();
      }
      function goBackKanjiDetail() {
        if (!detailHistory.length) return;
        const previous = detailHistory.pop();
        hideKanjiPopover();
        renderKanjiDetail(previous);
        (detailHistory.length ? detail.back : detail.close).focus();
      }
      function closeKanjiDetail() {
        if (detail.overlay.hidden) return;
        detail.overlay.hidden = true;
        detail.content.replaceChildren();
        document.body.classList.remove("detail-open");
        detailCurrentKanji = "";
        detailHistory = [];
        detail.back.hidden = true;
        detailReturnFocus?.focus();
        detailReturnFocus = null;
      }
      function openImageViewer(d, returnFocus) {
        const ch = text(d["한자"]),
          urls = imageCandidates(d["이미지 1"]);
        imageReturnFocus = returnFocus;
        imageViewer.fallback.textContent = ch;
        imageViewer.fallback.hidden = false;
        imageViewer.image.hidden = true;
        imageViewer.image.alt = `${ch} 암기 이미지 크게 보기`;
        let attempt = 0;
        imageViewer.image.onload = () => {
          imageViewer.image.hidden = false;
          imageViewer.fallback.hidden = true;
        };
        imageViewer.image.onerror = () => {
          attempt++;
          if (attempt < urls.length) imageViewer.image.src = urls[attempt];
          else imageViewer.image.hidden = true;
        };
        if (urls.length) imageViewer.image.src = urls[0];
        imageViewer.overlay.hidden = false;
        document.body.classList.add("detail-open");
        imageViewer.close.focus();
      }
      function closeImageViewer() {
        if (imageViewer.overlay.hidden) return;
        imageViewer.overlay.hidden = true;
        imageViewer.image.removeAttribute("src");
        imageViewer.image.hidden = true;
        if (detail.overlay.hidden)
          document.body.classList.remove("detail-open");
        imageReturnFocus?.focus();
        imageReturnFocus = null;
      }
      function makeKanjiLink(ch, currentChar, context = "card") {
        if (!KANJI_SET.has(ch) || ch === currentChar)
          return document.createTextNode(ch);
        const b = document.createElement("button");
        b.type = "button";
        b.className = "kanji-link";
        b.textContent = ch;
        b.setAttribute("aria-label", `${ch} 간단 정보 보기`);
        b.setAttribute("aria-haspopup", "dialog");
        b.setAttribute("aria-expanded", "false");
        b.title = `${ch} 간단 정보`;
        b.dataset.targetKanji = ch;
        const canHover = matchMedia("(hover:hover) and (pointer:fine)").matches;
        if (canHover) {
          b.addEventListener("mouseenter", () => showKanjiPopover(ch, b));
          b.addEventListener("mouseleave", schedulePopoverClose);
        }
        b.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          showKanjiPopover(ch, b);
        });
        return b;
      }
      function appendLinkedCharacters(
        container,
        source,
        currentChar,
        context = "card",
      ) {
        Array.from(source).forEach((ch) =>
          container.append(makeKanjiLink(ch, currentChar, context)),
        );
      }
      function appendMnemonicText(container, raw, currentChar) {
        const source = text(raw);
        const re = /([（(])([^()（）]+)([）)])/g;
        let last = 0,
          match;
        while ((match = re.exec(source))) {
          container.append(
            document.createTextNode(source.slice(last, match.index) + match[1]),
          );
          appendLinkedCharacters(container, match[2], currentChar);
          container.append(document.createTextNode(match[3]));
          last = re.lastIndex;
        }
        container.append(document.createTextNode(source.slice(last)));
      }
      function appendExampleText(container, raw, currentChar) {
        const lines = text(raw).split("\n");
        lines.forEach((line, i) => {
          if (i) container.append(document.createTextNode("\n"));
          appendLinkedCharacters(container, line, currentChar);
        });
      }
      function findRenderedCard(ch) {
        return (
          [...els.grid.querySelectorAll(".card")].find(
            (card) => card.dataset.kanji === ch,
          ) || null
        );
      }
      const sectionPaths = { kanji: "/kanji/", story: "/reading/", game: "/quiz/" };
      const sectionFromPath = () =>
        Object.entries(sectionPaths).find(([, path]) => path.replace(/\/$/, "") === location.pathname.replace(/\/$/, ""))?.[0] || "kanji";
      function setSection(section, updateUrl = true) {
        if (!popover.root.hidden) hideKanjiPopover();
        const story = section === "story";
        const game = section === "game";
        document.title = `마나보 | ${story ? "한자 독해" : game ? "한자 문제" : "한자 도감"}`;
        els.kanjiView.hidden = story || game;
        els.storyView.hidden = !story;
        els.gameView.hidden = !game;
        els.navKanji.classList.toggle("active", !story && !game);
        els.navStory.classList.toggle("active", story);
        els.navGame.classList.toggle("active", game);
        for (const [key, link] of [["kanji", els.navKanji], ["story", els.navStory], ["game", els.navGame]]) {
          if (key === section) link.setAttribute("aria-current", "page");
          else link.removeAttribute("aria-current");
        }
        if (updateUrl && location.pathname !== sectionPaths[section]) {
          history.pushState(null, "", sectionPaths[section]);
        }
        requestAnimationFrame(() =>
          window.scrollTo({ top: 0, behavior: "smooth" }),
        );
      }
      function navigateToKanji(ch, showBack = true) {
        setSection("kanji");
        const target = DATA.find((d) => text(d["한자"]) === ch);
        if (!target) return;

        let index = view.findIndex((d) => text(d["한자"]) === ch);
        if (index < 0) {
          els.search.value = "";
          els.grade.value = "";
          els.jlpt.value = "";
          selectedStroke = null;
          selectedSound = null;
          if (
            els.sort.value === "ministry" &&
            !Number.isFinite(numberOrInf(target["문부성"]))
          )
            els.sort.value = "memory";
          apply();
          index = view.findIndex((d) => text(d["한자"]) === ch);
        }
        if (index < 0) return;

        while (rendered <= index) appendBatch();
        requestAnimationFrame(() => {
          const card = findRenderedCard(ch);
          if (!card) return;
          card.classList.toggle("flipped", showBack);
          card.setAttribute("aria-pressed", showBack ? "true" : "false");
          card.classList.remove("jump-target");
          void card.offsetWidth;
          card.classList.add("jump-target");
          card.scrollIntoView({
            behavior: "smooth",
            block: "center",
            inline: "nearest",
          });
          setTimeout(() => card.classList.remove("jump-target"), 1400);
        });
      }
      function navigateToKanjiFilter(filter, value) {
        clearTimeout(timer);
        closeKanjiDetail();
        setSection("kanji");
        els.search.value = "";
        els.grade.value = "";
        els.jlpt.value = "";
        els.sort.value = "memory";
        selectedStroke = null;
        selectedSound = null;
        els[filter].value = value;
        const query = new URLSearchParams({ [filter]: value });
        history.replaceState(null, "", `${sectionPaths.kanji}?${query}`);
        apply();
        els[filter].focus({ preventScroll: true });
      }
      function selectStory(id, scroll = true) {
        if (!STORIES.some((s) => s.id === id)) return;
        activeStoryId = id;
        renderStory();
        if (scroll)
          requestAnimationFrame(() =>
            document
              .querySelector(".story-article")
              ?.scrollIntoView({ behavior: "smooth", block: "start" }),
          );
      }
      function renderStoryNavigation() {
        const addButtons = (container, stories) => {
          container.replaceChildren();
          stories.forEach((story) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "story-level available";
            button.textContent = storyDisplayLabel(story.level);
            button.classList.toggle("active", story.id === activeStoryId);
            button.setAttribute(
              "aria-current",
              story.id === activeStoryId ? "true" : "false",
            );
            button.addEventListener("click", () => selectStory(story.id));
            container.append(button);
          });
        };
        addButtons(
          els.gradeStoryLevels,
          STORIES.filter((s) => s.category === "학년별"),
        );
        addButtons(
          els.jlptStoryLevels,
          STORIES.filter((s) => s.category === "JLPT"),
        );
      }
      function renderStory() {
        const story = STORIES.find((s) => s.id === activeStoryId);
        const version = story?.versions?.[0];
        renderStoryNavigation();
        els.storyTitle.textContent = story?.title || "";
        if (!version || !text(version.body)) {
          els.storyCopy.innerHTML =
            '<div class="story-empty">등록된 스토리가 없습니다.</div>';
          return;
        }
        els.storyCopy.replaceChildren();
        text(version.body)
          .split(/\n+/)
          .filter(Boolean)
          .forEach((line) => {
            const p = document.createElement("p");
            if (/^[“‘"']/.test(line)) p.className = "story-quote";
            appendLinkedCharacters(p, line, "", "story");
            els.storyCopy.append(p);
          });
      }

      const gameState = {
        pool: [],
        questions: [],
        wrong: [],
        index: 0,
        score: 0,
        answered: false,
        finished: false,
      };
      function shuffled(items) {
        const copy = items.slice();
        for (let i = copy.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [copy[i], copy[j]] = [copy[j], copy[i]];
        }
        return copy;
      }
      function getGamePool() {
        const grade = els.gameGrade.value,
          jlpt = els.gameJlpt.value;
        return DATA.filter((d) => {
          const meaning = text(d["훈, 음"]);
          return (
            text(d["한자"]) &&
            meaning &&
            text(d["학년"]) !== "참고" &&
            (!grade || text(d["학년"]) === grade) &&
            (!jlpt || text(d["등급"]) === jlpt)
          );
        });
      }
      function makeGameChoices(question) {
        const correct = text(question["훈, 음"]),
          labels = [correct];
        shuffled(gameState.pool).some((d) => {
          const label = text(d["훈, 음"]);
          if (
            label &&
            text(d["한자"]) !== text(question["한자"]) &&
            !labels.includes(label)
          )
            labels.push(label);
          return labels.length === 4;
        });
        return shuffled(labels);
      }
      function renderGameQuestion() {
        const question = gameState.questions[gameState.index];
        if (!question) return;
        gameState.answered = false;
        gameState.finished = false;
        els.gameQuestion.classList.remove("result");
        els.gameQuestionLabel.textContent = "";
        els.gameQuestionLabel.hidden = true;
        els.gameGlyph.textContent = text(question["한자"]);
        els.gamePicture.hidden = false;
        els.gameProgress.textContent = `${gameState.index + 1} / ${gameState.questions.length}`;
        els.gameScore.textContent = gameState.score;
        els.gameProgressBar.style.width = `${((gameState.index + 1) / gameState.questions.length) * 100}%`;
        els.gameFeedback.textContent = "";
        els.gameMistakes.hidden = true;
        els.gameMistakesList.replaceChildren();
        els.gameChoices.hidden = false;
        els.gameChoices.replaceChildren();
        els.gameNext.hidden = true;
        els.gameNext.textContent =
          gameState.index === gameState.questions.length - 1
            ? "결과 보기"
            : "다음 문제";
        els.gameSettingsButton.hidden = true;
        const correct = text(question["훈, 음"]);
        makeGameChoices(question).forEach((label) => {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "game-choice";
          button.textContent = label;
          button.addEventListener("click", () => {
            if (gameState.answered) return;
            gameState.answered = true;
            const right = label === correct;
            if (right) gameState.score++;
            else gameState.wrong.push(question);
            [...els.gameChoices.children].forEach((choice) => {
              choice.disabled = true;
              if (choice.textContent === correct)
                choice.classList.add("correct");
            });
            if (!right) button.classList.add("wrong");
            els.gameScore.textContent = gameState.score;
            els.gameFeedback.textContent = right
              ? "⭕️ | 정답입니다."
              : `❌ | 정답은 ‘${correct}’입니다.`;
            els.gameNext.hidden = false;
            els.gameNext.focus();
          });
          els.gameChoices.append(button);
        });
      }
      function showGameResult() {
        gameState.finished = true;
        els.gameQuestion.classList.add("result");
        els.gameQuestionLabel.textContent = "게임 완료";
        els.gameQuestionLabel.hidden = false;
        const rate = Math.round(
          (gameState.score / gameState.questions.length) * 100,
        );
        els.gameGlyph.textContent = `${gameState.score}문제를 맞혔습니다. (정답률 ${rate}%)`;
        els.gamePicture.hidden = true;
        els.gameProgress.textContent = `${gameState.questions.length} / ${gameState.questions.length}`;
        els.gameProgressBar.style.width = "100%";
        els.gameChoices.hidden = true;
        els.gameFeedback.textContent = "";
        els.gameMistakes.hidden = false;
        els.gameMistakesList.replaceChildren();
        els.gameMistakesTitle.textContent = gameState.wrong.length
          ? `틀린 한자 ${gameState.wrong.length}자`
          : "틀린 한자가 없습니다.";
        els.gameMistakesGuide.hidden = !gameState.wrong.length;
        gameState.wrong.forEach((d) => {
          const glyph = makeKanjiLink(text(d["한자"]), "");
          glyph.classList.add("game-mistake-glyph");
          els.gameMistakesList.append(glyph);
        });
        els.gameNext.textContent = "같은 조건으로 다시";
        els.gameNext.hidden = false;
        els.gameSettingsButton.hidden = false;
      }
      function startGame() {
        const pool = getGamePool(),
          count = Math.min(Number(els.gameCount.value) || 10, pool.length);
        if (pool.length < 4) {
          els.gamePlay.hidden = false;
          els.gameFeedback.textContent =
            "조건에 맞는 한자가 부족합니다. 다른 학년이나 JLPT를 선택해 주세요.";
          return;
        }
        gameState.pool = pool;
        gameState.questions = shuffled(pool).slice(0, count);
        gameState.wrong = [];
        gameState.index = 0;
        gameState.score = 0;
        els.gameSetup.hidden = true;
        els.gamePlay.hidden = false;
        renderGameQuestion();
      }
      function returnToGameSettings() {
        els.gamePlay.hidden = true;
        els.gameSetup.hidden = false;
        els.gameFeedback.textContent = "";
        els.gameMistakes.hidden = true;
      }
      window.addEventListener("popstate", () => {
        closeKanjiDetail();
        setSection(sectionFromPath(), false);
      });
      els.gameStart.addEventListener("click", startGame);
      els.gamePicture.addEventListener("click", () => {
        const question = gameState.questions[gameState.index];
        if (question && !gameState.finished)
          openImageViewer(question, els.gamePicture);
      });
      els.gameNext.addEventListener("click", () => {
        if (gameState.finished) {
          startGame();
          return;
        }
        gameState.index++;
        if (gameState.index >= gameState.questions.length) showGameResult();
        else renderGameQuestion();
      });
      els.gameSettingsButton.addEventListener("click", returnToGameSettings);
      popover.go.addEventListener("click", () => {
        if (popoverKanji) openKanjiDetail(popoverKanji);
      });
      popover.root.addEventListener("mouseenter", () =>
        clearTimeout(popoverCloseTimer),
      );
      popover.root.addEventListener("mouseleave", schedulePopoverClose);
      document.addEventListener("pointerdown", (e) => {
        if (
          !popover.root.hidden &&
          !popover.root.contains(e.target) &&
          !e.target.closest(".kanji-link")
        )
          hideKanjiPopover();
      });
      detail.close.addEventListener("click", closeKanjiDetail);
      detail.back.addEventListener("click", goBackKanjiDetail);
      detail.overlay.addEventListener("click", (e) => {
        if (e.target === detail.overlay) closeKanjiDetail();
      });
      imageViewer.close.addEventListener("click", closeImageViewer);
      imageViewer.overlay.addEventListener("click", (e) => {
        if (
          e.target === imageViewer.overlay ||
          e.target.classList.contains("image-stage")
        )
          closeImageViewer();
      });
      ["contextmenu", "dragstart", "selectstart"].forEach((type) =>
        imageViewer.overlay.addEventListener(type, (e) => e.preventDefault()),
      );
      document.addEventListener("keydown", (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
          e.preventDefault();
          return;
        }
        if (e.key !== "Escape") return;
        if (!imageViewer.overlay.hidden) closeImageViewer();
        else if (!detail.overlay.hidden) closeKanjiDetail();
        else if (!popover.root.hidden) {
          const anchor = popoverAnchor;
          hideKanjiPopover();
          anchor?.focus();
        }
      });
      window.addEventListener(
        "scroll",
        () => {
          if (!popover.root.hidden) hideKanjiPopover();
        },
        { passive: true },
      );
      window.addEventListener("resize", () => {
        if (!popover.root.hidden && popoverAnchor)
          positionKanjiPopover(popoverAnchor);
      });

      function searchable(d) {
        return [d["한자"], d["훈, 음"], d["훈"], d["음"]]
          .map(text)
          .join(" ")
          .toLowerCase();
      }
      function matchesSearch(d, q) {
        if (!q) return true;
        const strokeQuery = q.match(/^(\d+)\s*획?$/);
        if (strokeQuery) return numberOrInf(d["획"]) === Number(strokeQuery[1]);
        return searchable(d).includes(q);
      }
      function apply() {
        const q = els.search.value.trim().toLowerCase();
        const g = els.grade.value;
        const j = els.jlpt.value;
        const sortMode = els.sort.value;
        const isMinistry = sortMode === "ministry";
        const base = isMinistry
          ? DATA.filter((d) => Number.isFinite(numberOrInf(d["문부성"])))
          : DATA;
        const filtered = base.filter(
          (d) =>
            matchesSearch(d, q) &&
            (!g || text(d["학년"]) === g) &&
            (!j || text(d["등급"]) === j),
        );
        if (sortMode !== "strokes") selectedStroke = null;
        if (sortMode !== "sound") selectedSound = null;
        if (sortMode === "strokes" && selectedStroke !== null)
          view = filtered.filter(
            (d) => numberOrInf(d["획"]) === selectedStroke,
          );
        else if (sortMode === "sound" && selectedSound !== null)
          view = filtered.filter((d) => soundGroup(d["음"]) === selectedSound);
        else view = filtered.slice();
        const sorters = {
          memory: (a, b) => numberOrInf(a["암기순"]) - numberOrInf(b["암기순"]),
          ministry: (a, b) =>
            numberOrInf(a["문부성"]) - numberOrInf(b["문부성"]) ||
            numberOrInf(a["암기순"]) - numberOrInf(b["암기순"]),
          strokes: (a, b) =>
            numberOrInf(a["획"]) - numberOrInf(b["획"]) ||
            compareKorean(a["음"], b["음"]) ||
            compareKorean(a["훈"], b["훈"]) ||
            numberOrInf(a["암기순"]) - numberOrInf(b["암기순"]),
          sound: (a, b) =>
            compareKorean(a["음"], b["음"]) ||
            compareKorean(a["훈"], b["훈"]) ||
            numberOrInf(a["획"]) - numberOrInf(b["획"]) ||
            numberOrInf(a["암기순"]) - numberOrInf(b["암기순"]),
        };
        view.sort(sorters[sortMode] || sorters.memory);
        rendered = 0;
        els.grid.replaceChildren();
        els.resultCount.textContent = view.length.toLocaleString("ko-KR");
        const sortLabel =
          {
            memory: "마나보 추천순",
            ministry: "상용한자순",
            strokes: "획순",
            sound: "가나다순",
          }[sortMode] || "마나보 추천순";
        if (sortMode === "strokes" && selectedStroke !== null)
          els.sortLabel.textContent = `${sortLabel} · ${selectedStroke}획`;
        else if (sortMode === "sound" && selectedSound !== null)
          els.sortLabel.textContent = `${sortLabel} · ${selectedSound}`;
        else els.sortLabel.textContent = sortLabel;
        renderSortIndex(sortMode, filtered);
        if (!view.length) {
          const empty = document.createElement("div");
          empty.className = "empty";
          empty.textContent = "조건에 맞는 한자가 없습니다.";
          els.grid.append(empty);
          els.sentinel.textContent = "";
          return;
        }
        appendBatch();
      }

      function createCard(d, isDetail = false) {
        const card = document.createElement("article");
        card.className = isDetail ? "card detail-card" : "card";
        card.dataset.kanji = text(d["한자"]);
        card.tabIndex = 0;
        card.setAttribute("role", "button");
        card.setAttribute("aria-label", `${text(d["한자"])} 카드 뒤집기`);
        card.setAttribute("aria-pressed", "false");
        const inner = document.createElement("div");
        inner.className = "card-inner";

        const front = document.createElement("section");
        front.className = "face front";
        const glyph = document.createElement("div");
        glyph.className = "glyph";
        glyph.textContent = text(d["한자"]);
        const meaning = document.createElement("div");
        meaning.className = "front-meaning";
        meaning.textContent = text(d["훈, 음"]);
        front.append(glyph, meaning);

        const back = document.createElement("section");
        back.className = "face back";
        const visual = document.createElement("div");
        visual.className = "visual";
        visual.addEventListener("contextmenu", (e) => e.preventDefault());
        visual.addEventListener("dragstart", (e) => e.preventDefault());
        const fallback = document.createElement("div");
        fallback.className = "fallback";
        fallback.textContent = text(d["한자"]);
        visual.append(fallback);
        const urls = imageCandidates(d["이미지 1"]);
        if (urls.length) {
          const img = document.createElement("img");
          img.alt = `${text(d["한자"])} 암기 이미지`;
          img.loading = "lazy";
          img.decoding = "async";
          img.draggable = false;
          let attempt = 0;
          img.addEventListener("load", () => fallback.remove());
          img.addEventListener("error", () => {
            attempt++;
            if (attempt < urls.length) {
              img.src = urls[attempt];
            } else {
              img.remove();
            }
          });
          img.src = urls[0];
          visual.append(img);
        }
        visual.tabIndex = 0;
        visual.setAttribute("role", "button");
        visual.setAttribute("aria-label", `${text(d["한자"])} 카드 앞면 보기`);
        visual.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!card.classList.contains("detail-card")) toggle();
        });
        visual.addEventListener("keydown", (e) => {
          if (
            !card.classList.contains("detail-card") &&
            e.target === visual &&
            (e.key === "Enter" || e.key === " ")
          ) {
            e.preventDefault();
            e.stopPropagation();
            toggle();
          }
        });
        const detailButton = document.createElement("button");
        detailButton.type = "button";
        detailButton.className = "card-detail-button";
        detailButton.textContent = "한자 자세히 보기";
        detailButton.setAttribute(
          "aria-label",
          `${text(d["한자"])} 한자 자세히 보기`,
        );
        detailButton.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!card.classList.contains("detail-card"))
            openKanjiDetail(text(d["한자"]), detailButton);
        });
        visual.append(detailButton);
        const body = document.createElement("div");
        body.className = "back-body";
        const chips = document.createElement("div");
        chips.className = "chips";
        [
          { value: text(d["학년"]), filter: "grade" },
          { value: text(d["등급"]), filter: "jlpt" },
          { value: !isDetail && text(d["획"]) ? `${text(d["획"])}획` : "" },
        ]
          .filter(({ value }) => Boolean(value))
          .forEach(({ value, filter }) => {
            const clickable = isDetail && filter &&
              [...els[filter].options].some((option) => option.value === value);
            const c = document.createElement(clickable ? "button" : "span");
            c.className = "chip";
            c.textContent = displayLabel(value);
            if (clickable) {
              c.type = "button";
              c.setAttribute("aria-label", `${displayLabel(value)} 한자 모아 보기`);
              c.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                navigateToKanjiFilter(filter, value);
              });
            }
            chips.append(c);
          });
        if (chips.childElementCount) {
          if (isDetail) {
            chips.classList.add("detail-image-meta");
            visual.append(chips);
          } else body.append(chips);
        }
        const strokeOrderUrls = imageCandidates(d["획순 이미지"]);
        const strokeCount = text(d["획"]);
        const koreanReading = text(d["훈, 음"]);
        if (isDetail && (strokeOrderUrls.length || strokeCount || koreanReading)) {
          const section = document.createElement("div");
          section.className = "info-section stroke-order-info";
          if (strokeOrderUrls.length) {
            const frame = document.createElement("div");
            frame.className = "stroke-order-frame";
            const img = document.createElement("img");
            img.className = "stroke-order-image";
            img.alt = `${text(d["한자"])} 획순`;
            img.loading = "lazy";
            img.decoding = "async";
            img.draggable = false;
            let attempt = 0;
            img.addEventListener("error", () => {
              attempt++;
              if (attempt < strokeOrderUrls.length) {
                img.src = strokeOrderUrls[attempt];
              } else {
                frame.remove();
                if (!strokeCount && !koreanReading) section.remove();
              }
            });
            img.src = strokeOrderUrls[0];
            frame.append(img);
            section.append(frame);
          }
          const metadata = document.createElement("div");
          metadata.className = "stroke-order-meta";
          if (koreanReading) {
            const reading = document.createElement("div");
            reading.className = "korean-reading-info";
            const label = document.createElement("div");
            label.className = "section-label";
            label.textContent = "한국한자";
            const value = document.createElement("div");
            value.className = "desc";
            value.textContent = koreanReading;
            reading.append(label, value);
            metadata.append(reading);
          }
          if (strokeCount) {
            const count = document.createElement("div");
            count.className = "stroke-count-info";
            const label = document.createElement("div");
            label.className = "section-label";
            label.textContent = "총획수";
            const value = document.createElement("div");
            value.className = "desc";
            value.textContent = `${strokeCount}획`;
            count.append(label, value);
            metadata.append(count);
          }
          if (metadata.childElementCount) section.append(metadata);
          body.append(section);
        }
        if (text(d["풀이"])) {
          const l = document.createElement("div");
          l.className = "info-section mnemonic-info";
          l.innerHTML = '<div class="section-label">암기 풀이</div>';
          const p = document.createElement("div");
          p.className = "desc";
          appendMnemonicText(p, d["풀이"], text(d["한자"]));
          l.append(p);
          body.append(l);
        }
        const readingRows = parseReadings(d["발음"]);
        if (readingRows.length) {
          const l = document.createElement("div");
          l.className = "info-section reading-info";
          l.innerHTML = '<div class="section-label">읽기</div>';
          const groups = document.createElement("div");
          groups.className = "reading-groups";
          readingRows.forEach((r) => {
            const row = document.createElement("div");
            row.className = "reading-row";
            const type = document.createElement("span");
            type.className = "reading-type";
            type.textContent = r.label;
            const value = document.createElement("span");
            value.className = "reading-value";
            value.textContent = r.value;
            row.append(type, value);
            groups.append(row);
          });
          l.append(groups);
          body.append(l);
        }
        const exGroups = parseExamples(d["예시단어"]);
        if (exGroups.length) {
          const l = document.createElement("div");
          l.className = "info-section examples-info";
          l.innerHTML = '<div class="section-label">예시 단어</div>';
          const wrap = document.createElement("div");
          wrap.className = "example-groups";
          exGroups.forEach((g) => {
            const group = document.createElement("div");
            group.className = "example-group";
            const heading = document.createElement("div");
            heading.className = "example-heading";
            const type = document.createElement("span");
            type.className = "example-type";
            type.textContent = g.label;
            heading.append(type);
            const list = document.createElement("div");
            list.className = "example-list";
            appendExampleText(list, g.items.join("\n"), text(d["한자"]));
            group.append(heading, list);
            wrap.append(group);
          });
          l.append(wrap);
          body.append(l);
        }
        if (isDetail) {
          const components = mnemonicComponents(d["풀이"]);
          if (components.length) {
            const section = document.createElement("div");
            section.className = "info-section related-kanji-info";
            section.innerHTML = '<div class="section-label">관련 한자</div>';
            const groups = document.createElement("div");
            groups.className = "related-kanji-groups";
            for (const component of components) {
              const group = document.createElement("div");
              group.className = "related-kanji-group";
              const label = document.createElement("div");
              label.className = "related-kanji-component";
              label.textContent = component;
              const list = document.createElement("div");
              list.className = "related-kanji-list";
              const related = new Set([component, ...(RELATED_KANJI.get(component) || [])]);
              for (const ch of related) {
                if (ch === text(d["한자"])) continue;
                const item = document.createElement("span");
                item.className = "related-kanji-item";
                item.append(makeKanjiLink(ch, text(d["한자"])));
                list.append(item);
              }
              if (list.childElementCount) {
                group.append(label, list);
                groups.append(group);
              }
            }
            if (groups.childElementCount) {
              section.append(groups);
              body.append(section);
            }
          }
        }
        const hasLinkedKanji = Boolean(body.querySelector(".kanji-link"));
        const learningPanel = isDetail ? document.createElement("div") : null;
        if (learningPanel) {
          learningPanel.className = "detail-learning-panel";
          learningPanel.append(visual);
        }
        if (isDetail && hasLinkedKanji) {
          for (const section of body.querySelectorAll(".examples-info, .related-kanji-info")) {
            const guide = document.createElement("p");
            guide.className = "detail-link-guide";
            guide.textContent =
              "모르는 한자를 눌러 뜻과 정보를 확인해 보세요.";
            const heading = document.createElement("div");
            heading.className = "info-section-heading";
            heading.append(section.querySelector(".section-label"), guide);
            section.prepend(heading);
          }
        }
        back.append(learningPanel || visual, body);
        inner.append(front, back);
        card.append(inner);
        const toggle = () => {
          card.classList.toggle("flipped");
          card.setAttribute(
            "aria-pressed",
            card.classList.contains("flipped") ? "true" : "false",
          );
        };
        card.addEventListener("click", (e) => {
          if (card.classList.contains("detail-card")) return;
          toggle();
        });
        card.addEventListener("keydown", (e) => {
          if (
            !card.classList.contains("detail-card") &&
            (e.key === "Enter" || e.key === " ")
          ) {
            e.preventDefault();
            toggle();
          }
        });
        return card;
      }
      function appendBatch() {
        if (rendered >= view.length) {
          els.sentinel.textContent = "";
          return;
        }
        const frag = document.createDocumentFragment();
        view
          .slice(rendered, rendered + BATCH)
          .forEach((d) => frag.append(createCard(d)));
        els.grid.append(frag);
        rendered = Math.min(rendered + BATCH, view.length);
        els.sentinel.textContent =
          rendered < view.length
            ? `${rendered.toLocaleString("ko-KR")} / ${view.length.toLocaleString("ko-KR")} · 아래로 내려 더 보기`
            : "";
      }

      let timer;
      els.search.addEventListener("input", () => {
        clearTimeout(timer);
        timer = setTimeout(apply, 120);
      });
      [els.grade, els.jlpt].forEach((el) =>
        el.addEventListener("change", apply),
      );
      els.sort.addEventListener("change", () => {
        selectedStroke = null;
        selectedSound = null;
        apply();
      });
      els.reset.addEventListener("click", () => {
        els.search.value = "";
        els.grade.value = "";
        els.jlpt.value = "";
        els.sort.value = "memory";
        selectedStroke = null;
        selectedSound = null;
        apply();
      });
      new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting) appendBatch();
        },
        { rootMargin: "700px 0px" },
      ).observe(els.sentinel);

      const scrollTopButton = document.getElementById("scrollTop");
      const updateScrollTopButton = () =>
        scrollTopButton.classList.toggle("visible", window.scrollY > 480);
      window.addEventListener("scroll", updateScrollTopButton, {
        passive: true,
      });
      scrollTopButton.addEventListener("click", () =>
        window.scrollTo({ top: 0, behavior: "smooth" }),
      );
      updateScrollTopButton();

      async function bootstrap() {
        try {
          setSection(sectionFromPath(), false);
          await loadSavedData();
          populateFilters();
          const params = new URLSearchParams(location.search);
          for (const filter of ["grade", "jlpt"]) {
            const value = params.get(filter);
            if (value && [...els[filter].options].some((option) => option.value === value)) els[filter].value = value;
          }
          renderStory();
          apply();
          const requestedKanji = decodeURIComponent(
            (location.hash.match(/^#kanji=(.*)$/) || [])[1] || "",
          );
          if (requestedKanji && KANJI_SET.has(requestedKanji)) {
            requestAnimationFrame(() => navigateToKanji(requestedKanji, true));
          }
        } catch (error) {
          console.error("[마나보] 학습 데이터를 불러오지 못했습니다.", error);
          document.documentElement.dataset.dataSource = "error";
          els.resultCount.textContent = "0";
          els.grid.replaceChildren();
          els.sentinel.replaceChildren();
          const message = document.createElement("span");
          message.setAttribute("role", "alert");
          message.textContent =
            "학습 데이터를 불러오지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요. ";
          const retry = document.createElement("button");
          retry.type = "button";
          retry.textContent = "다시 시도";
          retry.addEventListener("click", bootstrap, { once: true });
          els.sentinel.append(message, retry);
        }
      }
      bootstrap();

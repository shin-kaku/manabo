import { studySeo } from "./seo.js";
import { loadMedia, mediaCandidates } from "./media.js";
import { displayLabel, fillPopoverMeta, placeKanjiPopover } from "./kanji-popover.js";
import { characterDetailPath, studyDetailHref } from "./study-path.js";

      let DATA = [];
      const els = {
        storyView: document.getElementById("storyView"),
        gameView: document.getElementById("gameView"),
        navGame: document.getElementById("navGame"),
        readingSetup: document.getElementById("readingSetup"),
        readingJlpt: document.getElementById("readingJlpt"),
        readingGrade: document.getElementById("readingGrade"),
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
      const defaultStoryId = "story-1";
      let activeStoryId = "";

      const text = (v) => (v ?? "").toString().trim();
      const storyDisplayLabel = (v) =>
        text(v)
          .replace(/^JLPT N([1-5])\((\d+)\)$/, "JLPT N$1-$2")
          .replace(/^(?:초등학교|초등|초)\s*(\d+)(?:학년)?$/, "초등 $1")
          .replace(/^(?:중학교|중학|중등)\s*(\d+)(?:학년)?$/, "중등$1")
          .replace(/^(?:고등학교|고교|고등)\s*(\d+)(?:학년)?$/, "고등 $1");
      let kanjiMap = new Map();
      let kanjiReady = false, storiesReady = false;
      let kanjiRequest = null, storiesRequest = null;
      let activation = 0;
      const learningStatus = document.getElementById("learningStatus");
      const learningMessage = document.getElementById("learningMessage");
      const learningRetry = document.getElementById("learningRetry");
      async function fetchSavedRows(name) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 20000);
        try {
          const response = await fetch(`/data/${name}.json`, { signal: controller.signal });
          if (!response.ok) throw new Error(`${name} HTTP ${response.status}`);
          const rows = await response.json();
          if (!Array.isArray(rows) || !rows.length) throw new Error(`${name} 데이터 형식 오류`);
          return rows;
        } finally {
          clearTimeout(timeout);
        }
      }
      function ensureKanji() {
        if (kanjiReady) return Promise.resolve();
        if (!kanjiRequest) kanjiRequest = (async () => {
          [DATA] = await Promise.all([fetchSavedRows("kanji"), loadMedia()]);
          kanjiMap = new Map(DATA.map(row => [text(row["한자"]), row]));
          populateFilters();
          kanjiReady = true;
        })().finally(() => { kanjiRequest = null; });
        return kanjiRequest;
      }
      function ensureStories() {
        if (storiesReady) return Promise.resolve();
        if (!storiesRequest) storiesRequest = (async () => {
          STORIES = await fetchSavedRows("stories");
          storiesReady = true;
        })().finally(() => { storiesRequest = null; });
        return storiesRequest;
      }
      async function activateSection(section) {
        const version = ++activation;
        learningStatus.hidden = false;
        learningStatus.setAttribute("role", "status");
        learningMessage.textContent = "학습 데이터를 불러오는 중입니다.";
        learningRetry.hidden = true;
        els.gameStart.disabled = !kanjiReady;
        const screen = section === "story" ? els.storyView : els.gameView;
        screen.setAttribute("aria-busy", "true");
        try {
          await Promise.all([ensureKanji(), ...(section === "story" ? [ensureStories()] : [])]);
          if (version !== activation) return false;
          learningStatus.hidden = true;
          document.documentElement.dataset.dataSource = "saved";
          els.gameStart.disabled = false;
          if (section === "story") {
            // A native form submission before startup can include both range controls.
            const requestedStory = new URLSearchParams(location.search).getAll("story").filter(Boolean).at(-1);
            activeStoryId = STORIES.find((story) => story.id === requestedStory)?.id ||
              STORIES.find((story) => story.id === defaultStoryId)?.id || STORIES[0].id;
            renderStory();
          }
          return true;
        } catch (error) {
          if (version !== activation) return false;
          document.documentElement.dataset.dataSource = "error";
          learningStatus.setAttribute("role", "alert");
          learningMessage.textContent = "학습 데이터를 불러오지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.";
          learningRetry.hidden = false;
          return false;
        } finally {
          screen.setAttribute("aria-busy", "false");
        }
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
        for (const [select, label] of [[els.gameGrade, "학년 전체"], [els.gameJlpt, "JLPT 전체"]]) {
          select.replaceChildren(new Option(label, ""));
        }
        const grades = [
          ...new Set(
            DATA.map((d) => text(d["학년"])).filter(Boolean),
          ),
        ].sort(sortGrade);
        const jlpts = [
          ...new Set(DATA.map((d) => text(d["등급"])).filter(Boolean)),
        ].sort((a, b) => {
          const na = Number((a.match(/N(\d)/) || [])[1] || 99),
            nb = Number((b.match(/N(\d)/) || [])[1] || 99);
          return nb - na || a.localeCompare(b); // N5 -> N1
        });
        grades.filter((v) => v !== "참고").forEach((v) =>
          els.gameGrade.add(new Option(storyDisplayLabel(v), v)),
        );
        jlpts.forEach((v) => els.gameJlpt.add(new Option(displayLabel(v), v)));
      }

      const popover = {
        root: document.getElementById("kanjiPopover"),
        glyph: document.getElementById("popoverGlyph"),
        meaning: document.getElementById("popoverMeaning"),
        meta: document.getElementById("popoverMeta"),
        note: document.getElementById("popoverNote"),
        go: document.getElementById("popoverGo"),
      };
      const imageViewer = {
        overlay: document.getElementById("imageOverlay"),
        image: document.getElementById("imageZoom"),
        fallback: document.getElementById("imageFallback"),
        close: document.getElementById("imageClose"),
      };
      let popoverKanji = "",
        popoverAnchor = null,
        popoverAnchorRect = null,
        popoverHoverTimer = null;
      let imageReturnFocus = null;
      const backgroundInert = new Map();
      function activeModal() {
        return imageViewer.overlay.hidden ? null : imageViewer.overlay;
      }
      function syncModalState() {
        const modal = activeModal();
        if (!modal) {
          for (const [node, wasInert] of backgroundInert) node.inert = wasInert;
          backgroundInert.clear();
        } else {
          for (const node of document.body.children) {
            if (["SCRIPT", "STYLE", "LINK"].includes(node.tagName)) continue;
            if (!backgroundInert.has(node)) backgroundInert.set(node, node.inert);
            node.inert = node !== modal;
          }
        }
        document.body.classList.toggle("detail-open", Boolean(modal));
      }
      function modalFocusables() {
        const modal = activeModal();
        if (!modal) return [];
        return [...modal.querySelectorAll('button, a[href], input, select, textarea, [tabindex]')]
          .filter((node) => node.tabIndex >= 0 && !node.disabled && !node.closest('[inert], [hidden]') && node.getClientRects().length);
      }
      function restoreFocus(opener) {
        const available = (node) => node?.isConnected && !node.closest('[hidden], [inert]') && node.getClientRects().length && !node.disabled;
        const fallback = activeModal()?.querySelector('[role="dialog"]') || document.querySelector('.site-tab[aria-current="page"]');
        const target = available(opener) ? opener : modalFocusables()[0] || fallback;
        target?.focus({ preventScroll: true });
      }
      document.addEventListener("focusin", (event) => {
        const modal = activeModal();
        if (!modal || modal.contains(event.target)) return;
        (modalFocusables()[0] || modal.querySelector('[role="dialog"]')).focus();
      });
      new MutationObserver(() => { if (activeModal()) syncModalState(); })
        .observe(document.body, { childList: true });
      function positionKanjiPopover(anchor) {
        popoverAnchorRect = anchor.getBoundingClientRect();
        placeKanjiPopover(popover.root, popoverAnchorRect);
      }
      function showKanjiPopover(ch, anchor) {
        clearTimeout(popoverHoverTimer);
        const d = kanjiMap.get(ch);
        if (!d) return;
        if (popoverAnchor && popoverAnchor !== anchor)
          popoverAnchor.setAttribute("aria-expanded", "false");
        popoverKanji = ch;
        popoverAnchor = anchor;
        popoverAnchorRect = anchor.getBoundingClientRect();
        popover.glyph.textContent = ch;
        popover.meaning.textContent = text(d["훈, 음"]);
        fillPopoverMeta(popover.meta, [text(d["학년"]), text(d["등급"])]);
        popover.note.textContent = text(d["풀이"]);
        popover.note.hidden = !text(d["풀이"]);
        popover.root.hidden = false;
        anchor.setAttribute("aria-expanded", "true");
        syncModalState();
        requestAnimationFrame(() => positionKanjiPopover(anchor));
      }
      function hideKanjiPopover() {
        clearTimeout(popoverHoverTimer);
        if (popoverAnchor) popoverAnchor.setAttribute("aria-expanded", "false");
        popover.root.hidden = true;
        popoverKanji = "";
        popoverAnchor = null;
        popoverAnchorRect = null;
        syncModalState();
      }
      function closePopoverOnLeave(event) {
        clearTimeout(popoverHoverTimer);
        const next = event.relatedTarget;
        if (next && (popover.root.contains(next) || popoverAnchor?.contains(next)))
          return;
        hideKanjiPopover();
      }
      function openImageViewer(d, returnFocus) {
        hideKanjiPopover();
        const ch = text(d["한자"]),
          urls = mediaCandidates(d, "image1", "detail");
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
        syncModalState();
        imageViewer.close.focus();
      }
      function closeImageViewer() {
        if (imageViewer.overlay.hidden) return;
        imageViewer.overlay.hidden = true;
        imageViewer.image.removeAttribute("src");
        imageViewer.image.hidden = true;
        imageViewer.image.onload = null;
        imageViewer.image.onerror = null;
        syncModalState();
        restoreFocus(imageReturnFocus);
        imageReturnFocus = null;
      }
      function makeKanjiLink(ch) {
        if (!kanjiMap.has(ch))
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
          b.addEventListener("mouseenter", () => {
            clearTimeout(popoverHoverTimer);
            // Let the pointer cross nearby kanji on its way to the popover.
            popoverHoverTimer = setTimeout(() => showKanjiPopover(ch, b), 200);
          });
          b.addEventListener("mouseleave", closePopoverOnLeave);
        }
        b.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          showKanjiPopover(ch, b);
        });
        return b;
      }
      const sectionPaths = { story: "/reading/", game: "/quiz/" };
      const sectionFromPath = () =>
        Object.entries(sectionPaths).find(([, path]) => path.replace(/\/$/, "") === location.pathname.replace(/\/$/, ""))?.[0] || "story";
      function navigateToSection(section, storyId, hash = "") {
        const url = new URL(location.href);
        url.pathname = sectionPaths[section];
        url.hash = hash;
        if (storyId) url.searchParams.set("story", storyId);
        else url.searchParams.delete("story");
        if (url.href !== location.href) history.pushState(null, "", url);
        return bootstrap();
      }
      function setSection(section) {
        if (section === "story" && !document.getElementById("storyFont")) {
          const font = document.createElement("link");
          font.id = "storyFont";
          font.rel = "stylesheet";
          font.href = "https://fonts.googleapis.com/css2?family=Nanum+Myeongjo:wght@400;700;800&display=swap";
          font.media = "print";
          font.addEventListener("load", () => { font.media = "all"; });
          document.head.append(font);
        }
        hideKanjiPopover();
        closeImageViewer();
        const story = section === "story";
        const game = section === "game";
        const seo = studySeo[section];
        document.title = seo.title;
        document.querySelector('meta[name="description"]').content = seo.description;
        document.querySelector('meta[property="og:title"]').content = seo.ogTitle || seo.title;
        document.querySelector('meta[property="og:description"]').content = seo.description;
        document.querySelector('link[rel="canonical"]').href = seo.canonical;
        document.querySelector('meta[property="og:url"]').content = seo.canonical;
        els.storyView.hidden = !story;
        els.gameView.hidden = !game;
        const card = game && ["#reading-setup", "#choice-card"].includes(location.hash)
          ? document.getElementById(location.hash.slice(1)) : null;
        if (card) card.scrollIntoView({ block: "start", behavior: "instant" });
        else window.scrollTo({ top: 0, behavior: "instant" });
        return activateSection(section);
      }
      function selectStory(id, scroll = true) {
        if (!STORIES.some((s) => s.id === id)) return;
        const restoreLevelFocus = els.gradeStoryLevels.contains(document.activeElement) || els.jlptStoryLevels.contains(document.activeElement);
        activeStoryId = id;
        const url = new URL(location.href);
        url.searchParams.set("story", id);
        history.replaceState(null, "", url);
        handledLocation = location.href;
        renderStory();
        if (restoreLevelFocus) els.storyView.querySelector('.story-level[aria-current="true"]')?.focus({ preventScroll: true });
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
        els.readingJlpt.value = story?.category === "JLPT" ? story.id : "";
        els.readingGrade.value = story?.category === "학년별" ? story.id : "";
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
            for (const ch of line) p.append(makeKanjiLink(ch));
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
        els.gameChoices.firstElementChild?.focus();
      }
      function showGameResult() {
        gameState.finished = true;
        els.gameQuestion.classList.add("result");
        els.gameQuestionLabel.textContent = "사지선다 완료";
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
          const glyph = makeKanjiLink(text(d["한자"]));
          glyph.classList.add("game-mistake-glyph");
          els.gameMistakesList.append(glyph);
        });
        els.gameNext.textContent = "같은 조건으로 다시";
        els.gameNext.hidden = false;
        els.gameSettingsButton.hidden = false;
      }
      function resetGame() {
        Object.assign(gameState, { pool: [], questions: [], wrong: [], index: 0, score: 0, answered: false, finished: false });
        els.gamePlay.hidden = true;
        els.gameSetup.hidden = false;
        els.gameQuestion.classList.remove("result");
        els.gameQuestionLabel.hidden = true;
        els.gameQuestionLabel.textContent = "";
        els.gameGlyph.textContent = "";
        els.gamePicture.hidden = true;
        els.gameChoices.replaceChildren();
        els.gameFeedback.textContent = "";
        els.gameProgress.textContent = "";
        els.gameScore.textContent = "0";
        els.gameProgressBar.style.width = "0%";
        els.gameNext.hidden = true;
        els.gameSettingsButton.hidden = true;
        els.gameMistakes.hidden = true;
        els.gameMistakesList.replaceChildren();
        document.getElementById("gameSetupError").hidden = true;
      }
      function startGame() {
        resetGame();
        if (!kanjiReady) return;
        const pool = getGamePool(),
          count = Math.min(Number(els.gameCount.value) || 10, pool.length);
        if (pool.length < 4 || new Set(pool.map((row) => text(row["훈, 음"]))).size < 4) {
          document.getElementById("gameSetupError").hidden = false;
          els.gameGrade.focus();
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
        resetGame();
        els.gameStart.focus();
      }
      window.addEventListener("popstate", () => { bootstrap(); });
      window.addEventListener("hashchange", (event) => { if (event.newURL === location.href) bootstrap(); });
      for (const link of [els.navGame, ...els.storyView.querySelectorAll(".story-exit")]) {
        link.addEventListener("click", event => {
          if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
          event.preventDefault();
          navigateToSection("game", undefined, link.hash);
          if (link.hash) document.getElementById("readingStart").focus({ preventScroll: true });
        });
      }
      els.readingSetup.addEventListener("change", event => {
        const select = event.target;
        const other = select === els.readingJlpt ? els.readingGrade : els.readingJlpt;
        if (select.value) other.value = "";
        else if (!other.value) els.readingSetup.reset();
      });
      els.readingSetup.addEventListener("submit", async event => {
        event.preventDefault();
        const storyId = els.readingGrade.value || els.readingJlpt.value || defaultStoryId;
        if (await navigateToSection("story", storyId)) els.storyTitle.focus({ preventScroll: true });
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
        if (popoverKanji) location.assign(studyDetailHref(popoverKanji, location.search));
      });
      popover.root.addEventListener("mouseenter", () => {
        clearTimeout(popoverHoverTimer);
      });
      popover.root.addEventListener("mouseleave", closePopoverOnLeave);
      document.addEventListener("pointerdown", (e) => {
        if (
          !popover.root.hidden &&
          !popover.root.contains(e.target) &&
          !e.target.closest(".kanji-link")
        )
          hideKanjiPopover();
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
        if (e.key === "Tab" && activeModal()) {
          const targets = modalFocusables();
          const index = targets.indexOf(document.activeElement);
          if (!targets.length) {
            e.preventDefault();
            activeModal().querySelector('[role="dialog"]').focus();
          } else if ((e.shiftKey && index <= 0) || (!e.shiftKey && (index < 0 || index === targets.length - 1))) {
            e.preventDefault();
            targets[e.shiftKey ? targets.length - 1 : 0].focus();
          }
          return;
        }
        if (e.key !== "Escape") return;
        if (!popover.root.hidden) {
          const anchor = popoverAnchor;
          hideKanjiPopover();
          restoreFocus(anchor);
        } else if (!imageViewer.overlay.hidden) closeImageViewer();
        else return;
        e.preventDefault();
        e.stopPropagation();
      });
      window.addEventListener(
        "scroll",
        () => {
          if (popover.root.hidden || !popoverAnchor || !popoverAnchorRect) return;
          const rect = popoverAnchor.getBoundingClientRect();
          // Focus can queue a scroll event before opening the popover. Only
          // dismiss it if its anchor actually moved since it was positioned.
          if (rect.top !== popoverAnchorRect.top || rect.left !== popoverAnchorRect.left) hideKanjiPopover();
        },
        { passive: true, capture: true },
      );
      window.addEventListener("resize", () => {
        if (!popover.root.hidden && popoverAnchor)
          positionKanjiPopover(popoverAnchor);
      });

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

      let handledLocation = "";
      async function bootstrap({ force = false } = {}) {
        const requestedLocation = location.href;
        if (!force && handledLocation === requestedLocation) return;
        handledLocation = requestedLocation;
        const requestedKanji = new URLSearchParams(location.hash.slice(1)).get("kanji");
        if (characterDetailPath(requestedKanji)) {
          location.replace(studyDetailHref(requestedKanji, location.search));
          return;
        }
        return setSection(sectionFromPath());
      }
      learningRetry.addEventListener("click", () => bootstrap({ force: true }));
      bootstrap();

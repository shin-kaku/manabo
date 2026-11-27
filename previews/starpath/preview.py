"""Serve the local study menu with the single-file kanji adventure build."""

import argparse
import io
import os
import re
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit


HERE = Path(__file__).resolve().parent
SITE = HERE.parents[1] / "dist"
GAME = HERE / "dist/starpath.html"
COVER = "/images/quiz-preview-starpath.webp"
DARK_COVER = "/images/quiz-preview-starpath-dark.webp"
GAME_TITLE = "한자 별길"
GAME_DESCRIPTION = "한 글자에서 출발해 이어진 계보를 밝혀 가는 탐험"
STUDY_PATHS = {"/learn/", "/learn/choice/", "/reading/"}
UPCOMING = re.compile(r'<div class="quiz-upcoming">\s*<strong>한자 게임</strong>\s*<span>준비 중</span>\s*</div>')
MODE = f'''<a class="quiz-tile" href="/learn/game/" aria-labelledby="starpath-name" aria-describedby="starpath-description">
  <picture class="quiz-cover">
    <source data-dark-preview media="not all" srcset="{DARK_COVER}">
    <img src="{COVER}" alt="木에서 林과 森으로 이어지는 관계 지도와 펼친 카드의 나무 그림" width="960" height="540" loading="lazy" decoding="async">
  </picture>
  <span class="quiz-tile-caption">
    <strong id="starpath-name">{GAME_TITLE}</strong>
    <span class="quiz-tile-description" id="starpath-description">{GAME_DESCRIPTION}</span>
  </span>
</a>'''
SHELF_STYLE = """<style>
#quizOptions .quiz-modes { display: contents; }
@media (551px <= width <= 800px) { #quizOptions .quiz-shelf { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>"""


def study_menu(path="/learn/"):
    # Choice, reading and the shelf share the same document on in-page navigation.
    html = (SITE / path.lstrip("/") / "index.html").read_text(encoding="utf-8")
    # Production publishing has already applied these changes to dist. Serve
    # that finished page directly instead of trying to transform it twice.
    if 'id="starpath-name"' in html:
        return html.encode("utf-8")
    html, count = UPCOMING.subn(MODE, html)
    if count != 1:
        raise ValueError("현재 빌드에서 한자 게임 준비 중 카드를 찾을 수 없습니다.")
    html = html.replace("<li>한자 게임 · 준비 중</li>", f'<li><a href="/learn/game/">{GAME_TITLE}</a> · {GAME_DESCRIPTION}</li>')
    return html.replace("</head>", SHELF_STYLE + "</head>", 1).encode("utf-8")


def fragment(html, pattern):
    match = re.search(pattern, html, re.DOTALL)
    if not match:
        raise ValueError(f"Shared study markup missing: {pattern}")
    return match.group()


def game_page(dev=False):
    study = (SITE / "learn/choice/index.html").read_text(encoding="utf-8")
    game_path = Path(os.environ["MANABO_STARPATH_DEV_GAME"]) if dev else GAME
    game = game_path.read_text(encoding="utf-8")
    # Use just the study shell and its shared stylesheet and controls.
    # The choice and reading apps do not need to run on the map.
    theme = "" if dev else fragment(study, r"<script>[^<]*manabo-theme-v1[^<]*</script>")
    consent_init = fragment(study, r'<script[^>]*>[^<]*window\.clarity\s*=[^<]*</script>')
    styles = ('<link rel="stylesheet" href="/src/styles.css"><link rel="stylesheet" href="/src/site-info.css">'
              if dev else fragment(study, r'<link [^>]*href="/assets/site-info-[^"]+\.css"[^>]*>'))
    controls = ('<script type="module" src="/src/site-info.js"></script>'
                if dev else fragment(study, r'<script [^>]*src="/assets/site-info-[^"]+\.js"[^>]*></script>'))
    icon = fragment(study, r'<link rel="icon" [^>]*>')
    navigation = fragment(study, r'<div class="wrap info-wrap">.*?</nav></div>')
    back = fragment(study, r'<div id="choiceBack" class="story-view">.*?</div>')
    footer = fragment(study, r'<footer class="site-footer">.*?</footer>')
    footer_contents = footer.removeprefix('<footer class="site-footer">').removesuffix('</footer>')
    footer = (f'<footer class="site-footer"><div class="game-footer-full">{footer_contents}</div>'
              f'<details class="game-footer-menu"><summary>사이트 정보</summary><div>{footer_contents}</div></details></footer>')
    game = game.replace('<link rel="icon" href="data:,">', "\n".join([theme, consent_init, styles, controls, icon]), 1)
    game = game.replace('<body class="standalone">', f"<body>{navigation}\n{back}", 1)
    return game.replace("</body>", f"{footer}</div></body>", 1).encode("utf-8")


class Preview(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(SITE), **kwargs)

    def translate_path(self, path):
        target = Path(super().translate_path(path))
        if urlsplit(path).path in {COVER, DARK_COVER}:
            return str(HERE / target.name)
        return str(target)

    def send_head(self):
        if urlsplit(self.path).path == "/learn/game":
            target = urlsplit(self.path)._replace(path="/learn/game/").geturl()
            self.send_response(308)
            self.send_header("Location", target)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return None
        path = urlsplit(self.path).path.removesuffix("index.html")
        if path not in STUDY_PATHS and path != "/learn/game/":
            return super().send_head()
        try:
            data = game_page() if path == "/learn/game/" else study_menu(path)
        except (OSError, ValueError) as exc:
            self.log_error("%s", exc)
            self.send_error(503, "Local study preview unavailable")
            return None
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        return io.BytesIO(data)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=49190)
    parser.add_argument("--render-dev", choices=["/learn/", "/learn/choice/", "/reading/", "/learn/game/"])
    args = parser.parse_args()
    if args.render_dev:
        SITE = HERE.parents[1]
        sys.stdout.buffer.write(game_page(dev=True) if args.render_dev == "/learn/game/" else study_menu(args.render_dev))
        sys.exit(0)
    port = args.port
    study_menu()
    game_page()
    with ThreadingHTTPServer(("127.0.0.1", port), Preview) as server:
        print(f"http://127.0.0.1:{port}/learn/", flush=True)
        server.serve_forever()

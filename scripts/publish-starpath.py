"""Include the reviewed Starpath study preview in the production build."""
import importlib.util
import shutil
from pathlib import Path

root = Path(__file__).resolve().parent.parent
preview_file = root / "previews/starpath/preview.py"
spec = importlib.util.spec_from_file_location("starpath_preview", preview_file)
preview = importlib.util.module_from_spec(spec)
spec.loader.exec_module(preview)
dist = root / "dist"

game_dir = dist / "learn/game"
game_dir.mkdir(parents=True, exist_ok=True)
(game_dir / "index.html").write_bytes(preview.game_page())
for path in ("learn", "learn/choice", "reading"):
    (dist / path / "index.html").write_bytes(preview.study_menu("/" + path + "/"))
for name in ("quiz-preview-starpath.webp", "quiz-preview-starpath-dark.webp"):
    shutil.copyfile(preview.HERE / name, dist / "images" / name)

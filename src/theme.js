const key = "manabo-theme-v1";
const root = document.documentElement;
const buttons = document.querySelectorAll("[data-theme-toggle]");

// An embedded SVG may retain its previous color scheme in WebKit. Select its palette by URL.
export function applyStrokeTheme(picture) {
  const base = picture.dataset.strokeUrl;
  const view = root.dataset.theme === "dark" ? "dark" : "light";
  picture.querySelector("source").srcset = base + "#" + view + "-still";
  picture.querySelector("img").src = base + "#" + view;
}

function applyTheme(theme) {
  root.dataset.theme = theme === "dark" ? "dark" : "light";
  for (const picture of document.querySelectorAll("picture[data-stroke-url]")) applyStrokeTheme(picture);
  const dark = root.dataset.theme === "dark";
  for (const button of buttons) {
    button.textContent = dark ? "화이트모드로 전환" : "다크모드로 전환";
  }
}

applyTheme(root.dataset.theme);
for (const button of buttons) {
  button.addEventListener("click", () => {
    const theme = root.dataset.theme === "dark" ? "light" : "dark";
    applyTheme(theme);
    try { localStorage.setItem(key, theme); } catch { /* Keep the current page usable. */ }
  });
}
window.addEventListener("storage", (event) => {
  if (event.key === key || event.key === null) applyTheme(event.newValue);
});

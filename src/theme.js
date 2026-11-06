const key = "manabo-theme-v1";
const root = document.documentElement;
const buttons = document.querySelectorAll("[data-theme-toggle]");

function applyTheme(theme) {
  root.dataset.theme = theme === "dark" ? "dark" : "light";
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

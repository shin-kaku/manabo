// Inlined before styles by Vite so a saved dark theme is applied before paint.
(() => {
  let theme = "light";
  try {
    if (localStorage.getItem("manabo-theme-v1") === "dark") theme = "dark";
  } catch { /* Theme switching still works when storage is unavailable. */ }
  document.documentElement.dataset.theme = theme;
})();

import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  build: {
    rollupOptions: {
      input: Object.fromEntries(
        ["index", "about/index", "privacy-policy/index", "copyright/index", "contact/index"].map(
          (page) => [page, fileURLToPath(new URL(`./${page}.html`, import.meta.url))],
        ),
      ),
    },
  },
});

import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/production",
  workers: 2,
  use: { baseURL: "http://127.0.0.1:4174", browserName: "chromium", reducedMotion: "reduce" },
  webServer: {
    command: "npm run preview -- --host 127.0.0.1 --port 4174 --strictPort",
    url: "http://127.0.0.1:4174/",
    reuseExistingServer: false,
  },
});

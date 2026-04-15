import { defineConfig } from "vite";
import { cpSync } from "fs";

export default defineConfig({
  server: {
    port: 3000,
  },
  build: {
    outDir: "dist",
  },
  plugins: [
    {
      name: "copy-locales",
      closeBundle() {
        cpSync("locales", "dist/locales", { recursive: true });
      },
    },
  ],
  define: {
    __GOOGLE_TAG_ID__: JSON.stringify(process.env.GOOGLE_TAG_ID || ""),
  },
});

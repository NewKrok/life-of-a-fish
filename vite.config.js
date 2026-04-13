import { defineConfig } from "vite";

export default defineConfig({
  build: {
    outDir: "dist",
  },
  define: {
    __GOOGLE_TAG_ID__: JSON.stringify(process.env.GOOGLE_TAG_ID || ""),
  },
});

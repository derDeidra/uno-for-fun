import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  root: "./",
  build: {
    outDir: "dist",
    target: "esnext",
  },
  server: {
    fs: {
      allow: [resolve(__dirname, "..", ".."), __dirname],
    },
  },
});

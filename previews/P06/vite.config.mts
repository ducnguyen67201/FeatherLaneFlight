import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// Resolve the isolated preview through this worktree's installed web runtime.
export default defineConfig({
  resolve: {
    alias: {
      react: fileURLToPath(
        new URL("../../src/web/node_modules/react", import.meta.url),
      ),
      "react-dom": fileURLToPath(
        new URL("../../src/web/node_modules/react-dom", import.meta.url),
      ),
    },
    dedupe: ["react", "react-dom"],
  },
});

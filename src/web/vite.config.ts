import { defineConfig } from "vite";

const proxy = {
  "/api": { target: "http://127.0.0.1:8009", changeOrigin: false, xfwd: false },
  "/auth": {
    target: "http://127.0.0.1:8009",
    changeOrigin: false,
    xfwd: false,
  },
};

export default defineConfig(({ mode }) => ({
  server: {
    host: "127.0.0.1",
    port: mode === "demo" ? 4200 : 4248,
    strictPort: true,
    proxy: mode === "demo" ? undefined : proxy,
  },
  preview: { host: "127.0.0.1", port: 4248, strictPort: true, proxy },
}));

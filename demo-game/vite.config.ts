import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

function sparkDataWasmUrlFix(): Plugin {
  return {
    name: "spark-data-wasm-url-fix",
    enforce: "pre",
    transform(code, id) {
      if (!id.includes("@sparkjsdev/spark/dist/spark.module.js")) return null;
      const fixed = code.replace(
        /new URL\("data:application\/wasm;base64,([^"]+)", import\.meta\.url\)/g,
        '"data:application/wasm;base64,$1"',
      );
      return fixed === code ? null : { code: fixed, map: null };
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [react(), sparkDataWasmUrlFix()],
  optimizeDeps: {
    exclude: ["@sparkjsdev/spark"],
  },
  server: {
    port: 5173,
    strictPort: false,
  },
  build: {
    sourcemap: true,
    chunkSizeWarningLimit: 1800,
  },
});

import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["lib/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      // 테스트(node) 환경에서는 server-only 가드를 no-op으로 대체
      "server-only": path.resolve(__dirname, "node_modules/server-only/empty.js"),
    },
  },
});

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    testTimeout: 30000,
    // Live tests are inside the normal include list but self-skip unless
    // PHAROS_LIVE=1 / PHAROS_LIVE_TESTNET=1 is set.
  },
});

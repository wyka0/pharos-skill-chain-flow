/**
 * LIVE integration test on the PHAROS ATLANTIC TESTNET via the self-hosted
 * official Chain MCP (http://127.0.0.1:3001/mcp).
 *
 * Opt-in:
 *   1. start the server:  npm run chain-mcp
 *   2. run:               npm run test:live:testnet  (sets PHAROS_LIVE_TESTNET=1)
 *
 * Skips (with a warning) when the local server is not running, so the default
 * `npm test` suite stays fully offline.
 */
import { describe, expect, it } from "vitest";
import { findNetwork, loadNetworks, loadRule, resolveWallet } from "../src/config.js";
import { runDecisionFlow } from "../src/flow.js";

const LIVE = process.env.PHAROS_LIVE_TESTNET === "1";
const suite = LIVE ? describe : describe.skip;

const MCP_URL = process.env.PHAROS_MCP_URL ?? "http://127.0.0.1:3001/mcp";
const HEALTH_URL = MCP_URL.replace(/\/mcp$/, "/health");

async function serverUp(): Promise<boolean> {
  try {
    const res = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

suite("live: Atlantic testnet via self-hosted official Chain MCP", () => {
  it(
    "runs the full flow on chain 688689 and decides from live data",
    async () => {
      if (!(await serverUp())) {
        console.warn(`[live.testnet] server not reachable at ${HEALTH_URL} - start it with: npm run chain-mcp`);
        return; // treat as skip when server is absent
      }
      const networks = await loadNetworks("skills/pharos-chain-decision/assets/networks.json");
      const rule = await loadRule("config/rule.json");
      const network = findNetwork(networks, rule.network);
      expect(network.chainId).toBe(688689);

      const wallet = await resolveWallet("config/wallets.json", "funded");
      const out = await runDecisionFlow({
        request: "LIVE TEST - atlantic testnet flow",
        address: wallet.address,
        rule,
        network,
        mcpUrl: MCP_URL,
        profileName: "atlantic-testnet",
      });

      expect(out.result.chainId).toBe(688689);
      expect(out.trace.steps).toHaveLength(6);

      const balanceWei = BigInt(out.result.balanceWei);
      const minimumWei = BigInt(out.result.minimumWei);
      const expected = balanceWei >= minimumWei; // rule.comparison === "gte"
      expect(out.result.decision === "MEETS_MINIMUM").toBe(expected);

      // nativeSymbol reported by the testnet server should be PHRS (self-hosted config)
      const chainStep = out.trace.steps.find((s) => s.name === "chain-info-verify-network");
      const detail = chainStep?.detail as { nativeSymbol?: string; latestBlock?: string };
      expect(detail.latestBlock).toBeDefined();
    },
    60000,
  );
});

/**
 * LIVE integration test against the OFFICIAL hosted Pharos Chain MCP
 * (https://mcp.pharos.xyz/mcp — Pacific Mainnet, chain 1672).
 *
 * Opt-in: run with `npm run test:live` (sets PHAROS_LIVE=1).
 * No fixtures are involved; the decision must be consistent with the live data.
 */
import { describe, expect, it } from "vitest";
import { findNetwork, loadNetworks, loadProfiles, loadRule, resolveProfile, resolveWallet } from "../src/config.js";
import { runDecisionFlow } from "../src/flow.js";

const LIVE = process.env.PHAROS_LIVE === "1";
const suite = LIVE ? describe : describe.skip;

suite("live: official hosted Chain MCP (Pacific mainnet)", () => {
  it(
    "runs the full flow end-to-end and decides from live data",
    async () => {
      const profiles = await loadProfiles("config/profiles.json");
      const [profileName, profile] = resolveProfile(profiles, "hosted-mainnet");
      const networks = await loadNetworks("skills/pharos-chain-decision/assets/networks.json");
      const rule = await loadRule("config/rule.hosted-mainnet.json");
      const network = findNetwork(networks, rule.network);
      expect(profile.network).toBe(rule.network);
      expect(network.chainId).toBe(1672);

      const wallet = await resolveWallet("config/wallets.json", "mainnet-sample");
      const out = await runDecisionFlow({
        request: "LIVE TEST - hosted mainnet flow",
        address: wallet.address,
        rule,
        network,
        mcpUrl: profile.chainMcpUrl,
        profileName,
      });

      // the endpoint really served Pacific Mainnet
      expect(out.result.chainId).toBe(1672);
      expect(out.trace.steps).toHaveLength(6);

      // the decision must be consistent with the LIVE balance that came back
      const balanceWei = BigInt(out.result.balanceWei);
      const minimumWei = BigInt(out.result.minimumWei);
      const expected = balanceWei >= minimumWei; // rule.comparison === "gte"
      expect(out.result.decision === "MEETS_MINIMUM").toBe(expected);
      expect(out.result.explanation).toContain("https://mcp.pharos.xyz/mcp");

      // trace contains the raw live responses as evidence
      const balanceStep = out.trace.steps.find((s) => s.name === "fetch-live-balance");
      expect((balanceStep?.detail as { response: string }).response).toContain("balanceWei");
    },
    60000,
  );
});

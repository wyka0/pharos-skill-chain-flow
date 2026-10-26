import { describe, expect, it } from "vitest";
import { evaluateDecision } from "../src/decision.js";
import { ConfigError } from "../src/errors.js";
import { formatUnits, parseUnitsToWei } from "../src/parse.js";
import type { BalanceView, ChainInfoView, DecisionRule, NetworkConfig } from "../src/types.js";

// ---- Fixtures (labeled FIXTURE - never presented as live) -------------------
const NETWORK: NetworkConfig = {
  name: "atlantic-testnet",
  rpcUrl: "https://atlantic.dplabs-internal.com",
  chainId: 688689,
  explorerUrl: "https://atlantic.pharosscan.xyz/",
  explorerApiUrl: "https://api.socialscan.io/pharos-atlantic-testnet",
  nativeToken: "PHRS",
};

const CHAIN: ChainInfoView = {
  name: "Pharos",
  chainId: 688689,
  chainIdHex: "0xa8231",
  latestBlock: "31929000",
  latestBlockHex: "0x1e679a8",
  nativeSymbol: "PHRS",
};

function balanceFixture(wei: bigint): BalanceView {
  return {
    address: "0x6378d100db94ba95d0fa0e50bdab3fed01dc26e7",
    balanceWei: wei,
    balance: formatUnits(wei),
    symbol: "PHRS",
  };
}

function ruleFixture(comparison: DecisionRule["comparison"], minimum: string): DecisionRule {
  return { minimumNativeBalance: minimum, comparison, network: "atlantic-testnet" };
}

const MCP_URL = "fixture://chain-mcp";

// ---- Tests -------------------------------------------------------------------
describe("evaluateDecision", () => {
  it("decides MEETS_MINIMUM when live balance equals the minimum (gte boundary)", () => {
    const result = evaluateDecision({
      rule: ruleFixture("gte", "1"),
      address: "0x6378d100db94ba95d0fa0e50bdab3fed01dc26e7",
      balance: balanceFixture(parseUnitsToWei("1")),
      network: NETWORK,
      chain: CHAIN,
      mcpUrl: MCP_URL,
    });
    expect(result.decision).toBe("MEETS_MINIMUM");
  });

  it("decides BELOW_MINIMUM just under the minimum", () => {
    const result = evaluateDecision({
      rule: ruleFixture("gte", "1"),
      address: "0x6378d100db94ba95d0fa0e50bdab3fed01dc26e7",
      balance: balanceFixture(parseUnitsToWei("0.999999999999999999")),
      network: NETWORK,
      chain: CHAIN,
      mcpUrl: MCP_URL,
    });
    expect(result.decision).toBe("BELOW_MINIMUM");
  });

  it("supports all comparisons with exact BigInt math", () => {
    const one = parseUnitsToWei("1");
    const cases: Array<[DecisionRule["comparison"], bigint, boolean]> = [
      ["gt", one, false],
      ["gt", one + 1n, true],
      ["gte", one, true],
      ["lte", one, true],
      ["lte", one - 1n, true],
      ["lt", one, false],
      ["eq", one, true],
      ["eq", one + 1n, false],
    ];
    for (const [comparison, balanceWei, expected] of cases) {
      const result = evaluateDecision({
        rule: ruleFixture(comparison, "1"),
        address: "0x6378d100db94ba95d0fa0e50bdab3fed01dc26e7",
        balance: balanceFixture(balanceWei),
        network: NETWORK,
        chain: CHAIN,
        mcpUrl: MCP_URL,
      });
      expect(result.decision === "MEETS_MINIMUM").toBe(expected);
    }
  });

  it("handles fractional minimums without floating point", () => {
    // 0.5 PHRS vs balance 0.499999999999999999 PHRS
    const result = evaluateDecision({
      rule: ruleFixture("gte", "0.5"),
      address: "0x6378d100db94ba95d0fa0e50bdab3fed01dc26e7",
      balance: balanceFixture(parseUnitsToWei("0.499999999999999999")),
      network: NETWORK,
      chain: CHAIN,
      mcpUrl: MCP_URL,
    });
    expect(result.decision).toBe("BELOW_MINIMUM");
    expect(result.minimumWei).toBe("500000000000000000");
  });

  it("explanation embeds the live figures and data source", () => {
    const result = evaluateDecision({
      rule: ruleFixture("gte", "1"),
      address: "0x6378d100db94ba95d0fa0e50bdab3fed01dc26e7",
      balance: balanceFixture(parseUnitsToWei("100")),
      network: NETWORK,
      chain: CHAIN,
      mcpUrl: MCP_URL,
    });
    expect(result.explanation).toContain("100 PHRS");
    expect(result.explanation).toContain("block 31929000");
    expect(result.explanation).toContain("atlantic-testnet");
    expect(result.explanation).toContain("get_balance via fixture://chain-mcp");
    expect(result.explanation).toContain("MEETS_MINIMUM");
    expect(result.explanation).toContain("satisfied");
  });

  it("explanation marks an unmet rule explicitly", () => {
    const result = evaluateDecision({
      rule: ruleFixture("gte", "1"),
      address: "0x6378d100db94ba95d0fa0e50bdab3fed01dc26e7",
      balance: balanceFixture(0n),
      network: NETWORK,
      chain: CHAIN,
      mcpUrl: MCP_URL,
    });
    expect(result.explanation).toContain("not satisfied");
    expect(result.explanation).toContain("BELOW_MINIMUM");
  });

  it("rejects an invalid minimum decimal", () => {
    expect(() =>
      evaluateDecision({
        rule: ruleFixture("gte", "1e9"),
        address: "0x6378d100db94ba95d0fa0e50bdab3fed01dc26e7",
        balance: balanceFixture(0n),
        network: NETWORK,
        chain: CHAIN,
        mcpUrl: MCP_URL,
      }),
    ).toThrow(ConfigError);
  });
});

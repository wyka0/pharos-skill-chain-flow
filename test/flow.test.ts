import { describe, expect, it } from "vitest";
import { FlowRunError } from "../src/errors.js";
import { runDecisionFlow, REQUIRED_TOOLS } from "../src/flow.js";
import { McpToolError } from "../src/errors.js";
import type { Trace } from "../src/trace.js";
import type { ChainMcpAdapter, DecisionRule, NetworkConfig, ToolSummary } from "../src/types.js";

// -----------------------------------------------------------------------------
// FIXTURE adapter - fake MCP responses used ONLY for offline unit tests.
// Shapes mirror the real Chain MCP output, but every value here is synthetic.
// Live behavior is covered separately by test/live.*.test.ts (opt-in).
// -----------------------------------------------------------------------------
class FixtureChainMcp implements ChainMcpAdapter {
  readonly endpoint = "fixture://chain-mcp";
  constructor(
    private readonly chainRaw: string,
    private readonly balanceRaw: string,
    private readonly toolNames: string[] = ["get_chain_info", "get_block_number", "get_balance"],
    private readonly failBalanceWithError = false,
  ) {}

  async listTools(): Promise<{ tools: ToolSummary[]; sessionId?: string }> {
    return { tools: this.toolNames.map((name) => ({ name })), sessionId: "fixture-session" };
  }

  async callTool(name: string): Promise<{ raw: string; isError: boolean }> {
    if (name === "get_chain_info") return { raw: this.chainRaw, isError: false };
    if (name === "get_balance") {
      if (this.failBalanceWithError) {
        throw new McpToolError(name, "fixture: address must be a valid EVM address");
      }
      return { raw: this.balanceRaw, isError: false };
    }
    return { raw: "{}", isError: false };
  }

  async close(): Promise<void> {}
}

// FIXTURE network + rule (atlantic testnet shape)
const NETWORK: NetworkConfig = {
  name: "atlantic-testnet",
  rpcUrl: "https://atlantic.dplabs-internal.com",
  chainId: 688689,
  explorerUrl: "https://atlantic.pharosscan.xyz/",
  explorerApiUrl: "https://api.socialscan.io/pharos-atlantic-testnet",
  nativeToken: "PHRS",
};

const RULE: DecisionRule = {
  minimumNativeBalance: "1",
  comparison: "gte",
  network: "atlantic-testnet",
};

const ADDRESS = "0x6378d100db94ba95d0fa0e50bdab3fed01dc26e7";

// FIXTURE chain info (atlantic testnet shape)
const CHAIN_OK = JSON.stringify({
  name: "Pharos",
  chainId: 688689,
  chainIdHex: "0xa8231",
  expectedChainId: 688689,
  chainIdMatches: true,
  latestBlock: "31929000",
  latestBlockHex: "0x1e679a8",
  nativeSymbol: "PHRS",
  clientVersion: "fixture/1.0.0",
  rpcUrl: "https://atlantic.dplabs-internal.com",
});

// FIXTURE balance: 100.934260254104 PHRS (hex wei, exactly as the live server returns it)
const BALANCE_100 = JSON.stringify({
  address: ADDRESS,
  balanceWei: "0x578be86edb0b29600",
  balance: "100.934260254104",
  symbol: "PHRS",
  balanceHex: "0x578be86edb0b29600",
});

const BALANCE_ZERO = JSON.stringify({
  address: ADDRESS,
  balanceWei: "0x0",
  balance: "0",
  symbol: "PHRS",
  balanceHex: "0x0",
});

function flowInput() {
  return {
    request: "FIXTURE TEST - check balance against minimum",
    address: ADDRESS,
    rule: RULE,
    network: NETWORK,
    mcpUrl: "fixture://chain-mcp",
    skill: { name: "pharos-chain-decision", version: "0.1.0", path: "skills/pharos-chain-decision" },
  };
}

// -----------------------------------------------------------------------------
describe("runDecisionFlow (fixture adapter)", () => {
  it("runs end-to-end and decides MEETS_MINIMUM from the (fixture) live balance", async () => {
    const out = await runDecisionFlow(flowInput(), new FixtureChainMcp(CHAIN_OK, BALANCE_100));
    expect(out.result.decision).toBe("MEETS_MINIMUM");
    expect(out.result.balanceWei).toBe("100934260254104000000");
    expect(out.result.chainId).toBe(688689);
    expect(out.result.block).toBe("31929000");
    expect(out.result.explanation).toContain("fixture://chain-mcp");
    expect(out.trace.steps.map((s) => s.name)).toEqual([
      "validate-input",
      "mcp-connect",
      "mcp-tools-list",
      "chain-info-verify-network",
      "fetch-live-balance",
      "apply-rule",
    ]);
    expect(out.trace.steps.every((s) => s.status === "ok")).toBe(true);
    expect(out.trace.result).toMatchObject({ status: "ok", decision: "MEETS_MINIMUM" });
  });

  it("decides BELOW_MINIMUM for a zero balance and records both raw responses", async () => {
    const out = await runDecisionFlow(flowInput(), new FixtureChainMcp(CHAIN_OK, BALANCE_ZERO));
    expect(out.result.decision).toBe("BELOW_MINIMUM");
    const balanceStep = out.trace.steps.find((s) => s.name === "fetch-live-balance");
    expect((balanceStep?.detail as { response: string }).response).toContain("balanceWei");
  });

  it("aborts with NETWORK_MISMATCH when the endpoint serves another chain", async () => {
    const MAINNET_CHAIN = CHAIN_OK.replace(/688689/g, "1672").replace("0xa8231", "0x688");
    const promise = runDecisionFlow(flowInput(), new FixtureChainMcp(MAINNET_CHAIN, BALANCE_100));
    await expect(promise).rejects.toBeInstanceOf(FlowRunError);
    try {
      await runDecisionFlow(flowInput(), new FixtureChainMcp(MAINNET_CHAIN, BALANCE_100));
    } catch (error) {
      const flowError = error as FlowRunError;
      const trace = flowError.trace as Trace;
      expect((flowError.cause_ as { code?: string }).code).toBe("NETWORK_MISMATCH");
      expect(trace.steps.at(-1)?.name).toBe("chain-info-verify-network");
      expect(trace.result).toMatchObject({ status: "error", code: "NETWORK_MISMATCH" });
    }
  });

  it("fails with MISSING_TOOL when get_balance is absent from tools/list", async () => {
    const promise = runDecisionFlow(
      flowInput(),
      new FixtureChainMcp(CHAIN_OK, BALANCE_100, ["get_chain_info", "get_block_number"]),
    );
    try {
      await promise;
      expect.unreachable();
    } catch (error) {
      const flowError = error as FlowRunError;
      expect((flowError.cause_ as { code?: string }).code).toBe("MISSING_TOOL");
      const trace = flowError.trace as Trace;
      expect(trace.steps.at(-1)?.name).toBe("mcp-tools-list");
    }
  });

  it("propagates MCP_TOOL_ERROR when the tool returns isError", async () => {
    const promise = runDecisionFlow(
      flowInput(),
      new FixtureChainMcp(CHAIN_OK, BALANCE_ZERO, [...REQUIRED_TOOLS], true),
    );
    try {
      await promise;
      expect.unreachable();
    } catch (error) {
      const flowError = error as FlowRunError;
      expect((flowError.cause_ as { code?: string }).code).toBe("MCP_TOOL_ERROR");
      expect((flowError.cause_ as Error).message).toContain("valid EVM address");
    }
  });

  it("fails with INVALID_MCP_OUTPUT when balanceWei is missing", async () => {
    const BAD_BALANCE = JSON.stringify({ address: ADDRESS, symbol: "PHRS" });
    const promise = runDecisionFlow(flowInput(), new FixtureChainMcp(CHAIN_OK, BAD_BALANCE));
    try {
      await promise;
      expect.unreachable();
    } catch (error) {
      const flowError = error as FlowRunError;
      expect((flowError.cause_ as { code?: string }).code).toBe("INVALID_MCP_OUTPUT");
    }
  });

  it("fails with INVALID_ADDRESS before any MCP call", async () => {
    const promise = runDecisionFlow({ ...flowInput(), address: "0xdead" }, new FixtureChainMcp(CHAIN_OK, BALANCE_100));
    try {
      await promise;
      expect.unreachable();
    } catch (error) {
      const flowError = error as FlowRunError;
      expect((flowError.cause_ as { code?: string }).code).toBe("INVALID_ADDRESS");
      const trace = flowError.trace as { steps: Array<{ name: string }> };
      expect(trace.steps.at(-1)?.name).toBe("validate-input");
    }
  });
});

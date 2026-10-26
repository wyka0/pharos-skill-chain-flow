import { evaluateDecision } from "./decision.js";
import { FlowError, FlowRunError, MissingToolError } from "./errors.js";
import { connectChainMcp } from "./mcp.js";
import { parseJsonObject } from "./parse.js";
import { addStep, finishTrace, newTrace, type Trace, type TraceStep } from "./trace.js";
import {
  assertNetworkMatch,
  assertValidAddress,
  validateBalanceResponse,
  validateChainInfo,
} from "./validate.js";
import type {
  BalanceView,
  ChainInfoView,
  ChainMcpAdapter,
  DecisionResult,
  DecisionRule,
  NetworkConfig,
} from "./types.js";

/** Tools the flow cannot run without (verified against the server's tools/list). */
export const REQUIRED_TOOLS = ["get_chain_info", "get_balance"] as const;

export const FLOW_STEP_NAMES = [
  "validate-input",
  "mcp-connect",
  "mcp-tools-list",
  "chain-info-verify-network",
  "fetch-live-balance",
  "apply-rule",
] as const;

export interface FlowInput {
  /** The original user request (recorded verbatim in the trace). */
  request: string;
  /** Target address (0x + 40 hex). */
  address: string;
  /** Validated decision rule. */
  rule: DecisionRule;
  /** Resolved network (must equal rule.network). */
  network: NetworkConfig;
  /** Chain MCP endpoint URL. */
  mcpUrl: string;
  profileName?: string;
  skill?: { name: string; version: string; path?: string };
  rulePath?: string;
  networksPath?: string;
  onStep?: (step: TraceStep) => void;
}

export interface FlowOutput {
  trace: Trace;
  result: DecisionResult;
}

async function tracedStep(
  trace: Trace,
  name: string,
  fn: () => Promise<unknown> | unknown,
  onStep?: (step: TraceStep) => void,
): Promise<void> {
  try {
    await addStep(trace, name, fn);
  } finally {
    const last = trace.steps[trace.steps.length - 1];
    if (last && last.name === name) onStep?.(last);
  }
}

function truncate(text: string, max = 8000): string {
  return text.length <= max ? text : text.slice(0, max) + `…(+${text.length - max} chars)`;
}

/**
 * Run the full pharos-chain-decision flow:
 *   validate input -> connect to Chain MCP -> verify tools ->
 *   get_chain_info (network check) -> get_balance (live data) -> apply rule
 *
 * The decision is computed from the balance returned by the Chain MCP in this
 * same run. An injected adapter (used by tests) replaces the real connection;
 * production callers omit it.
 */
export async function runDecisionFlow(
  input: FlowInput,
  injectedAdapter?: ChainMcpAdapter,
): Promise<FlowOutput> {
  const trace = newTrace({
    request: input.request,
    skill: input.skill ?? { name: "pharos-chain-decision", version: "0.1.0" },
    config: {
      profile: input.profileName,
      rule: input.rule,
      rulePath: input.rulePath,
      networksPath: input.networksPath,
      network: input.network,
      address: input.address,
      mcpUrl: input.mcpUrl,
      requiredTools: REQUIRED_TOOLS,
    },
  });

  let adapter: ChainMcpAdapter | undefined = injectedAdapter;
  const ownsAdapter = !injectedAdapter;

  try {
    // 1. validate input (rule/network binding + address format)
    await tracedStep(
      trace,
      "validate-input",
      () => {
        const address = assertValidAddress(input.address);
        if (input.rule.network !== input.network.name) {
          throw new FlowError(
            "CONFIG_INVALID",
            `rule targets network "${input.rule.network}" but flow resolved network "${input.network.name}"`,
          );
        }
        return {
          address,
          network: { name: input.network.name, chainId: input.network.chainId },
          rule: { minimum: input.rule.minimumNativeBalance, comparison: input.rule.comparison },
        };
      },
      input.onStep,
    );

    // 2. connect to the Chain MCP
    await tracedStep(
      trace,
      "mcp-connect",
      async () => {
        if (!adapter) {
          adapter = await connectChainMcp(input.mcpUrl);
          return { endpoint: input.mcpUrl, mode: "sdk-streamable-http" };
        }
        return { endpoint: input.mcpUrl, mode: "injected-adapter" };
      },
      input.onStep,
    );

    const mcp = adapter;
    if (!mcp) throw new FlowRunError(trace, new Error("adapter unavailable"));

    // 3. verify required tools exist on the server
    await tracedStep(
      trace,
      "mcp-tools-list",
      async () => {
        const { tools, sessionId } = await mcp.listTools();
        const toolNames = tools.map((t) => t.name);
        const missing = REQUIRED_TOOLS.filter((t) => !toolNames.includes(t));
        if (missing.length > 0) {
          throw new MissingToolError([...missing], toolNames);
        }
        return {
          sessionId: sessionId ?? null,
          toolCount: toolNames.length,
          toolNames,
          requiredToolsPresent: true,
        };
      },
      input.onStep,
    );

    // 4. live chain info + hard network check
    let chainInfo: ChainInfoView | undefined;
    await tracedStep(
      trace,
      "chain-info-verify-network",
      async () => {
        const { raw } = await mcp.callTool("get_chain_info", {});
        const parsedObj = parseJsonObject(raw, "get_chain_info");
        chainInfo = validateChainInfo(parsedObj);
        assertNetworkMatch(input.network, chainInfo);
        return {
          request: { tool: "get_chain_info", arguments: {} },
          response: truncate(raw),
          chainId: chainInfo.chainId,
          chainIdHex: chainInfo.chainIdHex,
          latestBlock: chainInfo.latestBlock ?? chainInfo.latestBlockHex,
          nativeSymbol: chainInfo.nativeSymbol,
          clientVersion: chainInfo.clientVersion,
          networkCheck: {
            expected: { name: input.network.name, chainId: input.network.chainId },
            actual: chainInfo.chainId,
            ok: true,
          },
        };
      },
      input.onStep,
    );
    const chain = chainInfo as ChainInfoView;

    // 5. live balance — the value the decision depends on
    let balance: BalanceView | undefined;
    await tracedStep(
      trace,
      "fetch-live-balance",
      async () => {
        const { raw } = await mcp.callTool("get_balance", { address: input.address });
        const parsedObj = parseJsonObject(raw, "get_balance");
        balance = validateBalanceResponse(parsedObj, input.address);
        return {
          request: { tool: "get_balance", arguments: { address: input.address } },
          response: truncate(raw),
          address: balance.address,
          balanceWei: balance.balanceWei.toString(),
          balanceHex: balance.balanceHex,
          reportedBalance: balance.balance,
          symbol: balance.symbol,
        };
      },
      input.onStep,
    );
    const liveBalance = balance as BalanceView;

    // 6. apply the configurable rule to the live data
    let result: DecisionResult | undefined;
    await tracedStep(
      trace,
      "apply-rule",
      () => {
        result = evaluateDecision({
          rule: input.rule,
          address: input.address,
          balance: liveBalance,
          network: input.network,
          chain,
          mcpUrl: input.mcpUrl,
        });
        return {
          comparison: input.rule.comparison,
          minimumNativeBalance: input.rule.minimumNativeBalance,
          minimumWei: result.minimumWei,
          balanceWei: result.balanceWei,
          outcome: result.decision,
        };
      },
      input.onStep,
    );

    const decision = result as DecisionResult;
    finishTrace(trace, { status: "ok", decision: decision.decision, details: decision });
    return { trace, result: decision };
  } catch (error) {
    finishTrace(trace, {
      status: "error",
      code: (error as { code?: string }).code,
      message: error instanceof Error ? error.message : String(error),
      failedAtStep: trace.steps[trace.steps.length - 1]?.name,
    });
    throw new FlowRunError(trace, error);
  } finally {
    if (ownsAdapter && adapter) {
      try {
        await adapter.close();
      } catch {
        // closing a broken connection must not mask the real error
      }
    }
  }
}

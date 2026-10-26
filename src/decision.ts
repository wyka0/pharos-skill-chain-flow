import { formatUnits, parseUnitsToWei } from "./parse.js";
import type {
  BalanceView,
  ChainInfoView,
  Comparison,
  Decision,
  DecisionResult,
  DecisionRule,
  NetworkConfig,
} from "./types.js";

const COMPARISON_WORDS: Record<Comparison, string> = {
  gte: "is greater than or equal to",
  gt: "is strictly greater than",
  lte: "is less than or equal to",
  lt: "is strictly less than",
  eq: "equals",
};

function holds(a: bigint, b: bigint, comparison: Comparison): boolean {
  switch (comparison) {
    case "gte":
      return a >= b;
    case "gt":
      return a > b;
    case "lte":
      return a <= b;
    case "lt":
      return a < b;
    case "eq":
      return a === b;
  }
}

export interface DecisionInput {
  rule: DecisionRule;
  address: string;
  balance: BalanceView;
  network: NetworkConfig;
  chain: ChainInfoView;
  mcpUrl: string;
}

/**
 * Apply the configured rule to the LIVE balance. Exact BigInt math in wei —
 * no floating point anywhere near money.
 */
export function evaluateDecision(input: DecisionInput): DecisionResult {
  const { rule, address, balance, network, chain, mcpUrl } = input;
  const minimumWei = parseUnitsToWei(rule.minimumNativeBalance, 18);
  const symbol = balance.symbol ?? network.nativeToken;
  const met = holds(balance.balanceWei, minimumWei, rule.comparison);
  const decision: Decision = met ? "MEETS_MINIMUM" : "BELOW_MINIMUM";
  const block = chain.latestBlock ?? chain.latestBlockHex ?? "unknown";
  const evaluatedAt = new Date().toISOString();

  const explanation =
    `Decision ${decision}: live native balance of ${address} is ${formatUnits(balance.balanceWei)} ${symbol} ` +
    `(${balance.balanceWei.toString()} wei) at block ${block} on ${network.name} ` +
    `(chain ${network.chainId}). The rule requires the balance ${COMPARISON_WORDS[rule.comparison]} ` +
    `${rule.minimumNativeBalance} ${symbol}, which is ${met ? "satisfied" : "not satisfied"}. ` +
    `Data source: Pharos Chain MCP get_balance via ${mcpUrl} at ${evaluatedAt}.`;

  return {
    decision,
    explanation,
    address,
    balanceWei: balance.balanceWei.toString(),
    balanceDecimal: formatUnits(balance.balanceWei),
    symbol,
    minimumNativeBalance: rule.minimumNativeBalance,
    minimumWei: minimumWei.toString(),
    comparison: rule.comparison,
    network: network.name,
    chainId: network.chainId,
    block,
    mcpUrl,
    evaluatedAt,
  };
}

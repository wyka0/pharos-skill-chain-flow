/** Shared types for the pharos-chain-decision flow. */

/** A network entry — mirrors the official Skill Engine assets/networks.json schema. */
export interface NetworkConfig {
  name: string;
  rpcUrl: string;
  chainId: number;
  explorerUrl: string;
  explorerApiUrl: string;
  nativeToken: string;
}

export interface NetworksFile {
  networks: NetworkConfig[];
  defaultNetwork: string;
}

export type Comparison = "gte" | "gt" | "lte" | "lt" | "eq";

export const COMPARISONS: readonly Comparison[] = ["gte", "gt", "lte", "lt", "eq"] as const;

/** The user-configurable decision rule. */
export interface DecisionRule {
  /** Decimal string native-token amount, e.g. "1" or "0.5". */
  minimumNativeBalance: string;
  comparison: Comparison;
  /** Network name, resolved against assets/networks.json. */
  network: string;
  description?: string;
}

export interface DecisionProfile {
  network: string;
  chainMcpUrl: string;
  selfHosted: boolean;
  note?: string;
}

export interface ProfilesFile {
  defaultProfile: string;
  profiles: Record<string, DecisionProfile>;
}

export interface WalletEntry {
  address: string;
  label: string;
}

export interface WalletsFile {
  note?: string;
  funded?: WalletEntry;
  empty?: WalletEntry;
  "mainnet-sample"?: WalletEntry;
  [key: string]: WalletEntry | string | undefined;
}

/** Chain MCP adapter (implemented by the official SDK client; faked in tests). */
export interface ToolSummary {
  name: string;
  description?: string;
}

export interface ChainMcpAdapter {
  readonly endpoint: string;
  listTools(): Promise<{ tools: ToolSummary[]; sessionId?: string }>;
  callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<{ raw: string; isError: boolean }>;
  close(): Promise<void>;
}

/** Parsed view of get_chain_info output. */
export interface ChainInfoView {
  name?: string;
  chainId: number;
  chainIdHex?: string;
  expectedChainId?: number;
  chainIdMatches?: boolean;
  latestBlock?: string;
  latestBlockHex?: string;
  nativeSymbol?: string;
  clientVersion?: string;
  rpcUrl?: string;
}

/** Parsed view of get_balance output. */
export interface BalanceView {
  address: string;
  balanceWei: bigint;
  balance?: string;
  symbol?: string;
  balanceHex?: string;
}

export type Decision = "MEETS_MINIMUM" | "BELOW_MINIMUM";

export interface DecisionResult {
  decision: Decision;
  explanation: string;
  address: string;
  balanceWei: string;
  balanceDecimal: string;
  symbol: string;
  minimumNativeBalance: string;
  minimumWei: string;
  comparison: Comparison;
  network: string;
  chainId: number;
  block: string;
  mcpUrl: string;
  evaluatedAt: string;
}

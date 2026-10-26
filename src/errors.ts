/** Typed errors for the decision flow. Every error carries a stable `code`. */

export type ErrorCode =
  | "CONFIG_INVALID"
  | "CONFIG_NETWORK_UNKNOWN"
  | "CONFIG_PROFILE_MISMATCH"
  | "INVALID_ADDRESS"
  | "MCP_CONNECTION_FAILED"
  | "MISSING_TOOL"
  | "MCP_TOOL_ERROR"
  | "INVALID_MCP_OUTPUT"
  | "NETWORK_MISMATCH"
  | "FLOW_FAILED";

export class FlowError extends Error {
  readonly code: ErrorCode;
  readonly detail?: unknown;

  constructor(code: ErrorCode, message: string, detail?: unknown) {
    super(message);
    this.name = "FlowError";
    this.code = code;
    this.detail = detail;
  }
}

export class ConfigError extends FlowError {
  constructor(message: string, detail?: unknown) {
    super("CONFIG_INVALID", message, detail);
    this.name = "ConfigError";
  }
}

export class InvalidAddressError extends FlowError {
  constructor(address: string) {
    super(
      "INVALID_ADDRESS",
      `invalid EVM address: "${address}" (expected 0x followed by 40 hex characters)`,
    );
    this.name = "InvalidAddressError";
  }
}

export class McpConnectionError extends FlowError {
  constructor(url: string, cause?: unknown) {
    super(
      "MCP_CONNECTION_FAILED",
      `cannot connect to the Pharos Chain MCP at ${url}. ` +
        `If this is the self-hosted testnet server, start it with: npm run chain-mcp`,
      cause instanceof Error ? cause.message : cause,
    );
    this.name = "McpConnectionError";
  }
}

export class MissingToolError extends FlowError {
  constructor(missing: string[], available: string[]) {
    super(
      "MISSING_TOOL",
      `Chain MCP server does not expose required tool(s): ${missing.join(", ")}. ` +
        `Available tools: ${available.join(", ") || "(none)"}`,
    );
    this.name = "MissingToolError";
  }
}

export class McpToolError extends FlowError {
  constructor(tool: string, serverMessage: string) {
    super("MCP_TOOL_ERROR", `Chain MCP tool "${tool}" returned an error: ${serverMessage}`);
    this.name = "McpToolError";
  }
}

export class InvalidMcpOutputError extends FlowError {
  constructor(message: string, detail?: unknown) {
    super("INVALID_MCP_OUTPUT", message, detail);
    this.name = "InvalidMcpOutputError";
  }
}

export class NetworkMismatchError extends FlowError {
  constructor(expected: { name: string; chainId: number }, actualChainId: number) {
    super(
      "NETWORK_MISMATCH",
      `network mismatch: the Chain MCP endpoint reports chainId ${actualChainId} but the ` +
        `configured network is ${expected.name} (chainId ${expected.chainId}). ` +
        `Refusing to evaluate the rule against another network's data.`,
    );
    this.name = "NetworkMismatchError";
  }
}

/** Wraps a failed run together with the partially filled trace. */
export class FlowRunError extends Error {
  readonly trace: unknown;
  readonly cause_: unknown;

  constructor(trace: unknown, cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = "FlowRunError";
    this.trace = trace;
    this.cause_ = cause;
  }
}

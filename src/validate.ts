import { InvalidAddressError, InvalidMcpOutputError, NetworkMismatchError } from "./errors.js";
import { formatUnits, parseChainId, parseWei } from "./parse.js";
import type { BalanceView, ChainInfoView, NetworkConfig } from "./types.js";

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/** Validate an EVM address; returns the trimmed address. */
export function assertValidAddress(address: string): string {
  const trimmed = address.trim();
  if (!ADDRESS_RE.test(trimmed)) {
    throw new InvalidAddressError(address);
  }
  return trimmed;
}

/**
 * Validate get_chain_info output. Requires chainId and a latest-block marker.
 * All other fields are optional and preserved when present.
 */
export function validateChainInfo(obj: Record<string, unknown>): ChainInfoView {
  if (obj.chainId === undefined && obj.chainIdHex === undefined) {
    throw new InvalidMcpOutputError("get_chain_info: missing chainId", { keys: Object.keys(obj) });
  }
  const chainId =
    obj.chainId !== undefined
      ? parseChainId(obj.chainId, "get_chain_info")
      : parseChainId(obj.chainIdHex, "get_chain_info");

  if (obj.latestBlock === undefined && obj.latestBlockHex === undefined) {
    throw new InvalidMcpOutputError("get_chain_info: missing latestBlock", {
      keys: Object.keys(obj),
    });
  }

  return {
    name: typeof obj.name === "string" ? obj.name : undefined,
    chainId,
    chainIdHex: typeof obj.chainIdHex === "string" ? obj.chainIdHex : undefined,
    expectedChainId:
      obj.expectedChainId !== undefined
        ? parseChainId(obj.expectedChainId, "get_chain_info")
        : undefined,
    chainIdMatches: typeof obj.chainIdMatches === "boolean" ? obj.chainIdMatches : undefined,
    latestBlock: typeof obj.latestBlock === "string" ? obj.latestBlock : undefined,
    latestBlockHex: typeof obj.latestBlockHex === "string" ? obj.latestBlockHex : undefined,
    nativeSymbol: typeof obj.nativeSymbol === "string" ? obj.nativeSymbol : undefined,
    clientVersion: typeof obj.clientVersion === "string" ? obj.clientVersion : undefined,
    rpcUrl: typeof obj.rpcUrl === "string" ? obj.rpcUrl : undefined,
  };
}

/**
 * Hard check: the chain the MCP endpoint serves must be exactly the configured
 * network. This is what prevents evaluating a testnet rule against mainnet data.
 */
export function assertNetworkMatch(network: NetworkConfig, info: ChainInfoView): void {
  if (info.chainId !== network.chainId) {
    throw new NetworkMismatchError(
      { name: network.name, chainId: network.chainId },
      info.chainId,
    );
  }
}

/**
 * Validate get_balance output. `balanceWei` is the primary value and must parse.
 * If the human-readable `balance` is present it must agree with balanceWei.
 */
export function validateBalanceResponse(
  obj: Record<string, unknown>,
  requestedAddress: string,
): BalanceView {
  if (obj.balanceWei === undefined) {
    throw new InvalidMcpOutputError("get_balance: missing balanceWei", {
      keys: Object.keys(obj),
    });
  }
  const balanceWei = parseWei(obj.balanceWei, "get_balance.balanceWei");

  const address = typeof obj.address === "string" ? obj.address : requestedAddress;
  if (address.toLowerCase() !== requestedAddress.toLowerCase()) {
    throw new InvalidMcpOutputError(
      `get_balance: response address ${address} does not match requested ${requestedAddress}`,
    );
  }

  if (obj.balance !== undefined) {
    if (typeof obj.balance !== "string" || !/^\d+(\.\d+)?$/.test(obj.balance.trim())) {
      throw new InvalidMcpOutputError("get_balance: field balance is not a decimal string", {
        value: String(obj.balance),
      });
    }
    const recomputed = formatUnits(balanceWei);
    const reported = obj.balance.trim();
    if (parseFloat(reported) !== parseFloat(recomputed)) {
      throw new InvalidMcpOutputError(
        `get_balance: balance (${reported}) disagrees with balanceWei (${recomputed})`,
      );
    }
  }

  return {
    address,
    balanceWei,
    balance: typeof obj.balance === "string" ? obj.balance.trim() : undefined,
    symbol: typeof obj.symbol === "string" ? obj.symbol : undefined,
    balanceHex: typeof obj.balanceHex === "string" ? obj.balanceHex : undefined,
  };
}

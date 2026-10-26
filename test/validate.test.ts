import { describe, expect, it } from "vitest";
import { formatUnits, parseChainId, parseUnitsToWei, parseWei } from "../src/parse.js";
import {
  assertNetworkMatch,
  assertValidAddress,
  validateBalanceResponse,
  validateChainInfo,
} from "../src/validate.js";
import { InvalidAddressError, InvalidMcpOutputError, NetworkMismatchError } from "../src/errors.js";
import type { NetworkConfig } from "../src/types.js";

const NETWORK: NetworkConfig = {
  name: "atlantic-testnet",
  rpcUrl: "https://atlantic.dplabs-internal.com",
  chainId: 688689,
  explorerUrl: "https://atlantic.pharosscan.xyz/",
  explorerApiUrl: "https://api.socialscan.io/pharos-atlantic-testnet",
  nativeToken: "PHRS",
};

describe("assertValidAddress", () => {
  it("accepts a valid address and trims whitespace", () => {
    expect(assertValidAddress(" 0x6378d100db94ba95d0fa0e50bdab3fed01dc26e7 ")).toBe(
      "0x6378d100db94ba95d0fa0e50bdab3fed01dc26e7",
    );
  });
  it("rejects wrong length, wrong prefix, and non-hex", () => {
    expect(() => assertValidAddress("0x1234")).toThrow(InvalidAddressError);
    expect(() => assertValidAddress("6378d100db94ba95d0fa0e50bdab3fed01dc26e7")).toThrow(
      InvalidAddressError,
    );
    expect(() => assertValidAddress("0x6378d100db94ba95d0fa0e50bdab3fed01dc26zz")).toThrow(
      InvalidAddressError,
    );
    expect(() => assertValidAddress("")).toThrow(InvalidAddressError);
  });
});

describe("validateChainInfo", () => {
  it("parses the official Chain MCP get_chain_info shape", () => {
    // Shape copied from a live call; values here are FIXTURE.
    const info = validateChainInfo({
      name: "Pharos",
      chainId: 688689,
      chainIdHex: "0xa8231",
      expectedChainId: 688689,
      chainIdMatches: true,
      latestBlock: "31929000",
      latestBlockHex: "0x1e679a8",
      nativeSymbol: "PHRS",
      clientVersion: "portal/1.0.0",
      rpcUrl: "https://atlantic.dplabs-internal.com",
    });
    expect(info.chainId).toBe(688689);
    expect(info.latestBlock).toBe("31929000");
    expect(info.nativeSymbol).toBe("PHRS");
  });

  it("accepts hex chainId strings", () => {
    const info = validateChainInfo({ chainIdHex: "0x688", latestBlockHex: "0x10" });
    expect(info.chainId).toBe(1672);
  });

  it("rejects missing chainId or latestBlock", () => {
    expect(() => validateChainInfo({ latestBlock: "1" })).toThrow(InvalidMcpOutputError);
    expect(() => validateChainInfo({ chainId: 1 })).toThrow(InvalidMcpOutputError);
  });
});

describe("assertNetworkMatch", () => {
  it("passes when chainId matches the configured network", () => {
    expect(() =>
      assertNetworkMatch(NETWORK, validateChainInfo({ chainId: 688689, latestBlock: "1" })),
    ).not.toThrow();
  });
  it("throws NETWORK_MISMATCH on any other chain (e.g. hosted mainnet 1672)", () => {
    try {
      assertNetworkMatch(NETWORK, validateChainInfo({ chainId: 1672, latestBlock: "1" }));
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(NetworkMismatchError);
      expect((error as Error).message).toContain("1672");
      expect((error as Error).message).toContain("688689");
    }
  });
});

describe("validateBalanceResponse", () => {
  const ADDRESS = "0x6378d100db94ba95d0fa0e50bdab3fed01dc26e7";

  it("parses the official Chain MCP get_balance shape (hex wei)", () => {
    // Shape copied from a live call; value here is FIXTURE (100.934260254104 tokens).
    const balance = validateBalanceResponse(
      {
        address: ADDRESS,
        balanceWei: "0x578be86edb0b29600",
        balance: "100.934260254104",
        symbol: "PHRS",
        balanceHex: "0x578be86edb0b29600",
      },
      ADDRESS,
    );
    expect(balance.balanceWei).toBe(100934260254104000000n);
    expect(balance.symbol).toBe("PHRS");
  });

  it("accepts decimal wei strings", () => {
    const balance = validateBalanceResponse({ address: ADDRESS, balanceWei: "1000000000000000000" }, ADDRESS);
    expect(balance.balanceWei).toBe(10n ** 18n);
  });

  it("rejects missing balanceWei", () => {
    expect(() => validateBalanceResponse({ address: ADDRESS, balance: "1" }, ADDRESS)).toThrow(
      InvalidMcpOutputError,
    );
  });

  it("rejects negative or malformed wei", () => {
    expect(() => validateBalanceResponse({ address: ADDRESS, balanceWei: "-5" }, ADDRESS)).toThrow(
      InvalidMcpOutputError,
    );
    expect(() => validateBalanceResponse({ address: ADDRESS, balanceWei: "0xzz" }, ADDRESS)).toThrow(
      InvalidMcpOutputError,
    );
  });

  it("rejects an address echo that disagrees with the request", () => {
    expect(() =>
      validateBalanceResponse(
        { address: "0x76c9cf548b4179f8901cda1f8623568b58215e62", balanceWei: "0x0" },
        ADDRESS,
      ),
    ).toThrow(InvalidMcpOutputError);
  });

  it("rejects a human balance that disagrees with balanceWei", () => {
    expect(() =>
      validateBalanceResponse({ address: ADDRESS, balanceWei: "0x0", balance: "5" }, ADDRESS),
    ).toThrow(InvalidMcpOutputError);
  });
});

describe("number formatting", () => {
  it("parseWei handles hex and decimal", () => {
    expect(parseWei("0x0")).toBe(0n);
    expect(parseWei("0x578be86edb0b29600")).toBe(100934260254104000000n);
    expect(parseWei("42")).toBe(42n);
  });
  it("parseChainId handles decimal and hex", () => {
    expect(parseChainId(688689)).toBe(688689);
    expect(parseChainId("1672")).toBe(1672);
    expect(parseChainId("0xa8231")).toBe(688689);
  });
  it("formatUnits trims trailing zeros", () => {
    expect(formatUnits(parseUnitsToWei("100"))).toBe("100");
    expect(formatUnits(parseUnitsToWei("0.5"))).toBe("0.5");
    expect(formatUnits(parseUnitsToWei("1.000000000000000001"))).toBe("1.000000000000000001");
  });
});

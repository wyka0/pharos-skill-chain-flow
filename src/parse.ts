import { ConfigError, InvalidMcpOutputError } from "./errors.js";

/** Parse a JSON object from MCP text content. */
export function parseJsonObject(text: string, label: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new InvalidMcpOutputError(`${label}: response text is not valid JSON`, {
      raw: text.slice(0, 500),
    });
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new InvalidMcpOutputError(`${label}: response is not a JSON object`, {
      raw: text.slice(0, 500),
    });
  }
  return parsed as Record<string, unknown>;
}

/** Parse a wei value (hex "0x…", decimal string, or non-negative integer). */
export function parseWei(value: unknown, label: string): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") {
    if (!Number.isInteger(value) || value < 0) {
      throw new InvalidMcpOutputError(`${label}: expected a non-negative integer`, { value });
    }
    return BigInt(value);
  }
  if (typeof value === "string") {
    const s = value.trim();
    if (/^0x[0-9a-fA-F]+$/.test(s)) return BigInt(s);
    if (/^\d+$/.test(s)) return BigInt(s);
  }
  throw new InvalidMcpOutputError(`${label}: cannot parse wei value`, { value: String(value) });
}

/** Parse a chain id (number, decimal string, or "0x…" hex string). */
export function parseChainId(value: unknown, label: string): number {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) return value;
  if (typeof value === "string") {
    const s = value.trim();
    if (/^\d+$/.test(s)) return Number(s);
    if (/^0x[0-9a-fA-F]+$/.test(s)) return Number(BigInt(s));
  }
  throw new InvalidMcpOutputError(`${label}: cannot parse chainId`, { value: String(value) });
}

/** Convert a decimal string to wei with fixed precision (default 18). */
export function parseUnitsToWei(decimal: string, decimals = 18): bigint {
  const m = /^(\d+)(?:\.(\d*))?$/.exec(decimal.trim());
  if (!m || !m[1]) {
    throw new ConfigError(`invalid decimal amount: "${decimal}"`);
  }
  const intPart = m[1];
  const fracPart = m[2] ?? "";
  if (fracPart.length > decimals) {
    throw new ConfigError(
      `amount "${decimal}" has more than ${decimals} decimals of precision`,
    );
  }
  const padded = fracPart.padEnd(decimals, "0");
  return BigInt(intPart + padded);
}

/** Format wei as a human-readable decimal string (default 18 decimals). */
export function formatUnits(wei: bigint, decimals = 18): string {
  const negative = wei < 0n;
  const abs = negative ? -wei : wei;
  const base = 10n ** BigInt(decimals);
  const intPart = abs / base;
  const fracPart = abs % base;
  const fracStr = fracPart.toString().padStart(decimals, "0").replace(/0+$/, "");
  const s = fracStr ? `${intPart}.${fracStr}` : `${intPart}`;
  return negative ? `-${s}` : s;
}

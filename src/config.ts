import { readFile } from "node:fs/promises";
import { ConfigError } from "./errors.js";
import { parseUnitsToWei } from "./parse.js";
import type {
  Comparison,
  DecisionProfile,
  DecisionRule,
  NetworksFile,
  NetworkConfig,
  ProfilesFile,
  WalletEntry,
  WalletsFile,
} from "./types.js";
import { COMPARISONS } from "./types.js";

/** Read and parse a JSON file with a friendly ConfigError on failure. */
export async function loadJsonFile<T>(path: string, label: string): Promise<T> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    throw new ConfigError(
      `cannot read ${label} at "${path}": ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  // tolerate a UTF-8 BOM (common on Windows-edited files)
  text = text.replace(/^\uFEFF/, "");
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    throw new ConfigError(
      `${label} at "${path}" is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/** Load and fully validate a decision rule. */
export async function loadRule(path: string): Promise<DecisionRule> {
  const raw = await loadJsonFile<Record<string, unknown>>(path, "decision rule");
  const minimum = raw.minimumNativeBalance;
  if (typeof minimum !== "string" || minimum.trim() === "") {
    throw new ConfigError('rule.minimumNativeBalance must be a non-empty decimal string, e.g. "1"');
  }
  // validates the decimal and precision (throws ConfigError)
  parseUnitsToWei(minimum, 18);

  const comparison = raw.comparison;
  if (typeof comparison !== "string" || !COMPARISONS.includes(comparison as Comparison)) {
    throw new ConfigError(
      `rule.comparison must be one of ${COMPARISONS.join(", ")} (got "${String(comparison)}")`,
    );
  }

  const network = raw.network;
  if (typeof network !== "string" || network.trim() === "") {
    throw new ConfigError('rule.network must be a network name from assets/networks.json, e.g. "atlantic-testnet"');
  }

  const rule: DecisionRule = {
    minimumNativeBalance: minimum.trim(),
    comparison: comparison as Comparison,
    network: network.trim(),
  };
  if (typeof raw.description === "string") rule.description = raw.description;
  return rule;
}

/** Load the skill's assets/networks.json (official Skill Engine schema). */
export async function loadNetworks(path: string): Promise<NetworksFile> {
  const raw = await loadJsonFile<NetworksFile>(path, "networks config");
  if (!Array.isArray(raw.networks) || raw.networks.length === 0) {
    throw new ConfigError(`networks config at "${path}" has no networks`);
  }
  for (const n of raw.networks) {
    if (typeof n.name !== "string" || typeof n.chainId !== "number" || typeof n.rpcUrl !== "string") {
      throw new ConfigError(`networks config at "${path}" contains an invalid network entry`);
    }
  }
  if (typeof raw.defaultNetwork !== "string") {
    throw new ConfigError(`networks config at "${path}" is missing defaultNetwork`);
  }
  return raw;
}

export function findNetwork(networks: NetworksFile, name: string): NetworkConfig {
  const net = networks.networks.find((n) => n.name === name);
  if (!net) {
    throw new ConfigError(
      `unknown network "${name}" (available: ${networks.networks.map((n) => n.name).join(", ")})`,
      { code: "CONFIG_NETWORK_UNKNOWN" },
    );
  }
  return net;
}

/** Load profiles.json and validate its structure. */
export async function loadProfiles(path: string): Promise<ProfilesFile> {
  const raw = await loadJsonFile<ProfilesFile>(path, "profiles config");
  if (typeof raw.defaultProfile !== "string") {
    throw new ConfigError(`profiles config at "${path}" is missing defaultProfile`);
  }
  if (!raw.profiles || typeof raw.profiles !== "object") {
    throw new ConfigError(`profiles config at "${path}" is missing profiles`);
  }
  for (const [name, p] of Object.entries(raw.profiles)) {
    const profile = p as DecisionProfile;
    if (typeof profile.network !== "string" || typeof profile.chainMcpUrl !== "string") {
      throw new ConfigError(`profile "${name}" must define network and chainMcpUrl`);
    }
  }
  if (!raw.profiles[raw.defaultProfile]) {
    throw new ConfigError(`defaultProfile "${raw.defaultProfile}" has no matching profile entry`);
  }
  return raw;
}

export function resolveProfile(profiles: ProfilesFile, name?: string): [string, DecisionProfile] {
  const profileName = name ?? profiles.defaultProfile;
  const profile = profiles.profiles[profileName];
  if (!profile) {
    throw new ConfigError(
      `unknown profile "${profileName}" (available: ${Object.keys(profiles.profiles).join(", ")})`,
    );
  }
  return [profileName, profile];
}

/** Resolve a demo wallet by name from config/wallets.json. */
export async function resolveWallet(
  walletsPath: string,
  name: string,
): Promise<WalletEntry> {
  const wallets = await loadJsonFile<WalletsFile>(walletsPath, "wallets config");
  const entry = wallets[name];
  if (!entry || typeof entry !== "object" || typeof (entry as WalletEntry).address !== "string") {
    throw new ConfigError(`wallet "${name}" not found in "${walletsPath}"`);
  }
  return entry as WalletEntry;
}

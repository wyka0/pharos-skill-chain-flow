import { describe, expect, it } from "vitest";
import { findNetwork, loadNetworks, loadProfiles, loadRule, resolveProfile, resolveWallet } from "../src/config.js";
import { ConfigError } from "../src/errors.js";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("loadRule", () => {
  it("loads the demo rule", async () => {
    const rule = await loadRule("config/rule.json");
    expect(rule.minimumNativeBalance).toBe("1");
    expect(rule.comparison).toBe("gte");
    expect(rule.network).toBe("atlantic-testnet");
  });

  it("loads the hosted-mainnet rule", async () => {
    const rule = await loadRule("config/rule.hosted-mainnet.json");
    expect(rule.network).toBe("mainnet");
    expect(rule.comparison).toBe("gte");
  });

  it("rejects missing fields and bad decimals", async () => {
    const dir = mkdtempSync(join(tmpdir(), "phcd-rule-"));
    const write = (name: string, body: string): string => {
      const p = join(dir, name);
      writeFileSync(p, body, "utf8");
      return p;
    };
    await expect(loadRule(write("a.json", '{"comparison":"gte","network":"atlantic-testnet"}'))).rejects.toThrow(ConfigError);
    await expect(
      loadRule(write("b.json", '{"minimumNativeBalance":"1","network":"atlantic-testnet"}')),
    ).rejects.toThrow(ConfigError);
    await expect(
      loadRule(write("c.json", '{"minimumNativeBalance":"1","comparison":"approx","network":"atlantic-testnet"}')),
    ).rejects.toThrow(ConfigError);
    await expect(
      loadRule(write("d.json", '{"minimumNativeBalance":"1.2.3","comparison":"gte","network":"atlantic-testnet"}')),
    ).rejects.toThrow(ConfigError);
  });

  it("rejects a rule network that is not in assets/networks.json (via findNetwork)", async () => {
    const networks = await loadNetworks("skills/pharos-chain-decision/assets/networks.json");
    expect(() => findNetwork(networks, "moonbeam")).toThrow(ConfigError);
  });
});

describe("loadNetworks + findNetwork (skill assets)", () => {
  it("matches the official Skill Engine network table", async () => {
    const networks = await loadNetworks("skills/pharos-chain-decision/assets/networks.json");
    expect(networks.defaultNetwork).toBe("atlantic-testnet");
    const atlantic = networks.networks.find((n) => n.name === "atlantic-testnet");
    expect(atlantic?.chainId).toBe(688689);
    expect(atlantic?.rpcUrl).toBe("https://atlantic.dplabs-internal.com");
    expect(atlantic?.nativeToken).toBe("PHRS");
    const mainnet = networks.networks.find((n) => n.name === "mainnet");
    expect(mainnet?.chainId).toBe(1672);
    expect(mainnet?.nativeToken).toBe("PROS");
  });
});

describe("profiles", () => {
  it("resolves the default profile", async () => {
    const profiles = await loadProfiles("config/profiles.json");
    const [name, profile] = resolveProfile(profiles);
    expect(name).toBe("atlantic-testnet");
    expect(profile.network).toBe("atlantic-testnet");
    expect(profile.chainMcpUrl).toContain("127.0.0.1:3001");
  });

  it("resolves an explicit profile", async () => {
    const profiles = await loadProfiles("config/profiles.json");
    const [name, profile] = resolveProfile(profiles, "hosted-mainnet");
    expect(name).toBe("hosted-mainnet");
    expect(profile.network).toBe("mainnet");
    expect(profile.chainMcpUrl).toBe("https://mcp.pharos.xyz/mcp");
  });

  it("throws on unknown profile", async () => {
    const profiles = await loadProfiles("config/profiles.json");
    expect(() => resolveProfile(profiles, "moonbase")).toThrow(ConfigError);
  });
});

describe("resolveWallet", () => {
  it("resolves named demo wallets (public addresses only)", async () => {
    const funded = await resolveWallet("config/wallets.json", "funded");
    expect(funded.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    const empty = await resolveWallet("config/wallets.json", "empty");
    expect(empty.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  it("throws on unknown wallet", async () => {
    await expect(resolveWallet("config/wallets.json", "whale")).rejects.toThrow(ConfigError);
  });
});

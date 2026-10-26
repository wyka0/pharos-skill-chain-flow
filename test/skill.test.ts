import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { loadNetworks, loadProfiles } from "../src/config.js";

const SKILL_DIR = "skills/pharos-chain-decision";
const SKILL_MD = join(SKILL_DIR, "SKILL.md");
const REFERENCE_MD = join(SKILL_DIR, "references", "decision-flow.md");

function parseFrontmatter(text: string): Record<string, string> {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!match || !match[1]) return {};
  const fields: Record<string, string> = {};
  const lines = match[1].split(/\r?\n/);
  let key: string | null = null;
  let buffer = "";
  for (const line of lines) {
    const kv = /^([a-zA-Z][\w-]*):\s*(.*)$/.exec(line);
    if (kv && kv[1] && !line.startsWith(" ")) {
      if (key) fields[key] = buffer.trim();
      key = kv[1];
      buffer = kv[2] ?? "";
    } else if (key && line.startsWith("  ")) {
      buffer += " " + line.trim();
    }
  }
  if (key) fields[key] = buffer.trim();
  return fields;
}

describe("SkillEngine skill integrity (skills/pharos-chain-decision)", () => {
  it("SKILL.md has valid frontmatter with name, version and a trigger description", () => {
    const text = readFileSync(SKILL_MD, "utf8");
    const fm = parseFrontmatter(text);
    expect(fm.name).toBe("pharos-chain-decision");
    expect(fm.version).toBe("0.1.0");
    expect(fm.description.toLowerCase()).toContain("pharos");
    expect(fm.description.toLowerCase()).toContain("chain mcp");
    expect(fm.requires).toContain("node");
  });

  it("Capability Index maps user needs to Chain MCP tools and the reference file", () => {
    const text = readFileSync(SKILL_MD, "utf8");
    expect(text).toContain("Capability Index");
    expect(text).toContain("references/decision-flow.md#verify-target-network");
    expect(text).toContain("references/decision-flow.md#fetch-live-balance");
    expect(text).toContain("get_chain_info");
    expect(text).toContain("get_balance");
    expect(text.toLowerCase()).toContain("never send");
  });

  it("reference file documents the MCP call sequence with error handling", () => {
    const text = readFileSync(REFERENCE_MD, "utf8");
    for (const anchor of [
      "Verify Target Network",
      "Fetch Live Balance",
      "Apply Decision Rule",
      "Return Decision with Trace",
      "Agent Guidelines",
    ]) {
      expect(text).toContain(anchor);
    }
    expect(text).toContain('"get_balance"');
    expect(text).toContain("NETWORK_MISMATCH");
  });

  it("skill assets/networks.json matches the official Skill Engine schema and runner profiles", async () => {
    const networks = await loadNetworks(join(SKILL_DIR, "assets/networks.json"));
    const profiles = await loadProfiles("config/profiles.json");
    expect(networks.defaultNetwork).toBe("atlantic-testnet");
    const names = networks.networks.map((n) => n.name);
    expect(names).toContain("atlantic-testnet");
    expect(names).toContain("mainnet");
    // every profile must point at a network the skill knows
    for (const profile of Object.values(profiles.profiles)) {
      expect(names).toContain(profile.network);
    }
  });

  it("installed copy (npx skills add) matches the source skill when present", () => {
    const installed = join(".agents", "skills", "pharos-chain-decision", "SKILL.md");
    if (!existsSync(installed)) {
      console.warn("[skill.test] skill not installed yet - run: npm run skills:install");
      return;
    }
    const source = createHash("sha256").update(readFileSync(SKILL_MD)).digest("hex");
    const copy = createHash("sha256").update(readFileSync(installed)).digest("hex");
    expect(copy).toBe(source);
    const installedRef = join(".agents", "skills", "pharos-chain-decision", "references", "decision-flow.md");
    expect(existsSync(installedRef)).toBe(true);
    const installedNet = join(".agents", "skills", "pharos-chain-decision", "assets", "networks.json");
    expect(existsSync(installedNet)).toBe(true);
  });
});

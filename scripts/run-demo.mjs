#!/usr/bin/env node
/**
 * End-to-end demo for Task 8: one user request -> SkillEngine Skill procedure ->
 * live Pharos Chain MCP calls -> decision + trace.
 *
 * Runs three LIVE flows (no mocks anywhere in this script):
 *   1. Atlantic testnet, funded wallet   -> decision computed from live balance
 *   2. Atlantic testnet, empty wallet    -> the opposite decision, same live path
 *   3. Hosted official Chain MCP (Pacific mainnet profile) -> hosted endpoint proof
 *
 * Starts the self-hosted official Chain MCP automatically if it is not running,
 * and stops it afterwards if (and only if) this script started it.
 *
 * All traces are written to demo/traces/ as reproducible evidence.
 */
import { execSync, spawn, spawnSync } from "node:child_process";
import { appendFileSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LOG_FILE = join(ROOT, "demo", "evidence", "demo-run.log");
const HEALTH_URL = `http://${process.env.MCP_HOST ?? "127.0.0.1"}:${process.env.MCP_PORT ?? "3001"}/health`;

function log(line) {
  const lineStr = `[demo] ${line}`;
  console.log(lineStr);
  try {
    appendFileSync(LOG_FILE, lineStr + "\n");
  } catch {
    // evidence logging is best-effort
  }
}

async function isHealthy() {
  try {
    const res = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function waitForHealth(deadlineMs = 90000) {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    if (await isHealthy()) return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

function quoteArg(value) {
  return /\s/.test(value) ? `"${value.replace(/"/g, "")}"` : value;
}

function runFlow(args) {
  const cmd = ["npx", "tsx", "src/cli.ts", ...args.map(quoteArg)].join(" ");
  log(`$ ${cmd}`);
  const res = spawnSync(cmd, {
    cwd: ROOT,
    shell: true,
    stdio: "inherit",
    encoding: "utf8",
  });
  if (res.status !== 0) {
    log(`flow exited with status ${res.status}`);
  }
  return res.status ?? 1;
}

async function main() {
  writeFileSync(LOG_FILE, `demo run started ${new Date().toISOString()}\n`);
  const results = { flows: 0, failures: 0 };

  // 1. make sure the self-hosted official Chain MCP is available for the testnet profile
  let server = null;
  if (!(await isHealthy())) {
    log("self-hosted Chain MCP not running - starting it (official PharosNetwork/pharos-mcp)");
    spawnSync("node", ["scripts/chain-mcp.mjs", "ensure"], { cwd: ROOT, shell: true, stdio: "inherit" });
    server = spawn(process.execPath, ["scripts/chain-mcp.mjs", "start"], {
      cwd: ROOT,
      shell: true,
      stdio: "ignore",
      detached: false,
    });
    const healthy = await waitForHealth();
    if (!healthy) {
      log("FATAL: Chain MCP did not become healthy; aborting demo");
      process.exit(1);
    }
    log("Chain MCP is healthy");
  } else {
    log("self-hosted Chain MCP already running");
  }

  // 2. live flows - each one is a single user request, end to end
  try {
    const flows = [
      {
        name: "FLOW 1 - Atlantic testnet / funded wallet / minimum 1 PHRS",
        args: [
          "--wallet", "funded",
          "--request", "Check this Pharos testnet wallet's current native balance and determine whether it meets my configured minimum.",
        ],
      },
      {
        name: "FLOW 2 - Atlantic testnet / empty wallet / minimum 1 PHRS",
        args: [
          "--wallet", "empty",
          "--request", "Check whether this Pharos testnet wallet's native balance meets my configured minimum before any action is taken.",
        ],
      },
      {
        name: "FLOW 3 - Official hosted Chain MCP / Pacific mainnet profile",
        args: [
          "--profile", "hosted-mainnet",
          "--wallet", "mainnet-sample",
          "--rule", "config/rule.hosted-mainnet.json",
          "--request", "Check this Pharos mainnet wallet's native PROS balance against my configured minimum.",
        ],
      },
    ];

    for (const flow of flows) {
      log("");
      log(flow.name);
      const status = runFlow(flow.args);
      results.flows += 1;
      if (status !== 0) results.failures += 1;
    }
  } finally {
    if (server) {
      log("stopping the self-hosted Chain MCP started by this demo");
      try {
        if (process.platform === "win32") {
          execSync(`taskkill /pid ${server.pid} /T /F`, { stdio: "ignore" });
        } else {
          server.kill("SIGTERM");
        }
      } catch (error) {
        log(`could not stop server: ${error.message}`);
      }
    }
  }

  log("");
  log(`demo complete: ${results.flows} flow(s), ${results.failures} failure(s)`);
  log("traces saved under demo/traces/");
  process.exit(results.failures === 0 ? 0 : 1);
}

main().catch((error) => {
  log(`FATAL: ${error.message}`);
  process.exit(1);
});

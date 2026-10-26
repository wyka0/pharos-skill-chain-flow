#!/usr/bin/env node
/**
 * Manage the OFFICIAL Pharos Chain MCP server (github.com/PharosNetwork/pharos-mcp)
 * for local, read-only use against the Pharos Atlantic Testnet.
 *
 * Commands:
 *   node scripts/chain-mcp.mjs ensure   clone + install + build if missing
 *   node scripts/chain-mcp.mjs start    ensure, then run the server (HTTP transport)
 *   node scripts/chain-mcp.mjs health   print /health status, exit 0 if healthy
 *
 * Defaults (overridable via env, see .env.example):
 *   PHAROS_RPC_URL        https://atlantic.dplabs-internal.com   (Atlantic Testnet)
 *   PHAROS_CHAIN_ID       688689
 *   PHAROS_NATIVE_SYMBOL  PHRS
 *   MCP_HOST / MCP_PORT   127.0.0.1:3001
 *
 * The server is started with send_raw_transaction disabled (its own default):
 * this setup is strictly read-only.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const VENDOR_DIR = join(ROOT, "vendor");
const REPO_DIR = join(VENDOR_DIR, "pharos-mcp");
const REPO_URL = "https://github.com/PharosNetwork/pharos-mcp.git";

const MCP_HOST = process.env.MCP_HOST ?? "127.0.0.1";
const MCP_PORT = process.env.MCP_PORT ?? "3001";
const HEALTH_URL = `http://${MCP_HOST}:${MCP_PORT}/health`;
const MCP_ENDPOINT = `http://${MCP_HOST}:${MCP_PORT}/mcp`;

const PHAROS_RPC_URL = process.env.PHAROS_RPC_URL ?? "https://atlantic.dplabs-internal.com";
const PHAROS_CHAIN_ID = process.env.PHAROS_CHAIN_ID ?? "688689";
const PHAROS_NATIVE_SYMBOL = process.env.PHAROS_NATIVE_SYMBOL ?? "PHRS";

function sh(cmd, opts = {}) {
  console.log(`[chain-mcp] $ ${cmd}`);
  const res = spawnSync(cmd, { shell: true, stdio: "inherit", cwd: opts.cwd ?? ROOT, ...opts });
  if (res.status !== 0) {
    throw new Error(`command failed (exit ${res.status}): ${cmd}`);
  }
}

async function healthOnce(timeoutMs = 3000) {
  try {
    const res = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return { ok: false, status: res.status };
    const body = await res.json().catch(() => ({}));
    return { ok: body.status === "ok" || typeof body.chainId === "number", body };
  } catch {
    return { ok: false };
  }
}

async function waitForHealth(deadlineMs = 60000) {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    const h = await healthOnce();
    if (h.ok) return h;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Chain MCP did not become healthy within ${deadlineMs}ms at ${HEALTH_URL}`);
}

async function ensure() {
  if (!existsSync(join(REPO_DIR, "package.json"))) {
    mkdirSync(VENDOR_DIR, { recursive: true });
    sh(`git clone --depth 1 ${REPO_URL} pharos-mcp`, { cwd: VENDOR_DIR });
  }
  if (!existsSync(join(REPO_DIR, "node_modules"))) {
    sh("npm install", { cwd: REPO_DIR });
  }
  if (!existsSync(join(REPO_DIR, "dist", "src", "index.js"))) {
    sh("npm run build", { cwd: REPO_DIR });
  }
}

async function start() {
  await ensure();
  const existing = await healthOnce();
  if (existing.ok) {
    console.log(`[chain-mcp] already running at ${MCP_ENDPOINT}`);
    console.log(`[chain-mcp] ${JSON.stringify(existing.body)}`);
    return;
  }
  const child = spawn(process.execPath, [join(REPO_DIR, "dist", "src", "index.js")], {
    cwd: REPO_DIR,
    env: {
      ...process.env,
      PHAROS_RPC_URL,
      PHAROS_CHAIN_ID,
      PHAROS_NATIVE_SYMBOL,
      MCP_TRANSPORT: "http",
      MCP_HOST,
      MCP_PORT,
      ENABLE_SEND_RAW_TRANSACTION: "false",
    },
    stdio: "inherit",
  });
  child.on("exit", (code) => {
    console.log(`[chain-mcp] server exited with code ${code}`);
    process.exit(code ?? 0);
  });
  try {
    const h = await waitForHealth();
    console.log(`[chain-mcp] healthy at ${HEALTH_URL}: ${JSON.stringify(h.body)}`);
    console.log(`[chain-mcp] MCP endpoint: ${MCP_ENDPOINT}`);
    console.log(
      `[chain-mcp] network: ${PHAROS_RPC_URL} (chain ${PHAROS_CHAIN_ID}, symbol ${PHAROS_NATIVE_SYMBOL}) - read-only`,
    );
  } catch (error) {
    console.error(`[chain-mcp] ${error.message}`);
    child.kill();
    process.exit(1);
  }
}

async function main() {
  const cmd = process.argv[2] ?? "start";
  if (cmd === "ensure") {
    await ensure();
    console.log("[chain-mcp] official server ready under vendor/pharos-mcp");
  } else if (cmd === "health") {
    const h = await healthOnce();
    console.log(JSON.stringify(h.ok ? h.body : { ok: false, ...h }));
    process.exit(h.ok ? 0 : 1);
  } else if (cmd === "start") {
    await start();
  } else {
    console.error("unknown command; use ensure | start | health");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`[chain-mcp] ${error.message}`);
  process.exit(1);
});

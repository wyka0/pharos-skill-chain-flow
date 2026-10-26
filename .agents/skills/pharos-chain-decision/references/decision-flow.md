# Live Chain Decision Flow — Operation Instructions

This file is the machine-readable spec an agent follows to execute the
`pharos-chain-decision` skill. It teaches the agent how to fetch live data from the
official Pharos Chain MCP, validate it, apply the user's configurable rule, and
return a decision with a trace.

> **Network Configuration**: `<network>` is resolved from `assets/networks.json`
> using the rule's `network` field. Defaults to `atlantic-testnet`.
>
> **MCP Endpoint**: resolved from the active profile (see Step 1). The hosted
> endpoint `https://mcp.pharos.xyz/mcp` serves Pacific Mainnet (chain 1672); the
> Atlantic testnet (chain 688689) requires the self-hosted official server.
>
> **Private Key**: never required. This flow is read-only.

---

## Resolve Configuration

### Overview

Load the decision rule, the target network, and the Chain MCP endpoint before any
network call. The rule defines the minimum balance and comparison; the network
defines the expected chain ID and native symbol.

### Command Template

```bash
# Rule (user-editable; template at assets/rule.example.json)
cat config/rule.json

# Network entry (official Skill Engine schema)
jq '.networks[] | select(.name=="atlantic-testnet")' skills/pharos-chain-decision/assets/networks.json

# Reproducible runner (executes all steps below in one shot)
npm run flow -- --wallet funded --profile atlantic-testnet
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `--wallet <name>` | string | one of `--wallet`/`--address` | Named demo wallet from `config/wallets.json` |
| `--address <0x…>` | string | one of `--wallet`/`--address` | Any EVM address to evaluate |
| `--rule <path>` | string | No | Path to the rule JSON (default `config/rule.json`) |
| `--profile <name>` | string | No | `atlantic-testnet` (default) or `hosted-mainnet` |
| `--out <dir>` | string | No | Trace output directory (default `demo/traces`) |
| `--request <text>` | string | No | The user request text recorded in the trace |

### Output Parsing

| Field | Description |
|-------|-------------|
| `minimumNativeBalance` | Decimal string; converted to wei with 18 decimals |
| `comparison` | `gte` \| `gt` \| `lte` \| `lt` \| `eq` |
| `network` | Must exist in `assets/networks.json`; supplies `chainId` |
| `chainMcpUrl` (profile) | The MCP endpoint the flow will call |

### Error Handling

| Error | Cause | Fix |
|-------|-------|-----|
| `CONFIG_INVALID` | Rule missing fields, bad decimal, unknown comparison | Correct `config/rule.json`; decimals ≤ 18 |
| `CONFIG_NETWORK_UNKNOWN` | `rule.network` not in `assets/networks.json` | Use `atlantic-testnet` or `mainnet` |
| `CONFIG_PROFILE_MISMATCH` | Profile network ≠ rule network | Align the profile with the rule, or edit the rule |

> **Agent Guidelines**:
> 1. Read `config/rule.json` (or the user-provided rule) and validate every field.
> 2. Resolve the network from `assets/networks.json`; note the expected `chainId`.
> 3. Resolve the Chain MCP endpoint from the profile.
> 4. Record the resolved configuration in the trace before calling the MCP.

---

## Connect and Verify Tools

### Overview

Open a Streamable-HTTP session with the Pharos Chain MCP and confirm the server
actually exposes the tools this flow depends on, before trusting it with decisions.

### Command Template

MCP JSON-RPC over the endpoint (a standard MCP client performs this handshake):

```json
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"pharos-chain-decision","version":"0.1.0"}}}
{"jsonrpc":"2.0","method":"notifications/initialized"}
{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}
```

Runner equivalent (does Steps 1–6 in one process):

```bash
npm run flow -- --wallet funded
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| endpoint URL | string | Yes | From the active profile (`chainMcpUrl`) |
| `protocolVersion` | string | Yes | `2025-06-18` (server-reported version) |

### Output Parsing

| Field | Description |
|-------|-------------|
| `serverInfo.name` | Expect `pharos-mcp-server` |
| `tools[].name` | Must include `get_chain_info` and `get_balance` |
| `mcp-session-id` (header) | Session handle for subsequent calls |

### Error Handling

| Error | Cause | Fix |
|-------|-------|-----|
| `MCP_CONNECTION_FAILED` | Server down / wrong URL / network issue | Check `/health` on self-hosted; verify endpoint; retry |
| `MISSING_TOOL` | Server lacks a required tool | Point at the official `PharosNetwork/pharos-mcp` server |

> **Agent Guidelines**:
> 1. Connect, then call `tools/list` and check for `get_chain_info` and `get_balance`.
> 2. Record the tool list and session id in the trace.
> 3. On failure, abort with `MCP_CONNECTION_FAILED` or `MISSING_TOOL` — never guess data.

---

## Verify Target Network

### Overview

Call `get_chain_info` and confirm the MCP endpoint serves the network the rule
targets. This prevents evaluating a testnet rule against mainnet data (or vice
versa).

### Command Template

MCP tool call:

```json
{"name": "get_chain_info", "arguments": {}}
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| (none) | — | — | The tool takes no arguments |

### Output Parsing

| Field | Description |
|-------|-------------|
| `chainId` | Decimal chain ID; must equal the network's `chainId` (688689 testnet / 1672 mainnet) |
| `latestBlock` / `latestBlockHex` | Latest block; recorded in the trace as data freshness evidence |
| `nativeSymbol` | `PHRS` on testnet, `PROS` on mainnet (informational) |
| `chainIdMatches` | Server-side check (self-hosted config); the flow re-validates independently |

### Error Handling

| Error | Cause | Fix |
|-------|-------|-----|
| `NETWORK_MISMATCH` | Reported `chainId` ≠ configured network `chainId` | Abort. Switch profile or rule; never proceed |
| `INVALID_MCP_OUTPUT` | Response missing `chainId`/`latestBlock` or unparseable | Record raw output; check server version |

> **Agent Guidelines**:
> 1. Call `get_chain_info` and parse `chainId`.
> 2. Compare against the configured network's `chainId` with a hard equality check.
> 3. Record the full raw response in the trace.
> 4. On mismatch, abort with `NETWORK_MISMATCH` and explain both chain IDs.

---

## Fetch Live Balance

### Overview

Call `get_balance` for the target address. This is the live value the decision
depends on — it must be fetched in this run, never assumed.

### Command Template

MCP tool call:

```json
{"name": "get_balance", "arguments": {"address": "<address>"}}
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `address` | string | Yes | `0x` + 40 hex characters. The wallet to evaluate |
| `block` | string \| number | No | Omit for `latest` (recommended for decisions) |

### Output Parsing

| Field | Description |
|-------|-------------|
| `address` | Echo of the queried address (validate case-insensitively) |
| `balanceWei` | Hex (`0x…`) or decimal wei string — the primary value; parse with BigInt |
| `balance` | Human-readable decimal (informational; derived from `balanceWei` when both present) |
| `symbol` | Native token symbol (`PHRS` / `PROS`) |
| `balanceHex` | Hex form of the balance |

### Error Handling

| Error | Cause | Fix |
|-------|-------|-----|
| `INVALID_ADDRESS` | Address not `0x` + 40 hex | Ask the user for a corrected address |
| `MCP_TOOL_ERROR` | Server returned `isError` (e.g. `address must be a valid EVM address`) | Surface the server message; fix the input |
| `INVALID_MCP_OUTPUT` | `balanceWei` missing/unparseable/negative | Record raw output; retry once; then abort |

> **Agent Guidelines**:
> 1. Validate the address format **before** calling the tool.
> 2. Call `get_balance` with only the `address` argument (latest block).
> 3. Parse `balanceWei` with BigInt; recompute the decimal from wei rather than
>    trusting `balance` if the two disagree.
> 4. Record the full raw response in the trace.

---

## Apply Decision Rule

### Overview

Convert the configured minimum to wei and compare against the live `balanceWei`
using exact integer arithmetic. The outcome is one of `MEETS_MINIMUM` or
`BELOW_MINIMUM` (plus `EQ_MET` semantics for `eq`).

### Command Template

```
minimumWei = parseUnits(rule.minimumNativeBalance, 18)
decision   = compare(balanceWei, minimumWei, rule.comparison)   // gte|gt|lte|lt|eq
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `balanceWei` | bigint | Yes | From Step 4 (live MCP data) |
| `minimumWei` | bigint | Yes | From the rule (18-decimal fixed point) |
| `comparison` | string | Yes | `gte` \| `gt` \| `lte` \| `lt` \| `eq` |

### Output Parsing

| Field | Description |
|-------|-------------|
| `decision` | `MEETS_MINIMUM` when the comparison holds, otherwise `BELOW_MINIMUM` |
| `explanation` | One-line rationale embedding the live balance, the minimum, the network, the block, and the MCP endpoint |

### Error Handling

| Error | Cause | Fix |
|-------|-------|-----|
| `INVALID_MCP_OUTPUT` | Balance not fetched (Steps 3–4 skipped/failed) | Never evaluate without live data; re-run the flow |

> **Agent Guidelines**:
> 1. Use BigInt only — never floating point for wei math.
> 2. Compare in wei, not in human units.
> 3. Quote the live values (balance, minimum, block) in the explanation.

---

## Return Decision with Trace

### Overview

Deliver the decision, the explanation, and a complete trace proving where every
number came from.

### Command Template

```bash
# traces are written to demo/traces/trace-<id>.json
npm run flow -- --wallet funded --out demo/traces
```

### Output Parsing

| Field | Description |
|-------|-------------|
| `result.decision` | `MEETS_MINIMUM` \| `BELOW_MINIMUM` |
| `result.explanation` | Human-readable rationale with live figures |
| `trace.steps[]` | Ordered steps: config, connect, tools/list, chain info, balance, rule evaluation |
| `trace.steps[].raw` | Raw MCP responses (evidence of live data) |
| `trace.config` | Resolved rule, network, endpoint, request text |

### Error Handling

| Error | Cause | Fix |
|-------|-------|-----|
| (flow error) | Any step failed | The trace still records the failing step with `status:"error"`; fix and re-run |

> **Agent Guidelines**:
> 1. Print the decision and explanation to the user.
> 2. Save the trace JSON and give the user the file path.
> 3. Label any fixture/demo data as `FIXTURE`; only trace-confirmed output is live.

---

## Reproducible Runner (headless)

### Overview

`src/` implements exactly the procedure above as a deterministic runner so the flow
can be demonstrated, tested, and replayed without an interactive agent session. It
reads the same skill assets (`assets/networks.json`), the same rule, and calls the
same Chain MCP tools in the same order.

### Command Template

```bash
npm install
npm run chain-mcp          # terminal 1: self-hosted official Chain MCP → Atlantic testnet
npm run demo               # terminal 2: one request → both demo wallets → traces
npm run test:live:testnet  # optional: live integration tests against the local server
```

### Output Parsing

| Field | Description |
|-------|-------------|
| console summary | Decision, live balance, block, endpoint |
| `demo/traces/*.json` | Full reproducible evidence |

> **Agent Guidelines**:
> 1. Prefer the runner for CI and grading; prefer the interactive path for the video.
> 2. Both paths must produce equivalent traces for the same inputs.

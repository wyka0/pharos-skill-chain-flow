---
name: pharos-chain-decision
description: >
  REQUIRED for any Pharos live-data decision or threshold check. Invoke whenever the
  user wants a decision that depends on live Pharos on-chain state — for example
  "check this wallet's balance against my configured minimum", "does this address
  meet my threshold", "run a guardrail check before acting on Pharos", "live chain
  decision", or mentions pharos, PHRS, PROS, atlantic-testnet, chain mcp, balance
  threshold, minimum balance, or skill chain flow. This skill fetches live data via
  the official Pharos Chain MCP (get_chain_info, get_balance), validates the network
  and returned fields, applies the user's configurable rule, and returns a decision
  with an explanation and a full trace. Read-only: it never sends transactions and
  never requires a private key. Do not guess or hardcode balances — always fetch
  live data through the Chain MCP inside the same run.
version: 0.1.0
requires:
  anyBins:
    - node
---

# Pharos Chain Decision Skill

One user request in, one live-data decision out:

```
request ──▶ load rule + network config ──▶ Pharos Chain MCP (tools/list,
           get_chain_info, get_balance) ──▶ validate ──▶ apply rule
        ──▶ decision + explanation + trace
```

The decision is computed from the balance returned by the Chain MCP **in the same
run**. It is never hardcoded, cached across runs, or substituted with fixtures.

## Prerequisites

1. **A Pharos Chain MCP endpoint** (official server, one of):
   - Hosted: `https://mcp.pharos.xyz/mcp` — targets **Pacific Mainnet** (chain 1672).
   - Self-hosted for testnet (official repo, documented in the Chain MCP docs):
     ```bash
     git clone https://github.com/PharosNetwork/pharos-mcp.git
     cd pharos-mcp && npm install && npm run build
     PHAROS_RPC_URL=https://atlantic.dplabs-internal.com \
     PHAROS_CHAIN_ID=688689 \
     PHAROS_NATIVE_SYMBOL=PHRS \
     MCP_TRANSPORT=http MCP_HOST=127.0.0.1 MCP_PORT=3001 \
     npm start
     # endpoint: http://127.0.0.1:3001/mcp  (health: http://127.0.0.1:3001/health)
     ```
   In this repository the self-hosted server is managed by `node scripts/chain-mcp.mjs start`.
2. **Node.js 20+** — needed for the reproducible flow runner (`npm run flow`).
3. **No private key.** Every operation in this skill is read-only. Never ask for,
   accept, or pass a private key.

## Network Configuration

Network information is stored in `assets/networks.json` (same schema as the official
Pharos Skill Engine) and contains both the Atlantic testnet and Pacific mainnet.

- **Default Network**: `atlantic-testnet` (chain 688689). Used when the user does not
  specify a network.
- **Switching Networks**: when the user specifies mainnet, use the `mainnet` entry
  (chain 1672) and the hosted Chain MCP endpoint.
- **Network mismatch is fatal**: the chain ID reported by `get_chain_info` must equal
  the `chainId` of the configured network, otherwise the flow aborts with a
  `NETWORK_MISMATCH` error. Never evaluate a rule against data from another network.

```bash
# Example: reading network configuration
RPC_URL=$(jq -r '.networks[] | select(.name=="atlantic-testnet") | .rpcUrl' assets/networks.json)
```

## Decision Rule Configuration

The rule is data, not code. Store it in `config/rule.json` in the host project
(a template is provided at `assets/rule.example.json`):

| Field                  | Type   | Required | Description                                                    |
|------------------------|--------|----------|----------------------------------------------------------------|
| `minimumNativeBalance` | string | Yes      | Decimal native-token amount, e.g. `"1"` or `"0.5"` (up to 18 decimals) |
| `comparison`           | string | Yes      | One of `gte`, `gt`, `lte`, `lt`, `eq`                          |
| `network`              | string | Yes      | Network name from `assets/networks.json` (e.g. `atlantic-testnet`) |
| `description`          | string | No       | Free-text description of the rule                              |

The `minimumNativeBalance` is converted to wei with 18-decimal precision and compared
against the live `balanceWei` using exact integer math (no floating point).

## Capability Index

Load `references/decision-flow.md` for the full command templates, parameter tables,
output parsing rules, and error handling for each step.

| User Need | Chain MCP Tools | Detailed Instructions |
|-----------|-----------------|----------------------|
| Check a wallet balance against my configured minimum / threshold | `get_chain_info` + `get_balance` | → `references/decision-flow.md#verify-target-network`, `references/decision-flow.md#fetch-live-balance` |
| Make a live decision before an on-chain action (guardrail) | `get_chain_info` + `get_balance` | → `references/decision-flow.md#apply-decision-rule` |
| Verify which Pharos network an MCP endpoint serves | `get_chain_info` | → `references/decision-flow.md#verify-target-network` |
| Prove where a decision's data came from (trace/audit) | all of the above | → `references/decision-flow.md#return-decision-with-trace` |
| Run the decision headlessly / in CI (same flow, same skill) | same tools via the runner | → `references/decision-flow.md#reproducible-runner` |

## General Error Handling

| Error Scenario | Signature / Code | Handling |
|----------------|------------------|----------|
| MCP endpoint unreachable | `MCP_CONNECTION_FAILED` | Check the endpoint URL and that the self-hosted server is running (`/health`); report the URL in the error |
| Required tool missing on server | `MISSING_TOOL` | List the server's tools via `tools/list`; report which required tool is missing |
| Chain ID does not match configured network | `NETWORK_MISMATCH` | Abort. Do not evaluate. Point the user at the profile/network configuration |
| Invalid address | `INVALID_ADDRESS` | Address must be `0x` + 40 hex characters; ask the user to re-check |
| Missing/unparseable fields in tool output | `INVALID_MCP_OUTPUT` | Record the raw output in the trace, report the missing field, abort |
| Tool returned an error (`isError`) | `MCP_TOOL_ERROR` | Surface the server's error message verbatim in the trace and to the user |
| Rate limited (hosted endpoint) | HTTP `429` | Back off per `Retry-After`; self-host to raise limits |

See `references/decision-flow.md` for the per-step error handling tables.

## Security Reminders

- **Read-only.** This skill never broadcasts transactions. If a user asks to move
  funds, stop and direct them to the appropriate skill.
- **No private keys.** Never request, store, or log keys. The Chain MCP is
  non-custodial and needs none.
- **Live vs fixture.** Any demonstration data must be labeled `FIXTURE`. Only output
  labeled with a live MCP endpoint, block number, and timestamp may be presented as
  live.

## Trace Requirement

Every run produces a trace file (JSON) containing: the user request, the skill name
and version, the resolved rule and network, one step per MCP call with raw responses,
timings, the validation results, the rule evaluation, and the final decision. Save it
under `demo/traces/` by default (`--out` overrides). A run without a trace is
considered incomplete.

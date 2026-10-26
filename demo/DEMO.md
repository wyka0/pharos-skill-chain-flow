# Demo — one request, end to end

Everything in this file was executed for real on 2026-10-26. Reproduce it with the
commands below; no mock data is involved at any point.

## Prerequisites

- Node.js ≥ 20, npm, git (verified with Node 24.14.1, npm 11.11.0)
- Internet access to `github.com` (one-time clone of the official Chain MCP) and to the
  Pharos RPC / hosted MCP endpoints

## The demo (3 commands)

```bash
npm install           # once
npm run chain-mcp     # terminal 1 — official PharosNetwork/pharos-mcp on Atlantic testnet
                      #   clone → npm install → build → serve at http://127.0.0.1:3001/mcp
                      #   health: {"status":"ok","chain":"Pharos","chainId":688689,...}
npm run demo          # terminal 2 — runs 3 LIVE flows and writes traces
```

`npm run demo` performs, in order:

1. Health check (starts the self-hosted server itself if it is not running).
2. **FLOW 1** — Atlantic testnet, funded wallet, rule "≥ 1 PHRS" → decision computed from
   the live balance (`MEETS_MINIMUM`, ~100.93 PHRS at time of writing).
3. **FLOW 2** — Atlantic testnet, empty wallet, same rule → opposite outcome
   (`BELOW_MINIMUM`, live balance 0) — same flow, different live data.
4. **FLOW 3** — official **hosted** Chain MCP (`https://mcp.pharos.xyz/mcp`, Pacific
   mainnet) with the `mainnet-sample` wallet — proves the same skill against the hosted
   endpoint with live mainnet data.

Each flow is a **single user request** handled end-to-end: skill config → Chain MCP
(`tools/list`, `get_chain_info`, `get_balance`) → validation → rule → decision +
explanation + trace file.

## Single-request runs (what you show on screen)

```bash
npm run flow -- --wallet funded
npm run flow -- --wallet empty
```

Sample output (real run — `demo/evidence/flow1-funded-testnet-console.txt`):

```
Decision     : MEETS_MINIMUM
Live balance : 100.933484763104 PHRS (100933484763104000000 wei)
Minimum      : gte 1 PHRS (1000000000000000000 wei)
Network      : atlantic-testnet (chain 688689) at block 31882582
MCP endpoint : http://127.0.0.1:3001/mcp
Explanation  : Decision MEETS_MINIMUM: live native balance of 0x6378d100db94ba95d0fa0e50bdab3fed01dc26e7
               is 100.933484763104 PHRS (…) at block 31882582 on atlantic-testnet (chain 688689).
               The rule requires the balance is greater than or equal to 1 PHRS, which is satisfied.
               Data source: Pharos Chain MCP get_balance via http://127.0.0.1:3001/mcp at 2026-10-26T…
Trace        : demo\traces\trace-phcd-mvoizhvg-f3fc3263.json
```

Tip for the recording: open `https://atlantic.pharosscan.xyz/address/0x6378d100db94ba95d0fa0e50bdab3fed01dc26e7`
in a second window so the on-chain balance is visible next to the agent's decision.

## The SkillEngine (interactive) path

The skill registers through the official skills CLI and is then invokable by any
supported agent (OpenCode, Claude Code, Codex, …):

```bash
npm run skills:install        # npx skills add . --skill pharos-chain-decision -a opencode --copy -y
npx skills list               # → pharos-chain-decision  .\.agents\skills\pharos-chain-decision
```

Then, in a fresh agent session in this project, one user request is enough:

> "Check this Pharos testnet wallet's current native balance and determine whether it
> meets my configured minimum."

The agent loads the installed `SKILL.md`, follows the Capability Index to
`references/decision-flow.md`, calls the Chain MCP tools in the documented order, and
answers with the decision + trace. A preserved example of exactly this agent-path
invocation is committed as `demo/traces/trace-phcd-agent-path-20261026.json`
(decision `MEETS_MINIMUM`, block 31882729, live balance 100.933484763104 PHRS).

## Evidence committed in this repository

| File | What it proves |
|------|----------------|
| `demo/evidence/demo-console.txt` | the full `npm run demo` run (3/3 flows) |
| `demo/evidence/flow1-funded-testnet-console.txt` | funded wallet, live MEETS_MINIMUM |
| `demo/evidence/flow2-empty-testnet-console.txt` | empty wallet, live BELOW_MINIMUM |
| `demo/evidence/flow3-hosted-mainnet-console.txt` | hosted official MCP, live mainnet data |
| `demo/evidence/skills-add.txt` / `skills-list.txt` | SkillEngine registration output |
| `demo/traces/trace-phcd-*.json` | per-run traces with raw MCP responses, block numbers, timestamps |
| `demo/traces/trace-phcd-agent-path-20261026.json` | the SkillEngine-invoked agent-path run |

## Optional +50 video walkthrough (recording script)

1. **(0:00–0:30) Setup.** Show the repo, `README.md`, then `npm run chain-mcp` and its
   health line: `{"status":"ok","chain":"Pharos","chainId":688689,…}`.
2. **(0:30–1:00) The skill.** Open `skills/pharos-chain-decision/SKILL.md` — frontmatter,
   Capability Index, "Live Data Requirement". Run `npx skills list` showing it installed.
3. **(1:00–2:00) One request, live.** Run `npm run flow -- --wallet funded`. Highlight:
   the 6 steps, the live balance, the block number, the decision, the trace path.
4. **(2:00–2:30) Rule is configurable.** Edit `config/rule.json`
   (`"minimumNativeBalance": "200"`), rerun `npm run flow -- --wallet funded` → now
   `BELOW_MINIMUM` from the *same live balance*. Change it back. (Or use
   `--wallet empty` for a zero-balance outcome.)
5. **(2:30–3:00) It's really live.** Open the explorer address page next to the trace
   JSON (`demo/traces/…`), point at the raw `get_balance` response and block number.
6. **(3:00–3:30) Hosted endpoint.** Run FLOW 3 (`--profile hosted-mainnet`), note the
   different endpoint and chain 1672.
7. **(3:30–4:00) Tests.** Run `npm test` (47 passing) and `npm run test:live`.
8. Close on `docs/flow-diagram.md`.

Never show a private key — none exists in this project, and none is needed.

## Re-running later

Balances move; the *decisions* may legitimately change. That is the point: every rerun
fetches fresh data through the Chain MCP. If the self-hosted server fails to start
(e.g. the upstream repo moved), re-run `npm run chain-mcp` and check
`vendor/pharos-mcp`; the demo script also auto-starts it when needed.

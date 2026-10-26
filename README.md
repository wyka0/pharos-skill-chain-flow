# Pharos Skill Chain Flow — Task 8

**A real SkillEngine Skill composed with the official Pharos Chain MCP into one working agent flow.**
Pharos Agent Arena · Task 8 · Skill + Chain MCP Flow

One user request → the `pharos-chain-decision` Skill is invoked → it fetches **live** chain
data through the **Pharos Chain MCP** → validates it → applies a **configurable rule** →
returns a decision, an explanation, and a full trace. Read-only end to end; no private
keys anywhere.

> **The decision is genuinely computed from the live balance returned by the Chain MCP in
> the same run.** Nothing is hardcoded, cached, or mocked. Fixture data exists only inside
> clearly labeled unit tests.

---

## The four assignment requirements, and where they are proven

| # | Requirement | Evidence |
|---|-------------|----------|
| 1 | Skill's output depends on live Chain MCP data in the same flow | `src/flow.ts` steps 4–6; live traces in `demo/traces/` (balance + block recorded per run) |
| 2 | Flow runs end-to-end from one user request | `npm run demo` → 3/3 flows green (`demo/evidence/demo-console.txt`); one command per request via `npm run flow` |
| 3 | Diagram / write-up of what calls what, in order | [`docs/flow-diagram.md`](docs/flow-diagram.md) (sequence diagram + call table) |
| 4 | Demo with real data moving through both tools | `demo/evidence/*.txt` + `demo/traces/*.json` (raw MCP responses embedded) |

Bonus evidence: the skill is installed through the official SkillEngine CLI
(`npx skills add`) and was invoked by an actual agent runtime — that run is preserved at
`demo/traces/trace-phcd-agent-path-20261026.json`.

---

## What was discovered from official sources (summary)

Full report with links: [`docs/discovery.md`](docs/discovery.md).

- **SkillEngine** = the official Agent Skills package (`SKILL.md` + `references/` +
  `assets/`), installed with the skills CLI: `npx skills add <repo|path>`. The official
  Pharos skill lives at `github.com/PharosNetwork/pharos-skill-engine`; new skills are
  authored per the official Piggy Bank tutorial (reference files with Command Template /
  Parameters / Output Parsing / Error Handling + Agent Guidelines, registered in the
  Capability Index).
- **Pharos Chain MCP** = official server `github.com/PharosNetwork/pharos-mcp`.
  Hosted endpoint `https://mcp.pharos.xyz/mcp` (Streamable HTTP, no auth, **Pacific
  Mainnet**, chain 1672). 14 tools verified live via `tools/list`, including
  `get_chain_info` and `get_balance`.
- **The hosted endpoint serves mainnet**, so for the testnet flow the official docs'
  self-hosting path is used: same official server, started with
  `PHAROS_RPC_URL=https://atlantic.dplabs-internal.com`, `PHAROS_CHAIN_ID=688689`,
  `PHAROS_NATIVE_SYMBOL=PHRS` (see `scripts/chain-mcp.mjs`).
- **Atlantic Testnet** verified live: chainId `0xa8231` (688689), latest block ~3.19 M.
- The npm package named `pharos-mcp` is **unrelated**; only the official GitHub repo is used.

---

## Repository layout

```
pharos-skill-chain-flow/
├── skills/pharos-chain-decision/      ← THE SkillEngine Skill (installable)
│   ├── SKILL.md                       ← entry point + Capability Index (official format)
│   ├── references/decision-flow.md    ← machine-readable flow spec (4-part sections)
│   └── assets/
│       ├── networks.json              ← official Skill Engine network schema
│       └── rule.example.json          ← decision rule template
├── src/                               ← deterministic executor of the same skill
│   ├── cli.ts                         ← one user request → one flow → trace
│   ├── flow.ts                        ← 6-step orchestration (see diagram)
│   ├── mcp.ts                         ← official MCP SDK client (Streamable HTTP)
│   ├── validate.ts                    ← address / chain-id / field validation
│   ├── decision.ts                    ← rule engine (exact BigInt wei math)
│   ├── trace.ts                       ← trace recording (JSON evidence)
│   ├── config.ts / parse.ts / errors.ts / types.ts
├── config/                            ← user-editable configuration (no secrets)
│   ├── rule.json                      ← THE configurable decision rule
│   ├── profiles.json                  ← atlantic-testnet (self-hosted) / hosted-mainnet
│   ├── wallets.json                   ← public demo addresses only
│   └── rule.hosted-mainnet.json
├── scripts/
│   ├── chain-mcp.mjs                  ← clone/build/run the OFFICIAL Chain MCP (testnet)
│   └── run-demo.mjs                   ← end-to-end demo (3 live flows)
├── test/                              ← unit (fixtures, labeled) + opt-in live tests
├── demo/
│   ├── traces/                        ← saved live traces (evidence)
│   ├── evidence/                      ← console captures (demo, skills add/list, flows)
│   └── DEMO.md                        ← demo + video recording instructions
└── docs/
    ├── discovery.md                   ← official findings + source links
    └── flow-diagram.md                ← sequence diagram + call order
```

## Architecture at a glance

```
User request ("Check this Pharos testnet wallet's balance vs my configured minimum")
        │
        ▼
SkillEngine: npx skills add . → .agents/skills/pharos-chain-decision  (invoked by agent)
        │  SKILL.md → rule (config/rule.json) + network (assets/networks.json)
        ▼
Pharos Chain MCP  (official server; self-hosted for testnet / hosted for mainnet)
        │  ① tools/list  ② get_chain_info  ③ get_balance(address)
        ▼
validate (chainId == 688689? fields present? wei parses?)  ──abort on mismatch──▶ error
        │
        ▼
apply rule  (balanceWei ≥ minimumWei, exact BigInt math)
        │
        ▼
decision + explanation + trace JSON  (demo/traces/trace-*.json)
```

Sequence diagram with exact tool calls: [`docs/flow-diagram.md`](docs/flow-diagram.md).

---

## Quickstart (5 commands, reproducible end-to-end)

Prereqs: Node.js ≥ 20 (tested on 24), git, npm. Windows/macOS/Linux all fine.

```bash
npm install                    # 1. install dependencies
npm run chain-mcp              # 2. clone+build+start the OFFICIAL Chain MCP on Atlantic testnet
                               #    (terminal stays open; endpoint http://127.0.0.1:3001/mcp)
npm test                       # 3. offline unit tests (fixtures are labeled, no network)
npm run demo                   # 4. THE DEMO: one request → 3 live flows → traces
npm run skills:install         # 5. register the skill with the SkillEngine CLI (npx skills add)
```

Expected demo output (real run, 2026-10-26 — see `demo/evidence/demo-console.txt`):

```
FLOW 1 - Atlantic testnet / funded wallet / minimum 1 PHRS
Decision     : MEETS_MINIMUM
Live balance : 100.933484763104 PHRS (100933484763104000000 wei)
Network      : atlantic-testnet (chain 688689) at block 31882626
MCP endpoint : http://127.0.0.1:3001/mcp
Trace        : demo\traces\trace-phcd-mvoj2x0w-610bab59.json

FLOW 2 - Atlantic testnet / empty wallet / minimum 1 PHRS
Decision     : BELOW_MINIMUM      ← same flow, opposite (live) outcome

FLOW 3 - Official hosted Chain MCP / Pacific mainnet profile
Decision     : BELOW_MINIMUM      ← hosted endpoint, live mainnet data
demo complete: 3 flow(s), 0 failure(s)
```

## Running a single request

```bash
# canonical example request (funded demo wallet)
npm run flow -- --wallet funded

# any address, any rule, any profile
npm run flow -- --address 0xYOUR_ADDRESS --rule config/rule.json --profile atlantic-testnet

# hosted official Chain MCP (Pacific mainnet) instead of the self-hosted testnet server
npm run flow -- --profile hosted-mainnet --wallet mainnet-sample --rule config/rule.hosted-mainnet.json
```

Flags: `--wallet <name>` · `--address <0x…>` · `--rule <path>` · `--profile <name>` ·
`--out <dir>` · `--request "<text>"` · `--no-save`. Exit code 0 = flow completed (either
decision); 1 = config/MCP/validation error (a trace with the failing step is still saved).

## Configuration

**Decision rule** — `config/rule.json` (template: `skills/pharos-chain-decision/assets/rule.example.json`):

```json
{
  "minimumNativeBalance": "1",
  "comparison": "gte",
  "network": "atlantic-testnet",
  "description": "Demo rule: the wallet must hold at least 1 PHRS on Pharos Atlantic Testnet"
}
```

`minimumNativeBalance` is a decimal string (≤ 18 decimals) compared in wei with exact
BigInt math. `comparison` ∈ `gte | gt | lte | lt | eq`. `network` must exist in the
skill's `assets/networks.json` and must match the profile's network, otherwise the flow
refuses to run (`CONFIG_PROFILE_MISMATCH` / `NETWORK_MISMATCH`).

**Profiles** — `config/profiles.json`:

| Profile | Chain MCP endpoint | Network | Notes |
|---------|--------------------|---------|-------|
| `atlantic-testnet` (default) | `http://127.0.0.1:3001/mcp` | chain 688689, PHRS | self-hosted official server (`npm run chain-mcp`) |
| `hosted-mainnet` | `https://mcp.pharos.xyz/mcp` | chain 1672, PROS | official hosted endpoint, 120 req/min |

Env overrides (see `.env.example`): `PHAROS_MCP_URL`, `PHAROS_MCP_PROFILE`,
`TRACE_OUT_DIR`, plus the server's `PHAROS_RPC_URL` / `PHAROS_CHAIN_ID` /
`PHAROS_NATIVE_SYMBOL` / `MCP_HOST` / `MCP_PORT`.

**Demo wallets** — `config/wallets.json` holds **public addresses only** (no keys exist
for them in this repo). Replace with your own address for your demo.

## Tests, typecheck, lint, build

```bash
npm test                    # 47 offline unit tests (fixtures labeled FIXTURE)
npm run test:live           # opt-in: hosted mainnet MCP, full flow, consistency-asserted
npm run test:live:testnet   # opt-in: self-hosted testnet MCP (server must be running)
npm run typecheck           # tsc --noEmit (strict)
npm run lint                # eslint (typescript-eslint recommended)
npm run build               # tsc → dist/
```

Live tests assert the **consistency property**: the returned decision must equal the
comparison of the live balance against the configured minimum — i.e. the decision provably
depends on the data the MCP returned in that run.

## Error handling coverage

| Failure | Behavior |
|---------|----------|
| MCP unreachable / server down | `MCP_CONNECTION_FAILED` with remediation hint |
| Required tool missing | `MISSING_TOOL` (checked via `tools/list` before any data call) |
| Wrong network (e.g. testnet rule vs mainnet endpoint) | `NETWORK_MISMATCH` — hard abort, never evaluates |
| Rule/profile network mismatch | `CONFIG_PROFILE_MISMATCH` before connecting |
| Bad address | `INVALID_ADDRESS` before any MCP call |
| Malformed/missing fields in MCP output | `INVALID_MCP_OUTPUT` (raw output preserved in trace) |
| MCP tool returns `isError` | `MCP_TOOL_ERROR` with the server's message verbatim |
| All failures | trace JSON still written, with the failing step and error |

## Live vs fixture policy

- Everything under `demo/` was produced by **real runs** against real MCP endpoints
  (self-hosted official server on Atlantic testnet; official hosted endpoint on mainnet).
- Fixtures exist **only** in `test/flow.test.ts`, `test/decision.test.ts`,
  `test/validate.test.ts` and are marked `FIXTURE` in comments and values
  (`fixture://chain-mcp` endpoints).
- Live traces always contain: MCP endpoint URL, chain ID, latest block, raw tool
  responses, and an ISO timestamp — so "live" is independently checkable against the
  explorer (`https://atlantic.pharosscan.xyz/address/<address>`).

## Security

- Read-only: the flow calls `tools/list`, `get_chain_info`, `get_balance` — never
  `send_raw_transaction`. The self-hosted server is started with broadcasting disabled
  (its own default).
- No private keys, seeds, or API secrets exist in this repository, its configs, logs, or
  traces. Demo wallet addresses are public. Never add keys — none are needed.

## Limitations

- The hosted Chain MCP serves Pacific Mainnet only; testnet requires the documented
  self-hosted official server (`npm run chain-mcp`), which needs git + Node ≥ 20.
- The Atlantic testnet RPC is rate-limited (500 req / 5 min per the docs); the hosted MCP
  is limited to 120 req/min per IP.
- The skill's decision covers native-balance rules. ERC-20 thresholds, multi-condition
  logic, and on-chain actions are intentionally out of scope (read-only, minimal).
- `get_balance` reflects the node's `latest` block at call time — concurrent activity can
  change the balance one block later; the trace records the block for this reason.
- The self-hosted server stores its clone under `vendor/pharos-mcp` (gitignored).

## Attribution / sources

Official sources used (full list in `docs/discovery.md`):
Pharos Skill Engine guide + Piggy Bank tutorial (docs.pharos.xyz) · Pharos MCP docs
(docs.pharos.xyz/tooling-and-infrastructure/mcp) · `PharosNetwork/pharos-mcp` ·
`PharosNetwork/pharos-skill-engine` (SKILL.md + assets/networks.json schema) ·
skills CLI (`vercel-labs/skills`) · Atlantic Testnet network page.

License: MIT.

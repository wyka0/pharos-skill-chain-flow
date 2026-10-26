# Discovery Report — Official Integration Findings (Task 8)

All findings below were verified against official sources before implementation
(discovery date: 2026-10-26). Live values were checked by direct calls during discovery.

## 1. Pharos SkillEngine

| Finding | Detail | Source |
|---|---|---|
| What the SkillEngine is | A packaged Agent Skills folder: `SKILL.md` (entry point, prerequisites, Capability Index) + `references/*.md` (machine-readable command specs) + `assets/` (networks.json, tokens, templates). The agent reads `SKILL.md`, matches intent in the Capability Index, then follows the referenced file. | [Skill Engine guide](https://docs.pharos.xyz/tooling-and-infrastructure/pharos-skill-engine-guide) |
| Install / registration mechanism | `npx skills add https://github.com/PharosNetwork/pharos-skill-engine` (skills.sh CLI). Local paths supported: `npx skills add ./my-local-skills`; agent selection with `-a opencode` etc.; installs into `.agents/skills/` (OpenCode project path) or `~/.config/opencode/skills/` (global). | [pharos.xyz/agent-skill-engine](https://www.pharos.xyz/agent-skill-engine) · [vercel-labs/skills docs](https://github.com/vercel-labs/skills/blob/main/docs/commands.md) · [supported agents](https://github.com/vercel-labs/skills/blob/main/docs/agents.md) |
| SKILL.md format | YAML frontmatter: `name`, `description` (trigger keywords — controls when agents invoke the skill), `version`, `requires.anyBins`. Body: Prerequisites, Network Configuration, Capability Index table (`User Need / Capability / Detailed Instructions`), error handling, security reminders, write pre-checks. | [official SKILL.md](https://github.com/PharosNetwork/pharos-skill-engine/blob/main/SKILL.md) |
| How to author a new skill (official procedure) | 1) write the operation file under `assets/` (if a contract is involved), 2) write `references/<skill>.md` with per-operation sections: Overview / Command Template / Parameters / Output Parsing / Error Handling + `> Agent Guidelines`, 3) register rows in the SKILL.md Capability Index and extend the `description` keywords. | [Piggy Bank skill tutorial](https://docs.pharos.xyz/tooling-and-infrastructure/pharos-skill-engine-guide/piggybank-skill-guide) |
| Official `assets/networks.json` schema | `{networks:[{name, rpcUrl, chainId, explorerUrl, explorerApiUrl, nativeToken}], defaultNetwork:"atlantic-testnet"}` — fetched verbatim and mirrored in our skill. | [assets/networks.json](https://github.com/PharosNetwork/pharos-skill-engine/blob/main/assets/networks.json) |
| Invocation workflow | Agent-first: the agent reads SKILL.md, resolves the intent via the Capability Index, executes the reference-file procedure (Foundry `cast`/`forge` in the official skill; Chain MCP tool calls in ours), then shows results with explorer links. | Skill Engine guide, "How the Agent Resolves a Request" |

Note: the official SkillEngine is Foundry-oriented (`cast`/`forge`). Task 8 asks for a
skill whose output depends on **Chain MCP** data, so our skill keeps the exact Skill
format and authoring conventions, but its reference file specifies MCP tool calls
instead of CLI commands. This composition (Skill → Chain MCP inside one flow) is what
the assignment requires and matches the Arena's stated toolkit (SkillEngine + Chain MCP
+ Developer Docs MCP combined into agent workflows).

## 2. Pharos Chain MCP

| Finding | Detail | Source |
|---|---|---|
| Hosted endpoint | `https://mcp.pharos.xyz/mcp`, Streamable HTTP, no auth, rate limit 120 req/min per IP. | [MCP docs](https://docs.pharos.xyz/tooling-and-infrastructure/mcp) |
| Server identity (verified live) | `initialize` handshake succeeded with protocol `2025-06-18`; server reports `pharos-mcp-server` v0.1.0 (hosted) / `0.5.1` (current repo build); instructions: "Read operations are safe. send_raw_transaction only accepts a transaction already signed outside this server." | live call |
| Tool list (verified live, 14 tools) | `get_chain_info`, `get_block_number`, `get_balance`, `get_transaction_count`, `get_gas_price`, `get_block`, `get_transaction`, `get_transaction_receipt`, `get_code`, `get_storage_at`, `eth_call`, `estimate_gas`, `get_logs` (≤1000-block window), `send_raw_transaction`. JSON-Schema `inputSchema` per tool. | live `tools/list` |
| `get_chain_info` output shape (live) | `{name:"Pharos", chainId, chainIdHex, expectedChainId, chainIdMatches, latestBlock, latestBlockHex, nativeSymbol, clientVersion, rpcUrl}` | live call |
| `get_balance` output shape (live) | `{address, balanceWei, balance, symbol, balanceHex}`; invalid input returns `isError:true` with `{error:{message:"address must be a valid EVM address"}}` | live call |
| Hosted network | Pacific Mainnet: chainId `1672` (`0x688`), RPC `https://rpc.pharos.xyz`, symbol PROS. | MCP docs + live `get_chain_info` |
| Testnet support | Documented self-hosting with env config: `PHAROS_RPC_URL`, `PHAROS_CHAIN_ID`, `PHAROS_NATIVE_SYMBOL`, `MCP_TRANSPORT=http`, `MCP_HOST`, `MCP_PORT`. Source repo: `github.com/PharosNetwork/pharos-mcp` (clone → npm install → npm run build → npm start). | MCP docs, "Self-Hosting" |
| npm name collision | The npm package `pharos-mcp` is an unrelated project (an LSP bridge). Only the official GitHub repo is used. | npm.io listing |
| Non-custodial | The server never receives keys; broadcasting is disabled by default on self-hosted instances. | MCP docs, "Security Notes" |

## 3. Network verification (live, during discovery)

| Network | RPC | Chain ID (hex) | Status | Source |
|---|---|---|---|---|
| Atlantic Testnet | `https://atlantic.dplabs-internal.com` | 688689 (`0xa8231`) | live — latest block `0x1e678dc` (~3.19 M) | [Atlantic Testnet docs](https://docs.pharos.xyz/getting-started/network/atlantic-testnet) + live `eth_chainId` |
| Pacific Mainnet | `https://rpc.pharos.xyz` | 1672 (`0x688`) | live | [Network docs](https://docs.pharos.xyz/getting-started/network) + live `eth_chainId` |

Testnet explorer: `https://atlantic.pharosscan.xyz/`. Testnet native symbol: PHRS
(skill-engine networks.json) / PROS on mainnet.

## 4. Agent Arena / task board

- The Arena portal (`ai.pharos.xyz`) is login-gated; the public task text for Task 8 was
  provided with the assignment. The public [Season of AI Build
  announcement](https://www.pharos.xyz/blog/introducing-pharos-season-of-ai-build-for-the-agentic-economy)
  confirms the program structure: Chain MCP + Developer Docs MCP + SkillEngine as the
  toolkit, a Builder Task Board (Easy/Medium/Hard), and +50 points for a video walkthrough.
  The Arena site's [Agent Center](https://www.pharos.xyz/agent-center) documents the
  hosted MCP endpoint and the SkillEngine install command used here.

## 5. Design decisions forced by the findings

1. **Testnet via self-hosted official server.** The assignment's example request targets
   the testnet, but the hosted MCP is pinned to mainnet. The MCP docs' official
   self-hosting path (same repo, env-configured RPC/chain-id) is used, wrapped by
   `scripts/chain-mcp.mjs`. The hosted endpoint remains available as the
   `hosted-mainnet` profile — and the flow hard-fails on any network mismatch.
2. **Skill format exactly as official.** Frontmatter (`name`/`description`/`version`/
   `requires`), Capability Index, reference file with the official 4-part section
   structure, `assets/networks.json` in the official schema.
3. **Two execution paths, one skill.** The SkillEngine path (agent reads the installed
   SKILL.md and executes it) and the headless runner (`src/`) implement the same
   procedure, so demos are reproducible without an interactive agent while remaining a
   faithful execution of the skill. Both produce the same trace format.
4. **MCP client via the official SDK.** `@modelcontextprotocol/sdk`
   `StreamableHTTPClientTransport` — the transport documented for the hosted endpoint —
   rather than hand-rolled JSON-RPC.

## 6. What was intentionally NOT invented

- No SkillEngine APIs beyond the documented SKILL.md format + skills CLI commands.
- No MCP "registration" step beyond the documented `npx skills add` (the platform's
  Agent Center lists no separate web registration requirement for skills; the Arena
  portal itself is login-gated and cannot be automated from a CLI — documented, not faked).
- No Chain MCP config fields beyond the documented env vars.
- No transaction broadcasting anywhere (read-only assignment).

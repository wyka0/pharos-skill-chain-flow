#!/usr/bin/env node
/**
 * CLI for the pharos-chain-decision flow (Task 8: SkillEngine Skill + Pharos Chain MCP).
 *
 * One user request -> one end-to-end flow:
 *   load skill config (rule + network) -> Chain MCP (tools/list, get_chain_info,
 *   get_balance) -> validate -> apply rule -> decision + explanation + trace.
 *
 * Read-only. No private keys are used, requested, or accepted.
 */
import {
  findNetwork,
  loadNetworks,
  loadProfiles,
  loadRule,
  resolveProfile,
  resolveWallet,
} from "./config.js";
import { FlowError, FlowRunError } from "./errors.js";
import { runDecisionFlow } from "./flow.js";
import { writeTraceFile, type Trace } from "./trace.js";

const SKILL_NAME = "pharos-chain-decision";
const SKILL_VERSION = "0.1.0";
const DEFAULT_REQUEST =
  "Check this Pharos testnet wallet's current native balance and determine whether it meets my configured minimum.";

interface CliArgs {
  wallet?: string;
  address?: string;
  rule?: string;
  profile?: string;
  out?: string;
  request?: string;
  noSave: boolean;
}

function usage(): string {
  return `Usage: npm run flow -- [options]

Options:
  --wallet <name>     Demo wallet by name from config/wallets.json (funded | empty | mainnet-sample)
  --address <0x...>   Any EVM address to evaluate (overrides --wallet)
  --rule <path>       Decision rule JSON (default: config/rule.json)
  --profile <name>    Chain MCP profile (default: profiles.json defaultProfile)
  --out <dir>         Trace output directory (default: demo/traces)
  --request <text>    User request text recorded in the trace
  --no-save           Do not write the trace file
  -h, --help          Show this help`;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { noSave: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string;
    const next = (): string => {
      const value = argv[i + 1];
      if (value === undefined) {
        throw new FlowError("CONFIG_INVALID", `missing value for ${arg}`);
      }
      i++;
      return value;
    };
    switch (arg) {
      case "--wallet":
        args.wallet = next();
        break;
      case "--address":
        args.address = next();
        break;
      case "--rule":
        args.rule = next();
        break;
      case "--profile":
        args.profile = next();
        break;
      case "--out":
        args.out = next();
        break;
      case "--request":
        args.request = next();
        break;
      case "--no-save":
        args.noSave = true;
        break;
      case "-h":
      case "--help":
        console.log(usage());
        process.exit(0);
        break;
      default:
        throw new FlowError("CONFIG_INVALID", `unknown argument "${arg}"\n\n${usage()}`);
    }
  }
  if (!args.wallet && !args.address) {
    throw new FlowError("CONFIG_INVALID", `either --wallet or --address is required\n\n${usage()}`);
  }
  return args;
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));

  const rulePath = args.rule ?? "config/rule.json";
  const outDir = args.out ?? process.env.TRACE_OUT_DIR ?? "demo/traces";

  const profileName = args.profile ?? process.env.PHAROS_MCP_PROFILE;
  const profiles = await loadProfiles("config/profiles.json");
  const [resolvedProfileName, profile] = resolveProfile(profiles, profileName);
  const mcpUrl = process.env.PHAROS_MCP_URL ?? profile.chainMcpUrl;

  const networks = await loadNetworks("skills/pharos-chain-decision/assets/networks.json");
  const rule = await loadRule(rulePath);
  const network = findNetwork(networks, rule.network);

  if (profile.network !== rule.network) {
    throw new FlowError(
      "CONFIG_PROFILE_MISMATCH",
      `profile "${resolvedProfileName}" serves network "${profile.network}" ` +
        `but the rule targets "${rule.network}". Align the rule and the profile, or pick the other profile.`,
    );
  }

  let address = args.address;
  let walletLabel = "user-provided address";
  if (args.wallet) {
    const entry = await resolveWallet("config/wallets.json", args.wallet);
    address = entry.address;
    walletLabel = entry.label ?? args.wallet;
  }

  const request = args.request ?? DEFAULT_REQUEST;

  console.log("Pharos Chain Decision - SkillEngine Skill + Chain MCP flow");
  console.log(`Request   : ${request}`);
  console.log(`Skill     : ${SKILL_NAME}@${SKILL_VERSION} (skills/pharos-chain-decision)`);
  console.log(`Profile   : ${resolvedProfileName} -> ${mcpUrl}${process.env.PHAROS_MCP_URL ? " (env override)" : ""}`);
  console.log(`Network   : ${network.name} (chain ${network.chainId}, native ${network.nativeToken})`);
  console.log(`Wallet    : ${address} [${walletLabel}]`);
  console.log(
    `Rule      : balance ${rule.comparison} ${rule.minimumNativeBalance} ${network.nativeToken}` +
      `${rule.description ? ` - ${rule.description}` : ""}`,
  );
  console.log("");

  let trace;
  try {
    const output = await runDecisionFlow(
      {
        request,
        address: address as string,
        rule,
        network,
        mcpUrl,
        profileName: resolvedProfileName,
        skill: { name: SKILL_NAME, version: SKILL_VERSION, path: "skills/pharos-chain-decision" },
        rulePath,
        networksPath: "skills/pharos-chain-decision/assets/networks.json",
        onStep: (step) => {
          const label = step.status === "ok" ? "ok" : `ERROR: ${step.error?.message ?? ""}`;
          console.log(`[${step.index}/${6}] ${step.name.padEnd(28)} ${label} (${step.durationMs}ms)`);
        },
      },
    );
    trace = output.trace;

    console.log("");
    console.log("==============================================");
    console.log(`Decision     : ${output.result.decision}`);
    console.log(
      `Live balance : ${output.result.balanceDecimal} ${output.result.symbol} ` +
        `(${output.result.balanceWei} wei)`,
    );
    console.log(
      `Minimum      : ${output.result.comparison} ${output.result.minimumNativeBalance} ` +
        `${output.result.symbol} (${output.result.minimumWei} wei)`,
    );
    console.log(
      `Network      : ${output.result.network} (chain ${output.result.chainId}) at block ${output.result.block}`,
    );
    console.log(`MCP endpoint : ${output.result.mcpUrl}`);
    console.log(`Explanation  : ${output.result.explanation}`);

    if (!args.noSave) {
      const tracePath = await writeTraceFile(outDir, trace);
      console.log(`Trace        : ${tracePath}`);
    }
    console.log("==============================================");
    return 0;
  } catch (error) {
    if (error instanceof FlowRunError) {
      const traceData = error.trace as Trace;
      console.error("");
      console.error("FLOW ERROR:", error.message);
      const failedStep =
        (traceData as { steps?: Array<{ name?: string; error?: { message?: string } }> })
          ?.steps?.slice(-1)[0];
      if (failedStep) {
        console.error(
          `Failed at step "${failedStep.name ?? "?"}": ${failedStep.error?.message ?? error.message}`,
        );
      }
      if (!args.noSave) {
        try {
          const tracePath = await writeTraceFile(outDir, traceData);
          console.error(`Trace (with error) saved to: ${tracePath}`);
        } catch (writeError) {
          console.error("could not save trace:", writeError);
        }
      }
      return 1;
    }
    throw error;
  }
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });

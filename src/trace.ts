import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface TraceStep {
  index: number;
  name: string;
  status: "ok" | "error";
  startedAt: string;
  durationMs: number;
  detail?: unknown;
  error?: { code?: string; message: string };
}

export interface Trace {
  schemaVersion: "pharos-skill-chain-flow.trace/1";
  traceId: string;
  createdAt: string;
  request: string;
  skill: { name: string; version: string; path?: string };
  config: Record<string, unknown>;
  steps: TraceStep[];
  result?: unknown;
  runtime: { node: string; platform: string; runner: string };
}

export interface NewTraceOptions {
  request: string;
  skill: { name: string; version: string; path?: string };
  config: Record<string, unknown>;
}

export function newTrace(options: NewTraceOptions): Trace {
  return {
    schemaVersion: "pharos-skill-chain-flow.trace/1",
    traceId: `phcd-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`,
    createdAt: new Date().toISOString(),
    request: options.request,
    skill: options.skill,
    config: options.config,
    steps: [],
    runtime: {
      node: process.version,
      platform: process.platform,
      runner: "src/flow.ts (deterministic executor of skills/pharos-chain-decision/SKILL.md)",
    },
  };
}

/** Run one traced step: times it, records detail or the error. */
export async function addStep(
  trace: Trace,
  name: string,
  fn: () => Promise<unknown> | unknown,
): Promise<void> {
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  const index = trace.steps.length + 1;
  try {
    const detail = await fn();
    trace.steps.push({
      index,
      name,
      status: "ok",
      startedAt,
      durationMs: Date.now() - t0,
      detail: detail ?? undefined,
    });
  } catch (error) {
    trace.steps.push({
      index,
      name,
      status: "error",
      startedAt,
      durationMs: Date.now() - t0,
      error: {
        code: (error as { code?: string }).code,
        message: error instanceof Error ? error.message : String(error),
      },
    });
    throw error;
  }
}

export function finishTrace(trace: Trace, result: unknown): void {
  trace.result = result;
}

/** Write the trace JSON under outDir; returns the file path. */
export async function writeTraceFile(outDir: string, trace: Trace): Promise<string> {
  await mkdir(outDir, { recursive: true });
  const filePath = join(outDir, `trace-${trace.traceId}.json`);
  await writeFile(filePath, JSON.stringify(trace, null, 2) + "\n", "utf8");
  return filePath;
}

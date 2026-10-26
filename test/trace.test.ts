import { describe, expect, it } from "vitest";
import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addStep, finishTrace, newTrace, writeTraceFile } from "../src/trace.js";

describe("trace", () => {
  it("records ok and error steps with timings", async () => {
    const trace = newTrace({
      request: "test request",
      skill: { name: "pharos-chain-decision", version: "0.1.0" },
      config: { mcpUrl: "fixture://chain-mcp" },
    });
    await addStep(trace, "step-ok", () => ({ hello: "world" }));
    await expect(addStep(trace, "step-bad", () => { throw new Error("boom"); })).rejects.toThrow("boom");

    expect(trace.steps).toHaveLength(2);
    const [okStep, badStep] = trace.steps;
    expect(okStep?.status).toBe("ok");
    expect(okStep?.detail).toEqual({ hello: "world" });
    expect(badStep?.status).toBe("error");
    expect(badStep?.error?.message).toBe("boom");
    expect(okStep?.index).toBe(1);
    expect(badStep?.index).toBe(2);
    for (const step of trace.steps) {
      expect(typeof step.durationMs).toBe("number");
      expect(step.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
  });

  it("writes a JSON trace file and round-trips it", async () => {
    const trace = newTrace({
      request: "round trip",
      skill: { name: "pharos-chain-decision", version: "0.1.0" },
      config: { mcpUrl: "fixture://chain-mcp" },
    });
    await addStep(trace, "only-step", () => ({ answer: 42 }));
    finishTrace(trace, { status: "ok", decision: "MEETS_MINIMUM" });

    const dir = join(tmpdir(), `phcd-trace-${Date.now()}`);
    const path = await writeTraceFile(dir, trace);
    const parsed = JSON.parse(await readFile(path, "utf8"));
    expect(parsed.schemaVersion).toBe("pharos-skill-chain-flow.trace/1");
    expect(parsed.request).toBe("round trip");
    expect(parsed.steps).toHaveLength(1);
    expect(parsed.result.decision).toBe("MEETS_MINIMUM");
    expect(parsed.runtime.node).toMatch(/^v\d+/);
    await rm(dir, { recursive: true, force: true });
  });
});

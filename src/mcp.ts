import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { McpConnectionError, McpToolError } from "./errors.js";
import type { ChainMcpAdapter, ToolSummary } from "./types.js";

const CLIENT_NAME = "pharos-chain-decision-flow";
const CLIENT_VERSION = "0.1.0";

/**
 * Connect to a Pharos Chain MCP endpoint (Streamable HTTP) using the official
 * MCP TypeScript SDK. Returns an adapter the flow can call tools through.
 */
export async function connectChainMcp(url: string): Promise<ChainMcpAdapter> {
  const client = new Client({ name: CLIENT_NAME, version: CLIENT_VERSION });
  let transport: StreamableHTTPClientTransport;
  try {
    transport = new StreamableHTTPClientTransport(new URL(url));
    await client.connect(transport);
  } catch (error) {
    try {
      await client.close();
    } catch {
      // ignore close failures on a failed connect
    }
    throw new McpConnectionError(url, error);
  }

  const sessionId = (transport as unknown as { sessionId?: string }).sessionId;

  return {
    endpoint: url,
    async listTools(): Promise<{ tools: ToolSummary[]; sessionId?: string }> {
      const res = await client.listTools();
      const tools: ToolSummary[] = (res.tools ?? []).map((t) => ({
        name: t.name,
        description: t.description,
      }));
      return { tools, sessionId };
    },
    async callTool(
      name: string,
      args: Record<string, unknown>,
    ): Promise<{ raw: string; isError: boolean }> {
      const res = await client.callTool({ name, arguments: args });
      const content = Array.isArray(res.content) ? res.content : [];
      const raw = content
        .map((part) => (part && part.type === "text" ? part.text : ""))
        .filter(Boolean)
        .join("\n");
      const isError = res.isError === true;
      if (isError) {
        throw new McpToolError(name, raw || "unknown error (empty error content)");
      }
      return { raw, isError };
    },
    async close(): Promise<void> {
      await client.close();
    },
  };
}

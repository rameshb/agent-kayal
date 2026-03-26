/**
 * Example custom tools for the agent.
 *
 * Pi's built-in tools (read, write, edit, bash) cover file ops and shell.
 * Add domain-specific tools here for your enterprise use case.
 *
 * Each tool follows the AgentTool interface from pi-agent-core.
 * These get injected alongside Pi's built-ins via customTools.
 */

import { Type } from "@mariozechner/pi-ai";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";

// ─── Example: HTTP Request tool ───

const httpRequestParams = Type.Object({
  url: Type.String({ description: "URL to fetch" }),
  method: Type.Optional(
    Type.String({
      description: "HTTP method (GET, POST, PUT, DELETE)",
      default: "GET",
    })
  ),
  headers: Type.Optional(
    Type.Record(Type.String(), Type.String(), {
      description: "Request headers as key-value pairs",
    })
  ),
  body: Type.Optional(
    Type.String({ description: "Request body (for POST/PUT)" })
  ),
});

export const httpRequestTool: ToolDefinition<typeof httpRequestParams> = {
  name: "http_request",
  label: "HTTP Request",
  description:
    "Make an HTTP request to an external API. Use for fetching data, calling REST endpoints, or webhook triggers.",
  parameters: httpRequestParams,
  execute: async (_toolCallId, params, signal, onUpdate, _ctx) => {
    onUpdate?.({
      content: [
        { type: "text", text: `Fetching ${params.method || "GET"} ${params.url}...` },
      ],
      details: {},
    });

    try {
      const resp = await fetch(params.url, {
        method: params.method || "GET",
        headers: params.headers,
        body: params.body,
        signal,
      });

      const contentType = resp.headers.get("content-type") || "";
      const body = contentType.includes("json")
        ? JSON.stringify(await resp.json(), null, 2)
        : await resp.text();

      return {
        content: [
          {
            type: "text",
            text: `Status: ${resp.status} ${resp.statusText}\n\n${body.slice(0, 8000)}`,
          },
        ],
        details: { status: resp.status },
      };
    } catch (err: any) {
      return {
        content: [{ type: "text", text: `Request failed: ${err.message}` }],
        details: { error: err.message },
      };
    }
  },
};

// ─── Example: Current Time tool ───

const currentTimeParams = Type.Object({
  timezone: Type.Optional(
    Type.String({
      description: "IANA timezone (e.g. America/New_York)",
      default: "UTC",
    })
  ),
});

export const currentTimeTool: ToolDefinition<typeof currentTimeParams> = {
  name: "current_time",
  label: "Current Time",
  description: "Get the current date and time in a specified timezone.",
  parameters: currentTimeParams,
  execute: async (_toolCallId, params, _signal, _onUpdate, _ctx) => {
    const tz = params.timezone || "UTC";
    const now = new Date().toLocaleString("en-US", { timeZone: tz });
    return {
      content: [{ type: "text", text: `Current time (${tz}): ${now}` }],
      details: { timezone: tz, time: now },
    };
  },
};

// ─── Collect all custom tools ───

export function getCustomTools(): ToolDefinition<any, any, any>[] {
  return [httpRequestTool, currentTimeTool];
}

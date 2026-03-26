import {
  createAgentSession,
  DefaultResourceLoader,
  SessionManager,
  SettingsManager,
} from "@mariozechner/pi-coding-agent";
import { getModel } from "@mariozechner/pi-ai";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import type { AppConfig } from "./config.js";
import type { SessionRef } from "./session-store.js";
import type { Logger } from "./logger.js";

// ─── Types ───

export interface AgentRunParams {
  sessionRef: SessionRef;
  prompt: string;
  /** Optional: override provider/model for this run */
  provider?: string;
  model?: string;
  /** Callback for streamed text chunks */
  onTextDelta?: (delta: string) => void;
  /** Callback when a complete text block is ready */
  onBlockReady?: (text: string, mediaUrls?: string[]) => Promise<void>;
  /** Abort signal for cancellation */
  signal?: AbortSignal;
}

export interface AgentRunResult {
  success: boolean;
  fullText: string;
  toolCallCount: number;
  tokensUsed?: number;
  error?: string;
}

// ─── Active run tracking ───

const activeRuns = new Map<string, AbortController>();

export function abortRun(sessionId: string): boolean {
  const controller = activeRuns.get(sessionId);
  if (controller) {
    controller.abort();
    activeRuns.delete(sessionId);
    return true;
  }
  return false;
}

// ─── Agent Runner ───

export class AgentRunner {
  private config: AppConfig;
  private log: Logger;
  private customTools: ToolDefinition<any, any, any>[];
  private sandboxDir: string | undefined;

  constructor(opts: {
    config: AppConfig;
    logger: Logger;
    customTools?: ToolDefinition<any, any, any>[];
    sandboxDir?: string;
  }) {
    this.config = opts.config;
    this.log = opts.logger.child({ module: "agent-runner" });
    this.customTools = opts.customTools || [];
    this.sandboxDir = opts.sandboxDir;
  }

  async run(params: AgentRunParams): Promise<AgentRunResult> {
    const {
      sessionRef,
      prompt,
      onTextDelta,
      onBlockReady,
    } = params;

    const provider = params.provider || this.config.llm.provider;
    const model = params.model || this.config.llm.model;
    const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Abort controller for this run
    const abortController = new AbortController();
    const signal = params.signal
      ? combineSignals(params.signal, abortController.signal)
      : abortController.signal;
    activeRuns.set(sessionRef.sessionId, abortController);

    this.log.info(
      { sessionId: sessionRef.sessionId, provider, model, runId },
      "starting agent run"
    );

    let fullText = "";
    let toolCallCount = 0;

    try {
      // ── Set up Pi SDK components ──

      // The agent's working directory is restricted to the sandbox
      const agentCwd = this.sandboxDir || sessionRef.workspaceDir;

      const settingsManager = SettingsManager.create(agentCwd);

      const resourceLoader = new DefaultResourceLoader({
        cwd: agentCwd,
        agentDir: sessionRef.agentDir,
        settingsManager,
        additionalExtensionPaths: [],
      });

      await resourceLoader.reload();

      const resolvedModel = (getModel as any)(provider, model);

      const { session } = await createAgentSession({
        cwd: agentCwd,
        agentDir: sessionRef.agentDir,
        settingsManager,
        resourceLoader,
        model: resolvedModel,
        // Pass custom tools alongside Pi's built-in tools
        customTools: this.customTools,
      });

      // ── Run the agent loop ──

      // Subscribe to session events
      session.subscribe((event: any) => {
        switch (event.type) {
          case "text_delta":
            fullText += event.delta;
            onTextDelta?.(event.delta);
            break;

          case "text_done":
            // A complete text block is ready
            if (onBlockReady) {
              onBlockReady(fullText);
            }
            break;

          case "tool_start":
            toolCallCount++;
            this.log.debug(
              { tool: event.toolName, runId },
              "tool execution started"
            );
            break;

          case "tool_done":
            this.log.debug(
              { tool: event.toolName, runId },
              "tool execution completed"
            );
            break;

          case "error":
            this.log.error({ error: event.error, runId }, "agent error");
            break;
        }
      });

      await session.prompt(prompt);

      this.log.info(
        { sessionId: sessionRef.sessionId, toolCallCount, runId },
        "agent run completed"
      );

      return { success: true, fullText, toolCallCount };
    } catch (err: any) {
      if (err.name === "AbortError") {
        this.log.info({ runId }, "agent run aborted");
        return {
          success: false,
          fullText,
          toolCallCount,
          error: "Run was cancelled",
        };
      }

      this.log.error({ error: err.message, runId }, "agent run failed");
      return {
        success: false,
        fullText,
        toolCallCount,
        error: err.message,
      };
    } finally {
      activeRuns.delete(sessionRef.sessionId);
    }
  }
}

// ─── Utilities ───

function combineSignals(...signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      return controller.signal;
    }
    signal.addEventListener("abort", () => controller.abort(signal.reason), {
      once: true,
    });
  }
  return controller.signal;
}

import { resolve, join } from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import type { Logger } from "./logger.js";

/**
 * Lightweight session store that maps Teams user/conversation IDs
 * to Pi session files on disk. Pi's SessionManager handles the actual
 * JSONL persistence — we just manage the paths and lifecycle.
 */

export interface SessionRef {
  sessionId: string;
  sessionKey: string;
  sessionFile: string;
  workspaceDir: string;
  agentDir: string;
}

export interface SessionStoreOptions {
  sessionDir: string;
  workspaceDir: string;
  logger: Logger;
}

export class SessionStore {
  private sessionDir: string;
  private workspaceDir: string;
  private log: Logger;

  constructor(opts: SessionStoreOptions) {
    this.sessionDir = resolve(opts.sessionDir);
    this.workspaceDir = resolve(opts.workspaceDir);
    this.log = opts.logger.child({ module: "session-store" });
    mkdirSync(this.sessionDir, { recursive: true });
  }

  /**
   * Derive a stable session ID from Teams context.
   * Format: teams:<conversationType>:<conversationId>:<userId>
   *
   * - DM:      teams:personal:<conversationId>:<aadObjectId>
   * - Channel: teams:channel:<channelId>:<aadObjectId>
   * - Group:   teams:group:<conversationId>:<aadObjectId>
   */
  buildSessionId(context: {
    conversationType: string;
    conversationId: string;
    userId: string;
    channelId?: string;
  }): string {
    const { conversationType, conversationId, userId, channelId } = context;
    const scope =
      conversationType === "channel" && channelId
        ? channelId
        : conversationId;
    // Sanitize for filesystem safety
    const safeScope = scope.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80);
    const safeUser = userId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60);
    return `teams-${conversationType}-${safeScope}-${safeUser}`;
  }

  /**
   * Resolve or create a session reference for the given session ID.
   */
  resolve(sessionId: string): SessionRef {
    const agentDir = join(this.sessionDir, sessionId);
    if (!existsSync(agentDir)) {
      mkdirSync(agentDir, { recursive: true });
      this.log.info({ sessionId }, "created new session directory");
    }

    const sessionFile = join(agentDir, "session.jsonl");
    return {
      sessionId,
      sessionKey: `main:teams:${sessionId}`,
      sessionFile,
      workspaceDir: this.workspaceDir,
      agentDir,
    };
  }

  /**
   * Check if a session already exists on disk.
   */
  exists(sessionId: string): boolean {
    return existsSync(join(this.sessionDir, sessionId, "session.jsonl"));
  }
}

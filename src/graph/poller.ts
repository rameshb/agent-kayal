import { Client } from "@microsoft/microsoft-graph-client";
import { EventEmitter } from "node:events";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { GraphAuth } from "./auth.js";
import type {
  GraphMessage,
  GraphTeam,
  GraphChannel,
  WatchedChannel,
  GraphDeltaResponse,
} from "./types.js";
import type { Logger } from "../logger.js";

// ─── Types ───

export interface InboundMessage {
  messageId: string;
  teamId: string;
  teamName: string;
  channelId: string;
  channelName: string;
  userId: string;
  userName: string;
  text: string;       // Clean text with @mentions stripped
  rawHtml: string;    // Original HTML body
  replyToId?: string; // If this is a reply to another message
  timestamp: string;
}

export interface PollerOptions {
  auth: GraphAuth;
  agentName: string;       // The display name to detect @mentions for
  pollIntervalMs?: number; // Default: 2000 (2s)
  stateDir: string;        // Where to persist delta links
  logger: Logger;
}

// ─── Graph Client Factory ───

function createGraphClient(auth: GraphAuth): Client {
  return Client.initWithMiddleware({
    authProvider: {
      getAccessToken: () => auth.getAccessToken(),
    },
  });
}

// ─── Poller ───

export class GraphPoller extends EventEmitter {
  private auth: GraphAuth;
  private client: Client;
  private agentName: string;
  private pollIntervalMs: number;
  private stateDir: string;
  private log: Logger;

  private watchedChannels: WatchedChannel[] = [];
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private seenMessages = new Set<string>();

  constructor(opts: PollerOptions) {
    super();
    this.auth = opts.auth;
    this.client = createGraphClient(opts.auth);
    this.agentName = opts.agentName;
    this.pollIntervalMs = opts.pollIntervalMs ?? 2000;
    this.stateDir = opts.stateDir;
    this.log = opts.logger.child({ module: "graph-poller" });

    if (!existsSync(this.stateDir)) mkdirSync(this.stateDir, { recursive: true });
  }

  // ─── Discovery ───

  /**
   * Discover all teams the signed-in user is a member of,
   * then all channels in those teams. Returns the full list.
   */
  async discoverChannels(): Promise<WatchedChannel[]> {
    this.log.info("discovering teams and channels");

    const teamsResp = await this.client.api("/me/joinedTeams").get();
    const teams: GraphTeam[] = teamsResp.value || [];
    this.log.info({ count: teams.length }, "found teams");

    const channels: WatchedChannel[] = [];

    for (const team of teams) {
      try {
        const channelsResp = await this.client
          .api(`/teams/${team.id}/channels`)
          .get();
        const teamChannels: GraphChannel[] = channelsResp.value || [];

        for (const ch of teamChannels) {
          channels.push({
            teamId: team.id,
            teamName: team.displayName || team.id,
            channelId: ch.id,
            channelName: ch.displayName || ch.id,
            deltaLink: this.loadDeltaLink(team.id, ch.id),
          });
        }

        this.log.debug(
          { team: team.displayName, channels: teamChannels.length },
          "discovered channels"
        );
      } catch (err: any) {
        this.log.warn(
          { team: team.displayName, error: err.message },
          "failed to list channels"
        );
      }
    }

    this.watchedChannels = channels;
    this.log.info(
      { totalChannels: channels.length },
      "channel discovery complete"
    );
    return channels;
  }

  /**
   * Watch specific channels only (by team/channel ID pairs).
   */
  setWatchedChannels(channels: WatchedChannel[]) {
    this.watchedChannels = channels.map((ch) => ({
      ...ch,
      deltaLink: ch.deltaLink || this.loadDeltaLink(ch.teamId, ch.channelId),
    }));
  }

  getWatchedChannels(): WatchedChannel[] {
    return [...this.watchedChannels];
  }

  // ─── Polling ───

  async start(): Promise<void> {
    if (this.running) return;

    if (this.watchedChannels.length === 0) {
      await this.discoverChannels();
    }

    // Do an initial poll to establish delta links (skip old messages)
    for (const ch of this.watchedChannels) {
      if (!ch.deltaLink) {
        await this.initializeDelta(ch);
      }
    }

    this.running = true;
    this.log.info(
      { interval: this.pollIntervalMs, channels: this.watchedChannels.length },
      "poller started"
    );
    this.emit("started");

    // Start polling loop
    this.pollTimer = setInterval(() => this.pollAll(), this.pollIntervalMs);
  }

  async stop(): Promise<void> {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.running = false;
    this.log.info("poller stopped");
    this.emit("stopped");
  }

  isRunning(): boolean {
    return this.running;
  }

  // ─── Internal ───

  /**
   * Initialize delta link for a channel by doing a first delta query.
   * We skip all existing messages (only care about new ones going forward).
   */
  private async initializeDelta(ch: WatchedChannel): Promise<void> {
    try {
      let url = `/teams/${ch.teamId}/channels/${ch.channelId}/messages/delta`;
      let deltaLink: string | undefined;

      // Page through all existing messages to get to the delta link
      while (url) {
        const resp: GraphDeltaResponse = await this.client.api(url).get();
        deltaLink = resp["@odata.deltaLink"];
        url = resp["@odata.nextLink"] || "";
      }

      if (deltaLink) {
        ch.deltaLink = deltaLink;
        this.saveDeltaLink(ch.teamId, ch.channelId, deltaLink);
        this.log.debug(
          { team: ch.teamName, channel: ch.channelName },
          "delta link initialized"
        );
      }
    } catch (err: any) {
      this.log.warn(
        { team: ch.teamName, channel: ch.channelName, error: err.message },
        "failed to initialize delta"
      );
    }
  }

  /**
   * Poll all watched channels for new messages.
   */
  private async pollAll(): Promise<void> {
    for (const ch of this.watchedChannels) {
      try {
        await this.pollChannel(ch);
      } catch (err: any) {
        this.log.warn(
          { channel: ch.channelName, error: err.message },
          "poll error"
        );
      }
    }
  }

  /**
   * Poll a single channel using its delta link.
   */
  private async pollChannel(ch: WatchedChannel): Promise<void> {
    if (!ch.deltaLink) {
      await this.initializeDelta(ch);
      return;
    }

    let url: string | undefined = ch.deltaLink;

    while (url) {
      const resp: GraphDeltaResponse = await this.client.api(url).get();

      // Process new messages
      for (const msg of resp.value || []) {
        await this.processMessage(msg, ch);
      }

      // Update delta link
      if (resp["@odata.deltaLink"]) {
        ch.deltaLink = resp["@odata.deltaLink"];
        this.saveDeltaLink(ch.teamId, ch.channelId, ch.deltaLink);
      }

      url = resp["@odata.nextLink"];
    }
  }

  /**
   * Process a single message — check if it's actionable and emit event.
   */
  private async processMessage(
    msg: GraphMessage,
    ch: WatchedChannel
  ): Promise<void> {
    // Skip non-user messages
    if (msg.messageType !== "message") return;

    // Skip messages from applications (including our own replies)
    if (msg.from?.application) return;

    // Skip already-seen messages (dedup across polls)
    if (this.seenMessages.has(msg.id)) return;
    this.seenMessages.add(msg.id);

    // Prevent unbounded set growth
    if (this.seenMessages.size > 10_000) {
      const arr = [...this.seenMessages];
      this.seenMessages = new Set(arr.slice(-5_000));
    }

    // Check for @mention of our agent
    const isMentioned = this.isAgentMentioned(msg);
    if (!isMentioned) return;

    // Extract clean text
    const text = this.extractText(msg);
    if (!text) return;

    const inbound: InboundMessage = {
      messageId: msg.id,
      teamId: ch.teamId,
      teamName: ch.teamName,
      channelId: ch.channelId,
      channelName: ch.channelName,
      userId: msg.from?.user?.id || "unknown",
      userName: msg.from?.user?.displayName || "Unknown",
      text,
      rawHtml: msg.body.content,
      replyToId: msg.replyToId,
      timestamp: msg.createdDateTime,
    };

    this.log.info(
      {
        user: inbound.userName,
        channel: ch.channelName,
        textLength: text.length,
      },
      "actionable message detected"
    );

    this.emit("message", inbound);
  }

  /**
   * Check if the agent was @mentioned in the message.
   */
  private isAgentMentioned(msg: GraphMessage): boolean {
    if (!msg.mentions || msg.mentions.length === 0) return false;

    return msg.mentions.some(
      (m) =>
        m.mentioned.application?.displayName?.toLowerCase() ===
          this.agentName.toLowerCase() ||
        m.mentionText?.toLowerCase().includes(this.agentName.toLowerCase())
    );
  }

  /**
   * Extract plain text from message, stripping @mentions and HTML.
   */
  private extractText(msg: GraphMessage): string {
    let content = msg.body.content || "";

    if (msg.body.contentType === "html") {
      // Strip <at> mention tags
      content = content.replace(/<at[^>]*>.*?<\/at>/gi, "");
      // Strip remaining HTML tags
      content = content.replace(/<[^>]+>/g, "");
      // Decode HTML entities
      content = content
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, " ");
    }

    return content.trim();
  }

  // ─── Delta Link Persistence ───

  private deltaLinkKey(teamId: string, channelId: string): string {
    const safeTeam = teamId.replace(/[^a-zA-Z0-9-]/g, "_");
    const safeCh = channelId.replace(/[^a-zA-Z0-9-]/g, "_");
    return `${safeTeam}_${safeCh}`;
  }

  private loadDeltaLink(
    teamId: string,
    channelId: string
  ): string | undefined {
    const file = join(this.stateDir, `${this.deltaLinkKey(teamId, channelId)}.delta`);
    try {
      if (existsSync(file)) return readFileSync(file, "utf-8").trim();
    } catch {
      // ignore
    }
    return undefined;
  }

  private saveDeltaLink(
    teamId: string,
    channelId: string,
    link: string
  ): void {
    const file = join(this.stateDir, `${this.deltaLinkKey(teamId, channelId)}.delta`);
    try {
      writeFileSync(file, link);
    } catch {
      // non-fatal
    }
  }
}

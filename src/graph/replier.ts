import { Client } from "@microsoft/microsoft-graph-client";
import type { GraphAuth } from "./auth.js";
import type { InboundMessage } from "./poller.js";
import type { Logger } from "../logger.js";

// ─── Replier ───

export class GraphReplier {
  private client: Client;
  private log: Logger;

  constructor(opts: { auth: GraphAuth; logger: Logger }) {
    this.log = opts.logger.child({ module: "graph-replier" });
    this.client = Client.initWithMiddleware({
      authProvider: {
        getAccessToken: () => opts.auth.getAccessToken(),
      },
    });
  }

  /**
   * Reply to a message in a Teams channel.
   * Posts as a reply in the same thread (reply to the root message).
   */
  async replyToChannel(
    inbound: InboundMessage,
    responseText: string
  ): Promise<void> {
    // Reply chain: if the inbound message is already a reply, reply to its root.
    // Otherwise, reply to the inbound message itself.
    const replyToId = inbound.replyToId || inbound.messageId;

    const body = {
      body: {
        contentType: "html",
        content: this.markdownToHtml(responseText),
      },
    };

    try {
      await this.client
        .api(
          `/teams/${inbound.teamId}/channels/${inbound.channelId}/messages/${replyToId}/replies`
        )
        .post(body);

      this.log.info(
        {
          channel: inbound.channelName,
          replyTo: replyToId,
          responseLength: responseText.length,
        },
        "reply sent"
      );
    } catch (err: any) {
      this.log.error(
        { error: err.message, channel: inbound.channelName },
        "failed to send reply"
      );
      throw err;
    }
  }

  /**
   * Send a new top-level message to a channel (for proactive messages).
   */
  async sendToChannel(
    teamId: string,
    channelId: string,
    text: string
  ): Promise<void> {
    const body = {
      body: {
        contentType: "html",
        content: this.markdownToHtml(text),
      },
    };

    await this.client
      .api(`/teams/${teamId}/channels/${channelId}/messages`)
      .post(body);
  }

  /**
   * Convert basic markdown to Teams-compatible HTML.
   * Teams supports a subset of HTML in messages.
   */
  private markdownToHtml(md: string): string {
    let html = md
      // Escape HTML entities first
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      // Code blocks (must be before inline code)
      .replace(/```(\w*)\n([\s\S]*?)```/g, (_m, _lang, code) => {
        return `<pre>${code.trim()}</pre>`;
      })
      // Inline code
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      // Bold
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      // Italic
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      // Headings (h3, h2, h1 — check ### before ## before #)
      .replace(/^### (.+)$/gm, "<h3>$1</h3>")
      .replace(/^## (.+)$/gm, "<h2>$1</h2>")
      .replace(/^# (.+)$/gm, "<h1>$1</h1>")
      // Unordered list items
      .replace(/^- (.+)$/gm, "<li>$1</li>")
      // Wrap consecutive <li> in <ul>
      .replace(/((?:<li>.*<\/li>\n?)+)/g, "<ul>$1</ul>")
      // Paragraphs (double newlines)
      .replace(/\n\n/g, "</p><p>")
      // Single newlines to <br>
      .replace(/\n/g, "<br>");

    // Wrap in paragraph tags
    html = `<p>${html}</p>`;

    // Clean up empty paragraphs
    html = html.replace(/<p>\s*<\/p>/g, "");

    return html;
  }
}

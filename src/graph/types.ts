/**
 * Types for Microsoft Graph Teams API responses.
 * Subset of the full schema — only what we need for polling and replying.
 */

export interface GraphUser {
  id: string;
  displayName: string;
  userIdentityType?: string;
}

export interface GraphMention {
  id: number;
  mentionText: string;
  mentioned: {
    application?: { id: string; displayName: string };
    user?: { id: string; displayName: string };
  };
}

export interface GraphMessage {
  id: string;
  createdDateTime: string;
  lastModifiedDateTime?: string;
  messageType: string; // "message" | "systemEventMessage" | ...
  from?: {
    application?: { id: string; displayName: string };
    user?: GraphUser;
  };
  body: {
    contentType: string; // "text" | "html"
    content: string;
  };
  mentions?: GraphMention[];
  channelIdentity?: {
    teamId: string;
    channelId: string;
  };
  chatId?: string;
  etag?: string;
  replyToId?: string;
}

export interface GraphChannel {
  id: string;
  displayName: string;
  description?: string;
  membershipType?: string;
}

export interface GraphTeam {
  id: string;
  displayName: string;
  description?: string;
}

export interface WatchedChannel {
  teamId: string;
  teamName: string;
  channelId: string;
  channelName: string;
  deltaLink?: string; // Stored delta link for incremental polling
}

export interface GraphDeltaResponse {
  value: GraphMessage[];
  "@odata.nextLink"?: string;
  "@odata.deltaLink"?: string;
}

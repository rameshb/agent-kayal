import {
  PublicClientApplication,
  type DeviceCodeRequest,
  type AuthenticationResult,
  type AccountInfo,
  type ICachePlugin,
  type TokenCacheContext,
} from "@azure/msal-node";
import { EventEmitter } from "node:events";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import type { Logger } from "../logger.js";

// ─── Config ───

const SCOPES = [
  "ChannelMessage.Read.All",
  "ChannelMessage.Send",
  "Team.ReadBasic.All",
  "Channel.ReadBasic.All",
  "User.Read",
];

// ─── Types ───

export interface AuthState {
  authenticated: boolean;
  userName?: string;
  userId?: string;
  expiresAt?: string;
}

// ─── Auth Manager ───

export class GraphAuth extends EventEmitter {
  private pca: PublicClientApplication;
  private account: AccountInfo | null = null;
  private cachePath: string;
  private log: Logger;

  constructor(opts: {
    clientId: string;
    tenantId: string;
    cacheDir: string;
    logger: Logger;
  }) {
    super();
    this.log = opts.logger.child({ module: "graph-auth" });
    this.cachePath = join(opts.cacheDir, "msal-cache.json");

    // Ensure cache directory exists
    const cacheDir = dirname(this.cachePath);
    if (!existsSync(cacheDir)) mkdirSync(cacheDir, { recursive: true });

    // Build cache plugin for token persistence
    const cachePlugin: ICachePlugin = {
      beforeCacheAccess: async (context: TokenCacheContext) => {
        if (existsSync(this.cachePath)) {
          try {
            const cacheData = readFileSync(this.cachePath, "utf-8");
            context.tokenCache.deserialize(cacheData);
          } catch {
            this.log.warn("failed to load token cache, will re-authenticate");
          }
        }
      },
      afterCacheAccess: async (context: TokenCacheContext) => {
        if (context.cacheHasChanged) {
          writeFileSync(this.cachePath, context.tokenCache.serialize());
        }
      },
    };

    this.pca = new PublicClientApplication({
      auth: {
        clientId: opts.clientId,
        authority: `https://login.microsoftonline.com/${opts.tenantId}`,
      },
      cache: { cachePlugin },
    });
  }

  /**
   * Attempt silent token acquisition from cache.
   * Returns true if we already have valid credentials.
   */
  async trysilent(): Promise<boolean> {
    try {
      const accounts = await this.pca.getAllAccounts();

      if (accounts.length === 0) return false;

      this.account = accounts[0];
      const result = await this.pca.acquireTokenSilent({
        account: this.account,
        scopes: SCOPES,
      });

      if (result) {
        this.account = result.account;
        this.persistCache();
        this.log.info(
          { user: this.account?.name },
          "authenticated silently from cache"
        );
        this.emit("authenticated", this.getState());
        return true;
      }
    } catch {
      this.log.debug("silent auth failed, will need device code flow");
    }
    return false;
  }

  /**
   * Start device code flow. Emits "device-code" with the user code and URL
   * that must be displayed to the user in the UI.
   */
  async authenticateWithDeviceCode(): Promise<AuthenticationResult> {
    const request: DeviceCodeRequest = {
      scopes: SCOPES,
      deviceCodeCallback: (response) => {
        this.log.info(
          { userCode: response.userCode },
          "device code flow started"
        );
        this.emit("device-code", {
          userCode: response.userCode,
          verificationUri: response.verificationUri,
          message: response.message,
        });
      },
    };

    const result = await this.pca.acquireTokenByDeviceCode(request);
    if (!result) throw new Error("Device code authentication returned null");

    this.account = result.account;
    this.persistCache();

    this.log.info(
      { user: this.account?.name },
      "device code authentication complete"
    );
    this.emit("authenticated", this.getState());
    return result;
  }

  /**
   * Get a valid access token for Graph API calls.
   * Handles refresh automatically.
   */
  async getAccessToken(): Promise<string> {
    if (!this.account) {
      throw new Error("Not authenticated. Call trysilent() or authenticateWithDeviceCode() first.");
    }

    try {
      const result = await this.pca.acquireTokenSilent({
        account: this.account,
        scopes: SCOPES,
      });
      this.persistCache();
      return result.accessToken;
    } catch (err: any) {
      this.log.error({ error: err.message }, "token refresh failed");
      this.emit("auth-expired");
      throw new Error("Token refresh failed. Please re-authenticate.");
    }
  }

  getState(): AuthState {
    return {
      authenticated: this.account !== null,
      userName: this.account?.name || undefined,
      userId: this.account?.localAccountId || undefined,
      expiresAt: undefined, // MSAL handles expiry internally
    };
  }

  async logout(): Promise<void> {
    if (this.account) {
      await this.pca.signOut({ account: this.account });
    }
    this.account = null;
    try {
      writeFileSync(this.cachePath, "{}");
    } catch {
      // ignore
    }
    this.emit("logged-out");
  }

  private persistCache() {
    try {
      const cache = this.pca.getTokenCache();
      writeFileSync(this.cachePath, cache.serialize());
    } catch {
      // non-fatal
    }
  }
}

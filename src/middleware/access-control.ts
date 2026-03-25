import type { Logger } from "../logger.js";

export interface AccessControlOptions {
  allowedUsers: string[];   // Azure AD Object IDs
  allowedTeams: string[];   // Teams team IDs
  logger: Logger;
}

/**
 * Allowlist-based access control.
 * If allowlists are empty, access is open (suitable for dev).
 * In production, populate ALLOWED_USERS and ALLOWED_TEAMS.
 */
export class AccessControl {
  private allowedUsers: Set<string>;
  private allowedTeams: Set<string>;
  private log: Logger;

  constructor(opts: AccessControlOptions) {
    this.allowedUsers = new Set(opts.allowedUsers);
    this.allowedTeams = new Set(opts.allowedTeams);
    this.log = opts.logger.child({ module: "access-control" });

    if (this.allowedUsers.size === 0) {
      this.log.warn("ALLOWED_USERS is empty — all users can access the bot");
    }
    if (this.allowedTeams.size === 0) {
      this.log.warn("ALLOWED_TEAMS is empty — bot can operate in any team");
    }
  }

  isUserAllowed(aadObjectId: string): boolean {
    // Empty allowlist = open access
    if (this.allowedUsers.size === 0) return true;
    return this.allowedUsers.has(aadObjectId);
  }

  isTeamAllowed(teamId: string): boolean {
    if (this.allowedTeams.size === 0) return true;
    return this.allowedTeams.has(teamId);
  }

  check(context: {
    userId: string;
    teamId?: string;
    conversationType: string;
  }): { allowed: boolean; reason?: string } {
    if (!this.isUserAllowed(context.userId)) {
      this.log.warn({ userId: context.userId }, "user not in allowlist");
      return { allowed: false, reason: "User not authorized" };
    }

    if (
      context.conversationType === "channel" &&
      context.teamId &&
      !this.isTeamAllowed(context.teamId)
    ) {
      this.log.warn({ teamId: context.teamId }, "team not in allowlist");
      return { allowed: false, reason: "Team not authorized" };
    }

    return { allowed: true };
  }
}

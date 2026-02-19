import { API_URL } from "./lib/constants.js";
import {
  clearApiToken,
  getSession,
  isTokenExpired,
  updateApiToken,
  updateTokens,
  type AuthSession,
} from "./auth.js";

const ML_API_URL = process.env.ML_API_URL || API_URL;
const OAUTH_CONFIG_CACHE_MS = 10 * 60 * 1000;
const RELOGIN_ERROR = "Session expired, please re-login with Microsoft.";

let microsoftClientId: string | null = null;
let microsoftClientIdFetchedAt = 0;

interface AuthRefreshLogger {
  info?: (message: string, data?: any) => unknown;
  warn?: (message: string, data?: any) => unknown;
  error?: (message: string, error?: any, data?: any) => unknown;
}

export interface RefreshMicrosoftTokenResult {
  ok: boolean;
  refreshed: boolean;
  session: AuthSession | null;
  newAccessToken?: string;
  newApiToken?: string;
  error?: string;
  requiresRelogin?: boolean;
}

async function readJsonSafe(response: Response): Promise<any> {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function mapRefreshFailureToMessage(tokenData: any): {
  message: string;
  requiresRelogin: boolean;
} {
  const errorCode = String(tokenData?.error || "").toLowerCase();
  const details = String(tokenData?.error_description || "").trim();

  if (
    errorCode === "invalid_grant" ||
    errorCode === "interaction_required" ||
    errorCode === "invalid_request"
  ) {
    return { message: RELOGIN_ERROR, requiresRelogin: true };
  }

  if (details) {
    return { message: details, requiresRelogin: false };
  }

  return { message: "Failed to refresh Microsoft token.", requiresRelogin: false };
}

async function ensureMicrosoftClientId(
  logger?: AuthRefreshLogger,
): Promise<string | null> {
  const now = Date.now();
  if (
    microsoftClientId &&
    now - microsoftClientIdFetchedAt < OAUTH_CONFIG_CACHE_MS
  ) {
    return microsoftClientId;
  }

  try {
    const response = await fetch(`${ML_API_URL}/oauth/config`);
    const data = (await readJsonSafe(response)) as {
      microsoftDeviceClientId?: string;
    };

    if (response.ok && data.microsoftDeviceClientId) {
      microsoftClientId = data.microsoftDeviceClientId;
      microsoftClientIdFetchedAt = now;
      return microsoftClientId;
    }
  } catch (error) {
    logger?.warn?.("Unable to fetch Microsoft OAuth config", error);
  }

  return null;
}

export async function refreshMicrosoftTokenIfNeeded(
  logger?: AuthRefreshLogger,
): Promise<RefreshMicrosoftTokenResult> {
  const session = getSession();
  if (!session) {
    return {
      ok: false,
      refreshed: false,
      session: null,
      error: "Not logged in",
    };
  }

  if (session.type !== "microsoft") {
    return { ok: true, refreshed: false, session };
  }

  if (!isTokenExpired()) {
    return {
      ok: true,
      refreshed: false,
      session,
      newAccessToken: session.accessToken,
      newApiToken: session.apiToken,
    };
  }

  if (!session.refreshToken) {
    return {
      ok: false,
      refreshed: false,
      session,
      error: RELOGIN_ERROR,
      requiresRelogin: true,
    };
  }

  const clientId = await ensureMicrosoftClientId(logger);
  if (!clientId) {
    return {
      ok: false,
      refreshed: false,
      session,
      error: "Microsoft Client ID not configured",
    };
  }

  try {
    const tokenResponse = await fetch(
      "https://login.microsoftonline.com/consumers/oauth2/v2.0/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: clientId,
          refresh_token: session.refreshToken,
          scope: "XboxLive.signin offline_access",
        }),
      },
    );

    const tokenData = await readJsonSafe(tokenResponse);
    if (!tokenResponse.ok || tokenData.error || !tokenData.access_token) {
      const mapped = mapRefreshFailureToMessage(tokenData);
      return {
        ok: false,
        refreshed: false,
        session: getSession(),
        error: mapped.message,
        requiresRelogin: mapped.requiresRelogin,
      };
    }

    const xblResponse = await fetch(
      "https://user.auth.xboxlive.com/user/authenticate",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          Properties: {
            AuthMethod: "RPS",
            SiteName: "user.auth.xboxlive.com",
            RpsTicket: `d=${tokenData.access_token}`,
          },
          RelyingParty: "http://auth.xboxlive.com",
          TokenType: "JWT",
        }),
      },
    );

    const xblData = await readJsonSafe(xblResponse);
    const userHash = xblData.DisplayClaims?.xui?.[0]?.uhs;
    if (!xblData.Token || !userHash) {
      return {
        ok: false,
        refreshed: false,
        session: getSession(),
        error: "Xbox Live authentication failed",
      };
    }

    const xstsResponse = await fetch(
      "https://xsts.auth.xboxlive.com/xsts/authorize",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          Properties: { SandboxId: "RETAIL", UserTokens: [xblData.Token] },
          RelyingParty: "rp://api.minecraftservices.com/",
          TokenType: "JWT",
        }),
      },
    );

    const xstsData = await readJsonSafe(xstsResponse);
    if (!xstsData.Token) {
      return {
        ok: false,
        refreshed: false,
        session: getSession(),
        error: "XSTS failed",
      };
    }

    const mcResponse = await fetch(
      "https://api.minecraftservices.com/authentication/login_with_xbox",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identityToken: `XBL3.0 x=${userHash};${xstsData.Token}`,
        }),
      },
    );

    const mcData = await readJsonSafe(mcResponse);
    if (!mcData.access_token) {
      return {
        ok: false,
        refreshed: false,
        session: getSession(),
        error: "Minecraft auth failed",
      };
    }

    const expiresInSeconds = Number(tokenData.expires_in);
    updateTokens(
      mcData.access_token,
      tokenData.refresh_token || session.refreshToken,
      Number.isFinite(expiresInSeconds) ? expiresInSeconds : undefined,
    );

    let newApiToken = session.apiToken;
    if (session.apiToken) {
      try {
        const accessTokenExpiresAt = Number.isFinite(expiresInSeconds)
          ? new Date(Date.now() + expiresInSeconds * 1000).toISOString()
          : undefined;

        const linkResponse = await fetch(`${ML_API_URL}/auth/microsoft/link`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.apiToken}`,
            "Content-Type": "application/json",
            "X-Client-App": "RealityLauncher",
          },
          body: JSON.stringify({
            accessToken: mcData.access_token,
            uuid: session.uuid,
            username: session.username,
            accessTokenExpiresAt,
          }),
        });

        if (linkResponse.ok) {
          const linkData = await readJsonSafe(linkResponse);
          if (linkData.token) {
            const refreshedApiToken = String(linkData.token);
            newApiToken = refreshedApiToken;
            updateApiToken(refreshedApiToken, linkData.expiresAt);
          }
        } else if (linkResponse.status === 401 || linkResponse.status === 403) {
          // API session was revoked; clear stale token to avoid repeated unauthorized calls.
          clearApiToken();
          newApiToken = undefined;
        } else {
          logger?.warn?.("Failed to refresh CatID API token", {
            status: linkResponse.status,
          });
        }
      } catch (error) {
        logger?.warn?.("CatID token refresh skipped due to network error", error);
      }
    }

    return {
      ok: true,
      refreshed: true,
      session: getSession(),
      newAccessToken: mcData.access_token,
      newApiToken,
    };
  } catch (error: any) {
    logger?.error?.("Microsoft token refresh failed", error);
    return {
      ok: false,
      refreshed: false,
      session: getSession(),
      error: error?.message || "Unknown refresh error",
    };
  }
}

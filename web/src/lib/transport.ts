import { Code, ConnectError, createClient, type Interceptor } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";

import { AuthService } from "@/gen/zerx/v1/auth_pb";
import { clearTokens, getAccessToken, getRefreshToken, setTokens } from "@/lib/auth";

const baseUrl = "/api";

// A transport WITHOUT the auth interceptor, used only to refresh tokens so the
// refresh call itself can never recurse into the refresh logic.
const bareTransport = createConnectTransport({ baseUrl });

// Single-flight refresh: concurrent 401s share one in-flight refresh.
let refreshPromise: Promise<boolean> | null = null;

async function refreshTokens(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    return false;
  }
  try {
    const client = createClient(AuthService, bareTransport);
    const res = await client.refresh({ refreshToken });
    // The server returns only a new access token; keep the existing refresh token.
    setTokens(res.accessToken, refreshToken);
    return true;
  } catch {
    return false;
  }
}

function failAuth(): void {
  clearTokens();
  if (window.location.pathname !== "/login") {
    window.location.href = "/login";
  }
}

const authInterceptor: Interceptor = (next) => async (req) => {
  const applyToken = () => {
    const token = getAccessToken();
    if (token) {
      req.header.set("Authorization", `Bearer ${token}`);
    }
  };

  applyToken();

  // Never run refresh logic for the auth service itself (login/refresh/me):
  // a failed login must surface as-is, not trigger a token refresh.
  const isAuthService = req.service.typeName === AuthService.typeName;

  try {
    return await next(req);
  } catch (err) {
    if (isAuthService || !(err instanceof ConnectError) || err.code !== Code.Unauthenticated) {
      throw err;
    }

    refreshPromise ??= refreshTokens().finally(() => {
      refreshPromise = null;
    });
    const refreshed = await refreshPromise;

    if (refreshed) {
      applyToken();
      try {
        // Retry the original request exactly once.
        return await next(req);
      } catch (retryErr) {
        if (retryErr instanceof ConnectError && retryErr.code === Code.Unauthenticated) {
          failAuth();
        }
        throw retryErr;
      }
    }

    failAuth();
    throw err;
  }
};

export const transport = createConnectTransport({
  baseUrl,
  interceptors: [authInterceptor],
});

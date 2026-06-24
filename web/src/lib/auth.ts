// Token storage and a small auth surface shared with the router context.
const ACCESS_KEY = "zerx.accessToken";
const REFRESH_KEY = "zerx.refreshToken";
const SESSION_KEY = "zerx.sessionId";

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY);
}

export function getSessionId(): string | null {
  return localStorage.getItem(SESSION_KEY);
}

export function setTokens(accessToken: string, refreshToken: string, sessionId?: string): void {
  localStorage.setItem(ACCESS_KEY, accessToken);
  localStorage.setItem(REFRESH_KEY, refreshToken);
  if (sessionId !== undefined) {
    localStorage.setItem(SESSION_KEY, sessionId);
  }
}

export function clearTokens(): void {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(SESSION_KEY);
}

export function isAuthenticated(): boolean {
  return getAccessToken() !== null;
}

// AuthApi is the subset injected into the router context (no React hooks, so it
// is usable from beforeLoad).
export type AuthApi = {
  isAuthenticated: () => boolean;
  clearTokens: () => void;
  setTokens: (accessToken: string, refreshToken: string, sessionId?: string) => void;
};

export const auth: AuthApi = {
  isAuthenticated,
  clearTokens,
  setTokens,
};

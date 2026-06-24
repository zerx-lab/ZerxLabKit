// Token storage and a small auth surface shared with the router context.
const ACCESS_KEY = "zerx.accessToken";
const REFRESH_KEY = "zerx.refreshToken";

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY);
}

export function setTokens(accessToken: string, refreshToken: string): void {
  localStorage.setItem(ACCESS_KEY, accessToken);
  localStorage.setItem(REFRESH_KEY, refreshToken);
}

export function clearTokens(): void {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

export function isAuthenticated(): boolean {
  return getAccessToken() !== null;
}

// AuthApi is the subset injected into the router context (no React hooks, so it
// is usable from beforeLoad).
export type AuthApi = {
  isAuthenticated: () => boolean;
  clearTokens: () => void;
  setTokens: (accessToken: string, refreshToken: string) => void;
};

export const auth: AuthApi = {
  isAuthenticated,
  clearTokens,
  setTokens,
};

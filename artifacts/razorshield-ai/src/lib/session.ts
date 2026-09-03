export const SESSION_EXPIRED_EVENT = "razorshield-session-expired";
const SESSION_NOTICE_KEY = "razorshield_session_notice";
let refreshPromise: Promise<string | null> | null = null;

function apiUrl(path: string) {
  const base =
    (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(
      /\/$/,
      "",
    ) ?? "";
  return `${base}/api/v1/auth${path}`;
}

function tokenExpiresSoon(token: string) {
  try {
    const payload = JSON.parse(atob(token.split(".")[1])) as { exp?: number };
    return !payload.exp || payload.exp <= Date.now() / 1000 + 30;
  } catch {
    return true;
  }
}

export async function refreshSession(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = fetch(apiUrl("/refresh"), {
    method: "POST",
    credentials: "include",
  })
    .then(async (response) => {
      if (!response.ok) return null;
      const result = (await response.json()) as {
        access_token: string;
        user: unknown;
      };
      sessionStorage.setItem("razorshield_access_token", result.access_token);
      sessionStorage.setItem("razorshield_user", JSON.stringify(result.user));
      return result.access_token;
    })
    .catch(() => null)
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}

export async function getValidAccessToken(): Promise<string | null> {
  const token = sessionStorage.getItem("razorshield_access_token");
  if (token && !tokenExpiresSoon(token)) return token;
  return refreshSession();
}

export async function signOutSession() {
  try {
    await fetch(apiUrl("/logout"), {
      method: "POST",
      credentials: "include",
    });
  } finally {
    sessionStorage.removeItem("razorshield_access_token");
    sessionStorage.removeItem("razorshield_user");
  }
}

export function getSessionNotice() {
  return sessionStorage.getItem(SESSION_NOTICE_KEY) === "expired"
    ? "Your session expired. Sign in again to continue."
    : "";
}

export function clearSessionNotice() {
  sessionStorage.removeItem(SESSION_NOTICE_KEY);
}

export function expireSession() {
  sessionStorage.removeItem("razorshield_access_token");
  sessionStorage.removeItem("razorshield_user");
  sessionStorage.setItem(SESSION_NOTICE_KEY, "expired");
  window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
}

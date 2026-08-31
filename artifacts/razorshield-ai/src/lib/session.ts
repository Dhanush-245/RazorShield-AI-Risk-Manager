export const SESSION_EXPIRED_EVENT = "razorshield-session-expired";
const SESSION_NOTICE_KEY = "razorshield_session_notice";

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
